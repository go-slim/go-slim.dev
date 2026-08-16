import {
  createGoImportResponse,
  goImportWorkerPrefix,
} from './go-import.ts'
import { createLlmsResponse, llmsWorkerPrefix } from './llms.ts'

const gatewayCacheTtlSeconds = 60 * 60

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void
}

interface CacheStorageWithDefault extends CacheStorage {
  readonly default: Cache
}

function gatewayCacheKey(request: Request) {
  return new Request(request.url, { method: 'GET' })
}

function headResponse(response: Response) {
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

async function readGatewayCache(request: Request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return undefined

  const cache = (caches as CacheStorageWithDefault).default
  const response = await cache.match(gatewayCacheKey(request))
  if (!response) return undefined

  return request.method === 'HEAD' ? headResponse(response) : response
}

function cacheGatewayResponse(
  request: Request,
  response: Response,
  context: ExecutionContext,
) {
  if (request.method !== 'GET' || response.status !== 200) return response

  const cacheableResponse = new Response(response.body, response)
  cacheableResponse.headers.set(
    'Cache-Control',
    `public, max-age=${gatewayCacheTtlSeconds}, s-maxage=${gatewayCacheTtlSeconds}`,
  )
  const cache = (caches as CacheStorageWithDefault).default
  context.waitUntil(
    cache.put(gatewayCacheKey(request), cacheableResponse.clone()),
  )
  return cacheableResponse
}

export default {
  async fetch(
    request: Request,
    _environment: unknown,
    context: ExecutionContext,
  ) {
    const cachedResponse = await readGatewayCache(request)
    if (cachedResponse) return cachedResponse

    const url = new URL(request.url)
    let response: Response | undefined

    if (url.pathname.startsWith(`${goImportWorkerPrefix}/`)) {
      response =
        createGoImportResponse(request) ??
        new Response('Not Found', { status: 404 })
    } else if (url.pathname.startsWith(`${llmsWorkerPrefix}/`)) {
      response =
        (await createLlmsResponse(request)) ??
        new Response('Not Found', { status: 404 })
    } else {
      response =
        createGoImportResponse(request) ?? (await createLlmsResponse(request))

      if (!response) {
        url.protocol = 'https:'
        url.hostname = 'go-slim.dev'
        response = Response.redirect(url, 308)
      }
    }

    return cacheGatewayResponse(request, response, context)
  },
}
