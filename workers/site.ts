import {
  handleCloudflareAiRequest,
  type AiBinding,
  type AiBudgetNamespace,
  type AiExecutionContext,
} from './cloudflare-ai.ts'
import { createLlmsResponse, llmsWorkerPrefix } from './llms.ts'

export { AiDailyBudget } from './ai-budget.ts'

interface AssetsBinding {
  fetch(request: Request): Promise<Response>
}

interface Env {
  AI: AiBinding
  AI_BUDGET: AiBudgetNamespace
  ASSETS: AssetsBinding
}

export default {
  async fetch(request: Request, env: Env, context: AiExecutionContext) {
    const url = new URL(request.url)

    if (url.pathname === '/api/ai') {
      return handleCloudflareAiRequest(
        request,
        env.AI,
        env.AI_BUDGET,
        context,
      )
    }

    if (url.pathname.startsWith(`${llmsWorkerPrefix}/`)) {
      return (
        (await createLlmsResponse(request)) ??
        new Response('Not Found', { status: 404 })
      )
    }

    const llmsResponse = await createLlmsResponse(request)
    if (llmsResponse) return llmsResponse

    return env.ASSETS.fetch(request)
  },
}
