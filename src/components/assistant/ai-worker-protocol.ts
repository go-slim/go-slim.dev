import type { LocalAiModelId } from '#data/ai-models.ts'

export type LlmMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type AiWorkerRequest =
  | { type: 'check-cache'; requestId: number; modelId: LocalAiModelId }
  | { type: 'initialize'; requestId: number; modelId: LocalAiModelId }
  | { type: 'generate'; requestId: number; messages: LlmMessage[] }

export type AiWorkerResponse =
  | {
      type: 'cache-status'
      requestId: number
      modelId: LocalAiModelId
      cached: boolean
    }
  | {
      type: 'cache-error'
      requestId: number
      modelId: LocalAiModelId
      message: string
    }
  | {
      type: 'progress'
      requestId: number
      modelId: LocalAiModelId
      progress: number
    }
  | { type: 'ready'; requestId: number; modelId: LocalAiModelId }
  | {
      type: 'initialization-error'
      requestId: number
      modelId: LocalAiModelId
      message: string
    }
  | { type: 'delta'; requestId: number; content: string }
  | { type: 'generation-complete'; requestId: number }
  | { type: 'generation-error'; requestId: number; message: string }
