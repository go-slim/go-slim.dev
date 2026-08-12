import type { ContentLocale } from '#lib/content-types.ts'
import {
  getPagefind,
  normalizePagefindUrl,
  type PagefindData,
  type PagefindResult,
} from '#components/search/pagefind.ts'

export type AiSource = {
  url: string
  title: string
  section: string
  content: string
}

const sourceLimit = 5
const candidateLimit = 12
const retrievalBudgets: Record<
  ContentLocale,
  { sourceCharacters: number; totalCharacters: number }
> = {
  'en-US': { sourceCharacters: 900, totalCharacters: 3_600 },
  'zh-Hans': { sourceCharacters: 550, totalCharacters: 2_200 },
}

function decodeEntities(value: string): string {
  const textarea = document.createElement('textarea')
  textarea.innerHTML = value
  return textarea.value
}

function normalizeContent(value: string): string {
  return decodeEntities(value)
    .replace(/\u200B/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function queryTerms(question: string, locale: ContentLocale): string[] {
  const terms = new Set<string>()
  for (const match of question.matchAll(
    /[A-Za-z][A-Za-z0-9]*(?:[._/-][A-Za-z0-9]+)*/g,
  )) {
    terms.add(match[0].toLocaleLowerCase(locale))
  }

  if (typeof Intl.Segmenter !== 'undefined') {
    const segmenter = new Intl.Segmenter(locale === 'zh-Hans' ? 'zh' : 'en', {
      granularity: 'word',
    })
    for (const part of segmenter.segment(question)) {
      if (part.isWordLike && part.segment.trim().length >= 2) {
        terms.add(part.segment.trim().toLocaleLowerCase(locale))
      }
    }
  }

  return Array.from(terms).sort((left, right) => right.length - left.length)
}

function fallbackQueries(question: string, locale: ContentLocale): string[] {
  const terms = queryTerms(question, locale)
  const identifiers = terms.filter((term) => /[a-z][a-z0-9._/-]/i.test(term))
  const candidates = [identifiers.join(' '), ...terms.slice(0, 3)]
  const original = question.trim().toLocaleLowerCase(locale)
  return Array.from(new Set(candidates))
    .map((query) => query.trim())
    .filter((query) => query !== '' && query.toLocaleLowerCase(locale) !== original)
    .slice(0, 2)
}

function contentWindow(
  content: string,
  question: string,
  locale: ContentLocale,
  characterLimit: number,
): string {
  const normalized = normalizeContent(content)
  const lower = normalized.toLocaleLowerCase(locale)
  const positions = queryTerms(question, locale)
    .map((term) => lower.indexOf(term))
    .filter((position) => position >= 0)
  const match = positions.length > 0 ? Math.min(...positions) : 0
  const start = Math.max(0, match - 300)
  const end = Math.min(normalized.length, start + characterLimit)
  return normalized.slice(start, end)
}

function relevantContent(
  data: PagefindData,
  question: string,
  locale: ContentLocale,
  characterLimit: number,
): { section: string; url: string; content: string } {
  const matches = (data.sub_results ?? [])
    .slice(0, 2)
    .map((result) => normalizeContent(result.plain_excerpt ?? result.excerpt))
    .filter(Boolean)
  const matchedText = matches.join(' ')
  const window = contentWindow(data.content, question, locale, characterLimit)
  const content = normalizeContent(
    matchedText.length >= 500 ? matchedText : `${matchedText} ${window}`,
  ).slice(0, characterLimit)
  const first = data.sub_results?.[0]

  return {
    section: normalizeContent(first?.title ?? data.meta.section ?? ''),
    url: normalizePagefindUrl(first?.url ?? data.url),
    content,
  }
}

async function rankedCandidates(
  question: string,
  locale: ContentLocale,
): Promise<PagefindResult[]> {
  const pagefind = await getPagefind(locale)
  const queries = [question.trim(), ...fallbackQueries(question, locale)]
  const responses = await Promise.all(
    queries.map((query) =>
      pagefind.search(query, { filters: { locale: [locale] } }),
    ),
  )
  const candidates = new Map<
    string,
    { result: PagefindResult; reciprocalRank: number }
  >()

  for (const response of responses) {
    response.results.slice(0, candidateLimit).forEach((result, rank) => {
      const existing = candidates.get(result.id)
      const reciprocalRank = 1 / (60 + rank + 1)
      if (existing === undefined) {
        candidates.set(result.id, { result, reciprocalRank })
      } else {
        existing.reciprocalRank += reciprocalRank
      }
    })
  }

  return Array.from(candidates.values())
    .sort((left, right) => right.reciprocalRank - left.reciprocalRank)
    .map(({ result }) => result)
}

export async function retrieveAiSources(
  question: string,
  locale: ContentLocale,
): Promise<AiSource[]> {
  const budget = retrievalBudgets[locale]
  const candidates = await rankedCandidates(question, locale)
  const loaded = await Promise.allSettled(
    candidates.slice(0, candidateLimit).map((result) => result.data()),
  )
  const seen = new Set<string>()
  const sources: AiSource[] = []
  let remainingCharacters = budget.totalCharacters

  for (const result of loaded) {
    if (sources.length >= sourceLimit || remainingCharacters <= 0) break
    if (result.status !== 'fulfilled') continue

    const relevant = relevantContent(
      result.value,
      question,
      locale,
      budget.sourceCharacters,
    )
    if (relevant.content === '') continue
    const canonicalUrl = relevant.url.split('#', 1)[0]
    if (seen.has(canonicalUrl)) continue

    const content = relevant.content.slice(0, remainingCharacters)
    seen.add(canonicalUrl)
    sources.push({
      url: relevant.url,
      title: normalizeContent(result.value.meta.title || canonicalUrl),
      section: relevant.section,
      content,
    })
    remainingCharacters -= content.length
  }

  return sources
}

export function sourcesAsContext(sources: readonly AiSource[]): string {
  return sources
    .map((source, index) =>
      [
        `<source index="${index + 1}">`,
        `Reference label: ${source.section || source.title}`,
        'Evidence:',
        source.content,
        '</source>',
      ].filter(Boolean).join('\n'),
    )
    .join('\n\n')
}
