type AiMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type AiBinding = {
  run(
    model: string,
    input: {
      messages: AiMessage[]
      max_completion_tokens: number
      reasoning_effort: null
      chat_template_kwargs: { enable_thinking: false }
      temperature: number
      stream: true
    },
  ): Promise<ReadableStream<Uint8Array>>
}

interface DurableObjectStubLike {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
}

export interface AiBudgetNamespace {
  idFromName(name: string): unknown
  get(id: unknown): DurableObjectStubLike
}

export interface AiExecutionContext {
  waitUntil(promise: Promise<unknown>): void
}

export interface AiBudgetStatus {
  available: boolean
  level: 'normal' | 'low' | 'exhausted'
  limit: number
  used: number
  reserved: number
  remaining: number
  resetAt: string
}

interface AiUsage {
  prompt_tokens?: number
  completion_tokens?: number
  input_tokens?: number
  output_tokens?: number
}

const cloudflareModel = '@cf/zai-org/glm-4.7-flash'
const maximumBodyBytes = 128 * 1024
const maximumMessages = 16
const maximumMessageCharacters = 96_000
const maximumCompletionTokens = 1_024
const inputNeuronsPerToken = 5_500 / 1_000_000
const outputNeuronsPerToken = 36_400 / 1_000_000

function jsonError(
  status: number,
  error: string,
  code?: string,
  extra?: Record<string, unknown>,
) {
  return Response.json({ error, code, ...extra }, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function parseMessages(value: unknown): AiMessage[] | undefined {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > maximumMessages
  ) {
    return undefined
  }

  let characters = 0
  let systemMessages = 0
  let userMessages = 0
  const messages: AiMessage[] = []
  for (const [index, candidate] of value.entries()) {
    if (!candidate || typeof candidate !== 'object') return undefined
    const { role, content } = candidate as Record<string, unknown>
    if (
      (role !== 'system' && role !== 'user' && role !== 'assistant') ||
      typeof content !== 'string' ||
      content.length === 0
    ) {
      return undefined
    }
    characters += content.length
    if (characters > maximumMessageCharacters) return undefined
    if (role === 'system') {
      systemMessages += 1
      if (index !== 0 || systemMessages > 1) return undefined
    }
    if (role === 'user') userMessages += 1
    messages.push({ role, content })
  }
  return userMessages > 0 ? messages : undefined
}

function budgetStub(namespace: AiBudgetNamespace) {
  return namespace.get(namespace.idFromName('go-slim-ai-daily-budget'))
}

async function budgetRequest<T>(
  namespace: AiBudgetNamespace,
  pathname: string,
  payload?: Record<string, unknown>,
) {
  const response = await budgetStub(namespace).fetch(
    `https://ai-budget.internal${pathname}`,
    payload
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      : undefined,
  )
  const value = (await response.json()) as T
  return { response, value }
}

function estimatedInputTokens(messages: AiMessage[]) {
  return messages.reduce(
    (total, message) => total + Array.from(message.content).length,
    0,
  )
}

function neuronsForUsage(inputTokens: number, outputTokens: number) {
  return Math.ceil(
    inputTokens * inputNeuronsPerToken + outputTokens * outputNeuronsPerToken,
  )
}

function reservedNeurons(messages: AiMessage[]) {
  return neuronsForUsage(
    estimatedInputTokens(messages),
    maximumCompletionTokens,
  )
}

function measuredNeurons(usage: AiUsage | undefined) {
  if (!usage) return undefined
  const input = usage.prompt_tokens ?? usage.input_tokens
  const output = usage.completion_tokens ?? usage.output_tokens
  if (typeof input !== 'number' || typeof output !== 'number') return undefined
  return neuronsForUsage(input, output)
}

function usageFromEvent(event: string) {
  const data = event
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
  if (!data || data === '[DONE]') return undefined

  try {
    const payload = JSON.parse(data) as { usage?: AiUsage }
    return payload.usage
  } catch {
    return undefined
  }
}

async function readUsage(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let usage: AiUsage | undefined

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const events = buffer.split(/\r?\n\r?\n/)
    buffer = events.pop() ?? ''
    for (const event of events) usage = usageFromEvent(event) ?? usage
    if (done) break
  }
  if (buffer.trim()) usage = usageFromEvent(buffer) ?? usage
  return usage
}

export async function handleCloudflareAiRequest(
  request: Request,
  ai: AiBinding,
  budget: AiBudgetNamespace,
  context: AiExecutionContext,
) {
  if (request.method === 'GET') {
    const { response, value } = await budgetRequest<AiBudgetStatus>(
      budget,
      '/status',
    )
    return Response.json(value, {
      status: response.status,
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }

  if (request.method !== 'POST') {
    return new Response(null, {
      status: 405,
      headers: { Allow: 'GET, POST' },
    })
  }

  const fetchSite = request.headers.get('Sec-Fetch-Site')
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'same-site') {
    return jsonError(403, 'Cross-site AI requests are not allowed.')
  }

  const contentLength = Number(request.headers.get('Content-Length') ?? 0)
  if (contentLength > maximumBodyBytes) {
    return jsonError(413, 'The AI request is too large.')
  }

  let payload: unknown
  try {
    const body = await request.text()
    if (new TextEncoder().encode(body).byteLength > maximumBodyBytes) {
      return jsonError(413, 'The AI request is too large.')
    }
    payload = JSON.parse(body)
  } catch {
    return jsonError(400, 'The AI request must contain valid JSON.')
  }

  const messages = parseMessages(
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>).messages
      : undefined,
  )
  if (!messages) return jsonError(400, 'The AI messages are invalid.')

  const reservationId = crypto.randomUUID()
  const reservation = reservedNeurons(messages)
  const reserved = await budgetRequest<AiBudgetStatus>(budget, '/reserve', {
    reservationId,
    amount: reservation,
  })
  if (!reserved.response.ok) {
    return jsonError(
      429,
      'The daily Cloudflare AI budget is exhausted.',
      'AI_DAILY_BUDGET_EXHAUSTED',
      reserved.value as unknown as Record<string, unknown>,
    )
  }

  try {
    const upstream = await ai.run(cloudflareModel, {
      messages,
      max_completion_tokens: maximumCompletionTokens,
      reasoning_effort: null,
      chat_template_kwargs: { enable_thinking: false },
      temperature: 0,
      stream: true,
    })
    const [clientStream, meteringStream] = upstream.tee()
    context.waitUntil(
      readUsage(meteringStream)
        .then((usage) =>
          budgetRequest(budget, '/settle', {
            reservationId,
            amount: measuredNeurons(usage) ?? reservation,
          }),
        )
        .catch(() =>
          budgetRequest(budget, '/settle', {
            reservationId,
            amount: reservation,
          }),
        ),
    )

    return new Response(clientStream, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/event-stream; charset=utf-8',
        'X-AI-Budget-Remaining': String(reserved.value.remaining),
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    await budgetRequest(budget, '/release', { reservationId }).catch(
      () => undefined,
    )
    console.error('Workers AI request failed', error)
    const message = error instanceof Error ? error.message : String(error)
    if (/quota|limit|neuron|exceed/i.test(message)) {
      const status = await budgetRequest<AiBudgetStatus>(budget, '/status')
        .then(({ value }) => value)
        .catch(() => undefined)
      return jsonError(
        429,
        'Cloudflare Workers AI has no remaining capacity today.',
        'AI_DAILY_BUDGET_EXHAUSTED',
        status ? { ...status, available: false, level: 'exhausted' } : undefined,
      )
    }
    return jsonError(502, 'Cloudflare Workers AI could not generate a response.')
  }
}
