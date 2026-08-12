import type { AlpineComponent } from 'alpinejs'
import { formatMessage } from '#i18n/format.ts'
import type { ContentLocale } from '#lib/content-types.ts'
import {
  getPagefind,
  normalizePagefindUrl,
  type PagefindData,
  type PagefindResult,
} from './pagefind.ts'

export type SearchStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error'

export type SearchResultItem = {
  id: string
  url: string
  title: string
  excerpt: string
  group: string
  score: number
}

export type SearchResultGroup = {
  id: string
  label: string
  items: SearchResultItem[]
}

export type SearchDialogOptions = {
  locale: ContentLocale
  searchPath: string
  viewAllResultsTemplates: {
    one: string
    other: string
  }
  unavailableMessage: string
  groupLabels: {
    site: string
    libraries: string
    blog: string
    community: string
  }
}

export interface SearchDialogComponent {
  dialogOpen: boolean
  searchQuery: string
  searchStatus: SearchStatus
  searchResults: SearchResultItem[]
  searchError: string
  resultCount: number
  activeResultIndex: number
  searchTimer: number | null
  searchSequence: number
  scrollTop: number
  scrollLocked: boolean
  restoreTriggerFocus: boolean
  bodyOverflow: string
  bodyPaddingRight: string
  readonly viewAllResultsLabel: string
  readonly viewAllResultsHref: string
  readonly showViewAllResults: boolean
  readonly resultGroups: SearchResultGroup[]
  openDialog(): void
  closeDialog(restoreFocus?: boolean): void
  openAssistant(): void
  focusSearch(): void
  queueSearch(): void
  performSearch(): Promise<void>
  clearSearch(): void
  focusResult(direction: 1 | -1): void
  focusBoundaryResult(last?: boolean): void
  submitSearch(): void
  selectResult(index: number): void
  getResultElements(): HTMLAnchorElement[]
  getViewport(): HTMLElement | null
  rememberScrollPosition(): void
  restoreScrollPosition(): void
  lockScroll(): void
  unlockScroll(): void
  handleClose(): void
  destroy(): void
}

const resultLimit = 8
const searchDelay = 140

function decodeEntities(value: string): string {
  const textarea = document.createElement('textarea')
  textarea.innerHTML = value
  return textarea.value.replace(/\s+/g, ' ').trim()
}

function resultGroup(
  url: string,
  data: PagefindData,
  options: SearchDialogOptions,
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
  options: SearchDialogOptions,
): Promise<SearchResultItem> {
  const data = await result.data()
  const url = normalizePagefindUrl(data.url)
  const title = decodeEntities(
    data.meta.title || data.sub_results?.[0]?.title || url,
  )
  const excerpt = decodeEntities(
    data.plain_excerpt ?? data.sub_results?.[0]?.plain_excerpt ?? '',
  )

  return {
    id: result.id,
    url,
    title,
    excerpt,
    group: resultGroup(url, data, options),
    score: result.score ?? 0,
  }
}

export const searchDialog = (
  options: SearchDialogOptions,
): AlpineComponent<SearchDialogComponent> => ({
  dialogOpen: false,
  searchQuery: '',
  searchStatus: 'idle',
  searchResults: [],
  searchError: '',
  resultCount: 0,
  activeResultIndex: -1,
  searchTimer: null,
  searchSequence: 0,
  scrollTop: 0,
  scrollLocked: false,
  restoreTriggerFocus: true,
  bodyOverflow: '',
  bodyPaddingRight: '',

  get viewAllResultsLabel() {
    const plural = new Intl.PluralRules(options.locale).select(this.resultCount)
    return formatMessage(
      options.viewAllResultsTemplates[plural === 'one' ? 'one' : 'other'],
      { count: this.resultCount },
      options.locale,
    )
  },

  get viewAllResultsHref() {
    const parameters = new URLSearchParams({ q: this.searchQuery.trim() })
    return `${options.searchPath}?${parameters.toString()}`
  },

  get showViewAllResults() {
    return this.resultCount > resultLimit
  },

  get resultGroups() {
    const groups = new Map<string, SearchResultGroup>()
    for (const item of this.searchResults) {
      const id = item.group.toLocaleLowerCase(options.locale)
      const group = groups.get(id)
      if (group === undefined) {
        groups.set(id, { id, label: item.group, items: [item] })
      } else {
        group.items.push(item)
      }
    }
    return Array.from(groups.values())
  },

  openDialog() {
    const dialog = this.$refs.dialog
    if (!(dialog instanceof HTMLDialogElement) || dialog.open) return

    this.lockScroll()

    try {
      dialog.showModal()
      this.dialogOpen = true
      void this.$nextTick(() => {
        this.restoreScrollPosition()
        this.focusSearch()
      })
    } catch (error) {
      this.unlockScroll()
      throw error
    }
  },

  closeDialog(restoreFocus = true) {
    this.restoreTriggerFocus = restoreFocus
    const dialog = this.$refs.dialog
    if (dialog instanceof HTMLDialogElement && dialog.open) {
      dialog.close()
      return
    }

    this.dialogOpen = false
    this.unlockScroll()
  },

  openAssistant() {
    const query = this.searchQuery.trim()
    if (query === '') return

    this.$store.ai.draft = query
    this.$store.ai.openPanel()
    this.closeDialog(false)
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event('go-slim-composer-focus'))
    })
  },

  focusSearch() {
    window.dispatchEvent(new Event('go-slim-pagefind-focus'))
  },

  queueSearch() {
    if (this.searchTimer !== null) window.clearTimeout(this.searchTimer)
    this.searchTimer = null

    if (this.searchQuery.trim() === '') {
      this.clearSearch()
      return
    }

    this.searchStatus = 'loading'
    this.searchError = ''
    this.searchTimer = window.setTimeout(() => {
      this.searchTimer = null
      void this.performSearch()
    }, searchDelay)
  },

  async performSearch() {
    const query = this.searchQuery.trim()
    if (query === '') {
      this.clearSearch()
      return
    }

    const sequence = ++this.searchSequence
    this.searchStatus = 'loading'
    this.searchError = ''
    this.activeResultIndex = -1

    try {
      const pagefind = await getPagefind(options.locale)
      const response = await pagefind.search(query, {
        filters: { locale: [options.locale] },
      })
      const loaded = await Promise.allSettled(
        response.results
          .slice(0, resultLimit)
          .map((result) => loadResult(result, options)),
      )
      if (sequence !== this.searchSequence || query !== this.searchQuery.trim()) {
        return
      }

      const seen = new Set<string>()
      this.searchResults = loaded.flatMap((result) => {
        if (result.status !== 'fulfilled' || seen.has(result.value.url)) return []
        seen.add(result.value.url)
        return [result.value]
      })
      this.resultCount = response.results.length
      this.searchStatus = this.searchResults.length > 0 ? 'ready' : 'empty'
      this.scrollTop = 0
      void this.$nextTick(() => this.restoreScrollPosition())
    } catch (error) {
      if (sequence !== this.searchSequence) return
      console.error('Pagefind search failed.', error)
      this.searchResults = []
      this.resultCount = 0
      this.searchError = options.unavailableMessage
      this.searchStatus = 'error'
    }
  },

  clearSearch() {
    if (this.searchTimer !== null) window.clearTimeout(this.searchTimer)
    this.searchTimer = null
    this.searchSequence += 1
    this.searchQuery = ''
    this.searchStatus = 'idle'
    this.searchResults = []
    this.searchError = ''
    this.resultCount = 0
    this.activeResultIndex = -1
    this.scrollTop = 0
    void this.$nextTick(() => this.restoreScrollPosition())
  },

  focusResult(direction) {
    const results = this.getResultElements()
    if (results.length === 0) return

    const focusedIndex = results.indexOf(document.activeElement as HTMLAnchorElement)
    const current = focusedIndex >= 0 ? focusedIndex : this.activeResultIndex
    const next = current < 0
      ? direction === 1 ? 0 : results.length - 1
      : (current + direction + results.length) % results.length
    this.selectResult(next)
  },

  focusBoundaryResult(last = false) {
    const results = this.getResultElements()
    if (results.length === 0) return
    this.selectResult(last ? results.length - 1 : 0)
  },

  submitSearch() {
    const results = this.getResultElements()
    if (results.length === 0) return
    const index = this.activeResultIndex >= 0 ? this.activeResultIndex : 0
    results[index]?.click()
  },

  selectResult(index) {
    const result = this.getResultElements()[index]
    if (result === undefined) return
    this.activeResultIndex = index
    result.focus()
    result.scrollIntoView({ block: 'nearest' })
  },

  getResultElements() {
    const dialog = this.$refs.dialog
    if (!(dialog instanceof HTMLDialogElement)) return []
    return Array.from(
      dialog.querySelectorAll<HTMLAnchorElement>('[data-search-result]'),
    )
  },

  getViewport() {
    const dialog = this.$refs.dialog
    if (!(dialog instanceof HTMLDialogElement)) return null

    return dialog.querySelector<HTMLElement>(
      '[data-search-dialog-scrollarea] [data-slot="viewport"]',
    )
  },

  rememberScrollPosition() {
    const viewport = this.getViewport()
    if (viewport === null) return
    this.scrollTop = viewport.scrollTop
  },

  restoreScrollPosition() {
    const viewport = this.getViewport()
    if (viewport === null) return
    viewport.scrollTop = this.scrollTop
  },

  lockScroll() {
    if (this.scrollLocked) return

    const body = document.body
    const scrollbarGap = Math.max(
      0,
      window.innerWidth - document.documentElement.clientWidth,
    )
    const computedPadding = Number.parseFloat(
      window.getComputedStyle(body).paddingRight,
    )

    this.bodyOverflow = body.style.overflow
    this.bodyPaddingRight = body.style.paddingRight
    this.scrollLocked = true
    body.style.overflow = 'hidden'

    if (scrollbarGap > 0) {
      const padding = Number.isFinite(computedPadding) ? computedPadding : 0
      body.style.paddingRight = `${padding + scrollbarGap}px`
    }
  },

  unlockScroll() {
    if (!this.scrollLocked) return

    const body = document.body
    body.style.overflow = this.bodyOverflow
    body.style.paddingRight = this.bodyPaddingRight
    this.scrollLocked = false
  },

  handleClose() {
    this.rememberScrollPosition()
    this.dialogOpen = false
    this.unlockScroll()

    const trigger = this.$refs.trigger
    if (
      this.restoreTriggerFocus &&
      trigger instanceof HTMLElement &&
      trigger.isConnected
    ) {
      trigger.focus()
    }
    this.restoreTriggerFocus = true
  },

  destroy() {
    if (this.searchTimer !== null) window.clearTimeout(this.searchTimer)
    this.searchTimer = null
    this.searchSequence += 1
    this.unlockScroll()
  },
})
