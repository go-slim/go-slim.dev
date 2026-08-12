/// <reference lib="webworker" />

import {
  CreateMLCEngine,
  hasModelInCache,
  type MLCEngineInterface,
} from '@mlc-ai/web-llm'
import type {
  AiWorkerRequest,
  AiWorkerResponse,
} from './ai-worker-protocol.ts'

let engine: MLCEngineInterface | undefined

function respond(message: AiWorkerResponse): void {
  self.postMessage(message)
}

self.addEventListener('message', async (event: MessageEvent<AiWorkerRequest>) => {
  const request = event.data

  if (request.type === 'check-cache') {
    try {
      const cached = await hasModelInCache(request.modelId)
      respond({
        type: 'cache-status',
        requestId: request.requestId,
        modelId: request.modelId,
        cached,
      })
    } catch (error) {
      respond({
        type: 'cache-error',
        requestId: request.requestId,
        modelId: request.modelId,
        message: error instanceof Error ? error.message : String(error),
      })
    }
    return
  }

  if (request.type === 'initialize') {
    try {
      engine = await CreateMLCEngine(request.modelId, {
        initProgressCallback: ({ progress }) => {
          respond({
            type: 'progress',
            requestId: request.requestId,
            modelId: request.modelId,
            progress,
          })
        },
      })
      respond({
        type: 'ready',
        requestId: request.requestId,
        modelId: request.modelId,
      })
    } catch (error) {
      respond({
        type: 'initialization-error',
        requestId: request.requestId,
        modelId: request.modelId,
        message: error instanceof Error ? error.message : String(error),
      })
    }
    return
  }

  if (engine === undefined) {
    respond({
      type: 'generation-error',
      requestId: request.requestId,
      message: 'The local model is not initialized.',
    })
    return
  }

  try {
    const completion = await engine.chat.completions.create({
      messages: request.messages,
      temperature: 0.1,
      max_tokens: 512,
      stream: true,
    })

    for await (const chunk of completion) {
      const content = chunk.choices[0]?.delta.content ?? ''
      if (content !== '') {
        respond({ type: 'delta', requestId: request.requestId, content })
      }
    }
    respond({ type: 'generation-complete', requestId: request.requestId })
  } catch (error) {
    respond({
      type: 'generation-error',
      requestId: request.requestId,
      message: error instanceof Error ? error.message : String(error),
    })
  }
})
