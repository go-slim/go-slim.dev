import type { LlmMessage } from './ai-worker-protocol.ts'

export type CloudflareAiBudgetLevel = 'normal' | 'low' | 'exhausted'

export interface CloudflareAiBudgetStatus {
  available: boolean
  level: CloudflareAiBudgetLevel
  limit: number
  used: number
  reserved: number
  remaining: number
  resetAt: string
}

type CloudflareAiErrorPayload = Partial<CloudflareAiBudgetStatus> & {
  error?: string
  code?: string
}

export class CloudflareAiError extends Error {
  readonly status: number
  readonly code: string | undefined
  readonly budget: Partial<CloudflareAiBudgetStatus> | undefined

  constructor(
    message: string,
    status: number,
    code?: string,
    budget?: Partial<CloudflareAiBudgetStatus>,
  ) {
    super(message)
    this.name = 'CloudflareAiError'
    this.status = status
    this.code = code
    this.budget = budget
  }
}

const isBudgetLevel = (value: unknown): value is CloudflareAiBudgetLevel =>
  value === 'normal' || value === 'low' || value === 'exhausted'

function parseBudgetStatus(value: unknown): CloudflareAiBudgetStatus {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Cloudflare AI returned an invalid budget status.')
  }

  const status = value as Record<string, unknown>
  if (
    typeof status.available !== 'boolean' ||
    !isBudgetLevel(status.level) ||
    typeof status.limit !== 'number' ||
    typeof status.used !== 'number' ||
    typeof status.reserved !== 'number' ||
    typeof status.remaining !== 'number' ||
    typeof status.resetAt !== 'string'
  ) {
    throw new Error('Cloudflare AI returned an invalid budget status.')
  }

  return {
    available: status.available,
    level: status.level,
    limit: status.limit,
    used: status.used,
    reserved: status.reserved,
    remaining: status.remaining,
    resetAt: status.resetAt,
  }
}

function eventData(event: string): string {
  return event
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
}

function deltaFromEvent(event: string): string {
  const data = eventData(event)
  if (data === '' || data === '[DONE]') return ''

  const payload = JSON.parse(data) as {
    response?: unknown
    choices?: Array<{ delta?: { content?: unknown } }>
  }
  if (typeof payload.response === 'string') return payload.response

  const content = payload.choices?.[0]?.delta?.content
  return typeof content === 'string' ? content : ''
}

export async function readCloudflareAiStream(
  stream: ReadableStream<Uint8Array>,
  onDelta: (content: string) => void,
): Promise<void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const events = buffer.split(/\r?\n\r?\n/)
    buffer = events.pop() ?? ''
    for (const event of events) {
      const content = deltaFromEvent(event)
      if (content !== '') onDelta(content)
    }
    if (done) break
  }

  if (buffer.trim() !== '') {
    const content = deltaFromEvent(buffer)
    if (content !== '') onDelta(content)
  }
}

export class CloudflareAiClient {
  private generationController: AbortController | null = null

  async getStatus(signal?: AbortSignal): Promise<CloudflareAiBudgetStatus> {
    const response = await fetch('/api/ai', {
      headers: { Accept: 'application/json' },
      signal,
    })
    if (!response.ok) throw await this.createResponseError(response)
    return parseBudgetStatus(await response.json())
  }

  async generate(
    messages: readonly LlmMessage[],
    onDelta: (content: string) => void,
  ): Promise<void> {
    if (this.generationController !== null) {
      throw new Error('Cloudflare AI is already generating a response.')
    }

    const controller = new AbortController()
    this.generationController = controller
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages }),
        signal: controller.signal,
      })
      if (!response.ok) throw await this.createResponseError(response)
      if (response.body === null) {
        throw new Error('Cloudflare AI returned no response stream.')
      }
      await readCloudflareAiStream(response.body, onDelta)
    } finally {
      if (this.generationController === controller) {
        this.generationController = null
      }
    }
  }

  cancel(): void {
    this.generationController?.abort()
    this.generationController = null
  }

  private async createResponseError(
    response: Response,
  ): Promise<CloudflareAiError> {
    const payload = (await response.json().catch(() => undefined)) as
      | CloudflareAiErrorPayload
      | undefined
    return new CloudflareAiError(
      payload?.error ?? `Cloudflare AI returned ${response.status}.`,
      response.status,
      payload?.code,
      payload,
    )
  }
}
