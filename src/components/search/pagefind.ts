import type { ContentLocale } from '#lib/content-types.ts'

export type PagefindSubResult = {
  title: string
  url: string
  excerpt: string
  plain_excerpt?: string
}

export type PagefindData = {
  url: string
  content: string
  excerpt: string
  plain_excerpt?: string
  sub_results?: PagefindSubResult[]
  meta: Record<string, string>
  filters?: Record<string, string[]>
}

export type PagefindResult = {
  id: string
  score?: number
  data(): Promise<PagefindData>
}

export type PagefindResponse = {
  results: PagefindResult[]
  unfilteredResultCount: number
}

export type PagefindInstance = {
  init(): Promise<void>
  search(
    query: string,
    options?: { filters?: Record<string, string[]> },
  ): Promise<PagefindResponse>
  destroy(): Promise<void>
}

type PagefindModule = {
  createInstance(options: {
    basePath: string
    language: string
    noWorker?: boolean
  }): PagefindInstance
}

const normalizedBaseUrl = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`
const pagefindBasePath = `${normalizedBaseUrl}pagefind/`
const pagefindModulePath = `${pagefindBasePath}pagefind.js`
const instances = new Map<string, Promise<PagefindInstance>>()

export async function releasePagefind(): Promise<void> {
  const pendingInstances = Array.from(instances.values())
  instances.clear()

  const loadedInstances = await Promise.allSettled(pendingInstances)
  await Promise.allSettled(
    loadedInstances.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value.destroy()] : [],
    ),
  )
}

export function normalizePagefindUrl(value: string): string {
  const suffixIndex = value.search(/[?#]/)
  const pathname = suffixIndex === -1 ? value : value.slice(0, suffixIndex)
  const suffix = suffixIndex === -1 ? '' : value.slice(suffixIndex)

  if (pathname === '/' || !pathname.endsWith('/')) return value
  return `${pathname.replace(/\/+$/, '')}${suffix}`
}

export function getPagefind(
  locale: ContentLocale,
  { noWorker = false }: { noWorker?: boolean } = {},
): Promise<PagefindInstance> {
  const key = `${locale}:${noWorker ? 'main' : 'worker'}`
  const existing = instances.get(key)
  if (existing !== undefined) return existing

  const pending = (async () => {
    const pagefind = await import(
      /* @vite-ignore */ pagefindModulePath
    ) as PagefindModule
    const instance = pagefind.createInstance({
      basePath: pagefindBasePath,
      language: locale.toLowerCase(),
      noWorker,
    })
    await instance.init()
    return instance
  })()

  instances.set(key, pending)
  void pending.catch(() => {
    if (instances.get(key) === pending) instances.delete(key)
  })
  return pending
}

window.addEventListener('pagehide', () => {
  void releasePagefind()
})
