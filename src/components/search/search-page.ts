import type { AlpineComponent } from 'alpinejs'
import { formatMessage } from '#i18n/format.ts'
import type { ContentLocale } from '#lib/content-types.ts'
import {
  getPagefind,
  normalizePagefindUrl,
  type PagefindData,
  type PagefindResult,
} from './pagefind.ts'

type SearchPageResult = {
  id: string
  url: string
  title: string
  excerpt: string
  group: string
}

type SearchPageGroup = {
  id: string
  label: string
  items: SearchPageResult[]
}

export type SearchPageOptions = {
  locale: ContentLocale
  path: string
  unavailableMessage: string
  resultCountTemplates: { one: string; other: string }
  pageStatusTemplate: string
  pageNumberTemplate: string
  groupLabels: {
    site: string
    libraries: string
    blog: string
    community: string
  }
}

export interface SearchPageComponent {
  query: string
  page: number
  status: 'idle' | 'loading' | 'ready' | 'empty' | 'error'
  results: SearchPageResult[]
  resultCount: number
  totalPages: number
  error: string
  readonly groups: SearchPageGroup[]
  readonly resultCountLabel: string
  readonly pageStatusLabel: string
  readonly paginationPages: number[]
  init(): void
  search(): Promise<void>
  pageHref(page: number): string
  pageNumberLabel(page: number): string
}

const pageSize = 10

function decodeEntities(value: string): string {
  const textarea = document.createElement('textarea')
  textarea.innerHTML = value
  return textarea.value.replace(/\s+/g, ' ').trim()
}

function groupLabel(
  url: string,
  data: PagefindData,
  options: SearchPageOptions,
): string {
  const pathname = new URL(url, window.location.origin).pathname
  const segments = pathname.split('/').filter(Boolean)
  if (segments[0] === 'zh-Hans') segments.shift()

  if (segments[0] === 'libraries') {
    return data.meta.library || segments[1] || options.groupLabels.libraries
  }
  if (segments[0] === 'blog') return options.groupLabels.blog
  if (segments[0] === 'community') return options.groupLabels.community
  return options.groupLabels.site
}

async function loadResult(
  result: PagefindResult,
  options: SearchPageOptions,
): Promise<SearchPageResult> {
  const data = await result.data()
  const url = normalizePagefindUrl(data.url)
  return {
    id: result.id,
    url,
    title: decodeEntities(
      data.meta.title || data.sub_results?.[0]?.title || url,
    ),
    excerpt: decodeEntities(
      data.plain_excerpt ?? data.sub_results?.[0]?.plain_excerpt ?? '',
    ),
    group: groupLabel(url, data, options),
  }
}

function readPage(value: string | null): number {
  const page = Number.parseInt(value ?? '', 10)
  return Number.isSafeInteger(page) && page > 0 ? page : 1
}

export const searchPage = (
  options: SearchPageOptions,
): AlpineComponent<SearchPageComponent> => ({
  query: '',
  page: 1,
  status: 'idle',
  results: [],
  resultCount: 0,
  totalPages: 0,
  error: '',

  get groups() {
    const groups = new Map<string, SearchPageGroup>()
    for (const result of this.results) {
      const id = result.group.toLocaleLowerCase(options.locale)
      const group = groups.get(id)
      if (group === undefined) {
        groups.set(id, { id, label: result.group, items: [result] })
      } else {
        group.items.push(result)
      }
    }
    return Array.from(groups.values())
  },

  get resultCountLabel() {
    const plural = new Intl.PluralRules(options.locale).select(this.resultCount)
    return formatMessage(
      options.resultCountTemplates[plural === 'one' ? 'one' : 'other'],
      { count: this.resultCount },
      options.locale,
    )
  },

  get pageStatusLabel() {
    return formatMessage(
      options.pageStatusTemplate,
      { page: this.page, pages: this.totalPages },
      options.locale,
    )
  },

  get paginationPages() {
    if (this.totalPages <= 1) return []
    const start = Math.max(1, Math.min(this.page - 2, this.totalPages - 4))
    const end = Math.min(this.totalPages, start + 4)
    return Array.from({ length: end - start + 1 }, (_, index) => start + index)
  },

  init() {
    const parameters = new URLSearchParams(window.location.search)
    this.query = parameters.get('q')?.trim() ?? ''
    this.page = readPage(parameters.get('page'))
    if (this.query !== '') void this.search()
  },

  async search() {
    const query = this.query.trim()
    if (query === '') {
      this.status = 'idle'
      return
    }

    this.status = 'loading'
    this.error = ''
    try {
      const pagefind = await getPagefind(options.locale)
      const response = await pagefind.search(query, {
        filters: { locale: [options.locale] },
      })
      this.resultCount = response.results.length
      this.totalPages = Math.ceil(this.resultCount / pageSize)
      if (this.totalPages === 0) {
        this.results = []
        this.status = 'empty'
        return
      }

      const requestedPage = this.page
      this.page = Math.min(this.page, this.totalPages)
      if (this.page !== requestedPage) {
        window.history.replaceState(null, '', this.pageHref(this.page))
      }
      const start = (this.page - 1) * pageSize
      const loaded = await Promise.allSettled(
        response.results
          .slice(start, start + pageSize)
          .map((result) => loadResult(result, options)),
      )
      const seen = new Set<string>()
      this.results = loaded.flatMap((result) => {
        if (result.status !== 'fulfilled' || seen.has(result.value.url)) return []
        seen.add(result.value.url)
        return [result.value]
      })
      this.status = this.results.length === 0 ? 'empty' : 'ready'
    } catch (error) {
      console.error('Pagefind search page failed.', error)
      this.results = []
      this.resultCount = 0
      this.totalPages = 0
      this.error = options.unavailableMessage
      this.status = 'error'
    }
  },

  pageHref(page) {
    const parameters = new URLSearchParams({
      q: this.query.trim(),
      page: String(Math.max(1, page)),
    })
    return `${options.path}?${parameters.toString()}`
  },

  pageNumberLabel(page) {
    return formatMessage(
      options.pageNumberTemplate,
      { page },
      options.locale,
    )
  },
})
