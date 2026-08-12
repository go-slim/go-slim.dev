import { getCollection, type CollectionEntry } from 'astro:content'
import type {
  ContentLocale,
  LibraryLlmsConfig,
  LibraryNavGroup,
  LibraryStatus,
  SidebarItem,
} from './content-types'
import { localePrefix } from './content-types'

type LocalizedText = string | Partial<Record<ContentLocale, string>>
type MetadataEntry = CollectionEntry<'libraryMetadata'>
type LibraryEntry = CollectionEntry<'libraries'>
type BlogEntry = CollectionEntry<'blog'>

type MetadataScope = {
  entry: MetadataEntry
  scope: 'group' | 'library' | 'locale'
  group: string
  groupOrder: number
  library?: string
  libraryOrder?: number
  locale?: ContentLocale
}

export type LibraryDocument = {
  entry: LibraryEntry
  group: string
  groupTitle: string
  groupOrder: number
  library: string
  libraryTitle: string
  libraryDescription: string
  libraryIcon: string
  libraryStatus: LibraryStatus
  libraryLlms?: LibraryLlmsConfig
  showInNavigation: boolean
  libraryOrder: number
  locale: ContentLocale
  slug: string
  orderPath: number[]
  href: string
  title: string
  sidebarTitle?: string
  icon?: string
  description: string
}

export type BlogDocument = {
  entry: BlogEntry
  locale: ContentLocale
  slug: string
  href: string
  title: string
  description: string
  publishedAt: string
  updatedAt?: string
  author: string
  tags: string[]
  draft: boolean
}

function parseOrderedSegment(segment: string, kind: string) {
  const match = /^(\d+)\.(.+)$/.exec(segment)
  if (!match) throw new Error(`Invalid ${kind} segment "${segment}".`)
  return { order: Number(match[1]), name: match[2] }
}

function withoutExtension(path: string) {
  return path.replace(/\.(?:md|mdx|ya?ml|json)$/i, '')
}

function sourcePath(
  entry: { id: string; filePath?: string },
  contentRoot: 'libraries' | 'blog',
) {
  const value = (entry.filePath ?? entry.id).replaceAll('\\', '/')
  const marker = `content/${contentRoot}/`
  const index = value.indexOf(marker)
  return index >= 0 ? value.slice(index + marker.length) : value
}

function normalizeLocale(value: string): ContentLocale {
  return value.toLowerCase() === 'zh-hans' ? 'zh-Hans' : 'en-US'
}

function metadataScope(entry: MetadataEntry): MetadataScope {
  const segments = withoutExtension(sourcePath(entry, 'libraries'))
    .replace(/(?:^|\/)\_meta$/, '')
    .split('/')
    .filter(Boolean)
  const group = parseOrderedSegment(segments[0], 'library group')
  const library = segments[1]
    ? parseOrderedSegment(segments[1], 'library')
    : undefined
  const locale = segments[2] ? normalizeLocale(segments[2]) : undefined

  return {
    entry,
    scope: locale ? 'locale' : library ? 'library' : 'group',
    group: group.name,
    groupOrder: group.order,
    library: library?.name,
    libraryOrder: library?.order,
    locale,
  }
}

function resolveLocalized(
  value: LocalizedText | undefined,
  locale: ContentLocale,
) {
  if (!value) return undefined
  if (typeof value === 'string') return value
  return value[locale] ?? value['en-US'] ?? Object.values(value)[0]
}

let libraryDocumentsPromise: Promise<LibraryDocument[]> | undefined

export function getLibraryDocuments() {
  libraryDocumentsPromise ??= Promise.all([
    getCollection('libraries'),
    getCollection('libraryMetadata'),
  ]).then(([entries, metadataEntries]) => {
    const metadata = metadataEntries.map(metadataScope)

    return entries.map((entry) => {
      const source = withoutExtension(sourcePath(entry, 'libraries'))
      const [groupSegment, librarySegment, localeValue, ...pageParts] =
        source.split('/')
      const group = parseOrderedSegment(groupSegment, 'library group')
      const library = parseOrderedSegment(librarySegment, 'library')
      const locale = normalizeLocale(localeValue)
      const pages = pageParts.map((part) =>
        parseOrderedSegment(part, 'library page')
      )
      const sourceSlug = pages.map((part) => part.name).join('/')
      const slug =
        sourceSlug === 'index'
          ? 'index'
          : sourceSlug.endsWith('/index')
            ? sourceSlug.slice(0, -'/index'.length)
            : sourceSlug
      const groupMeta = metadata.find(
        (item) => item.scope === 'group' && item.group === group.name,
      )
      const libraryMeta = metadata.find(
        (item) =>
          item.scope === 'library' &&
          item.group === group.name &&
          item.library === library.name,
      )
      const localeMeta = metadata.find(
        (item) =>
          item.scope === 'locale' &&
          item.group === group.name &&
          item.library === library.name &&
          item.locale === locale,
      )
      const libraryData = localeMeta?.entry.data ?? libraryMeta?.entry.data
      const llms =
        localeMeta?.entry.data.llms ?? libraryMeta?.entry.data.llms
      const sidebarIcon =
        entry.data.icon ??
        localeMeta?.entry.data.sidebarIcons[slug] ??
        libraryMeta?.entry.data.sidebarIcons[slug] ??
        groupMeta?.entry.data.sidebarIcons[slug]

      return {
        entry,
        group: group.name,
        groupTitle:
          resolveLocalized(groupMeta?.entry.data.title, locale) ?? group.name,
        groupOrder: group.order,
        library: library.name,
        libraryTitle:
          resolveLocalized(libraryData?.title, locale) ?? library.name,
        libraryDescription:
          resolveLocalized(libraryData?.description, locale) ??
          entry.data.description,
        libraryIcon: libraryData?.icon ?? entry.data.icon ?? 'grid',
        libraryStatus: libraryData?.status ?? 'stable',
        libraryLlms: llms ? { ...llms, files: [...llms.files] } : undefined,
        showInNavigation: libraryData?.showInNavigation ?? true,
        libraryOrder: library.order,
        locale,
        slug,
        orderPath: pages.map((page) => page.order),
        href: `${localePrefix(locale)}/libraries/${library.name}${
          slug === 'index' ? '' : `/${slug}`
        }`,
        title: entry.data.title,
        sidebarTitle: entry.data.sidebarTitle,
        icon: sidebarIcon,
        description: entry.data.description,
      } satisfies LibraryDocument
    })
  })

  return libraryDocumentsPromise
}

function byPageOrder(left: LibraryDocument, right: LibraryDocument) {
  const length = Math.max(left.orderPath.length, right.orderPath.length)
  for (let index = 0; index < length; index += 1) {
    const difference =
      (left.orderPath[index] ?? Number.MAX_SAFE_INTEGER) -
      (right.orderPath[index] ?? Number.MAX_SAFE_INTEGER)
    if (difference !== 0) return difference
  }
  return left.title.localeCompare(right.title)
}

async function getLibraryGroups(
  locale: ContentLocale,
  navigationOnly: boolean,
): Promise<LibraryNavGroup[]> {
  const documents = (await getLibraryDocuments())
    .filter(
      (document) =>
        document.locale === locale &&
        document.slug === 'index' &&
        (!navigationOnly || document.showInNavigation),
    )
    .sort(
      (left, right) =>
        left.groupOrder - right.groupOrder ||
        left.libraryOrder - right.libraryOrder,
    )
  const groups = new Map<string, LibraryNavGroup & { order: number }>()

  for (const document of documents) {
    const group = groups.get(document.group) ?? {
      id: document.group,
      title: document.groupTitle,
      items: [],
      order: document.groupOrder,
    }
    if (!group.items.some((item) => item.library === document.library)) {
      group.items.push({
        name: document.libraryTitle,
        description: document.libraryDescription,
        href: document.href,
        icon: document.libraryIcon,
        status: document.libraryStatus,
        library: document.library,
      })
    }
    groups.set(document.group, group)
  }

  return [...groups.values()]
    .sort((left, right) => left.order - right.order)
    .map(({ order: _order, ...group }) => group)
}

export const getLibraryNavigation = (locale: ContentLocale) =>
  getLibraryGroups(locale, true)

export const getLibraryCatalog = (locale: ContentLocale) =>
  getLibraryGroups(locale, false)

export async function getLibrarySidebar(
  locale: ContentLocale,
  library: string,
): Promise<SidebarItem[]> {
  return (await getLibraryDocuments())
    .filter(
      (document) =>
        document.locale === locale && document.library === library,
    )
    .sort(byPageOrder)
    .map((document) => ({
      title: document.sidebarTitle ?? document.title,
      icon: document.icon,
      href: document.href,
      slug: document.slug,
      depth:
        document.slug === 'index'
          ? 0
          : document.slug.split('/').length - 1,
      isSection:
        document.slug !== 'index' &&
        document.orderPath.length > document.slug.split('/').length,
    }))
}

let blogDocumentsPromise: Promise<BlogDocument[]> | undefined

export function getBlogDocuments() {
  blogDocumentsPromise ??= getCollection('blog').then((entries) =>
    entries.map((entry) => {
      const [localeValue, ...parts] = withoutExtension(entry.id).split('/')
      const locale = normalizeLocale(localeValue)
      const sourceSlug = parts.join('/')
      const slug = sourceSlug.endsWith('/index')
        ? sourceSlug.slice(0, -'/index'.length)
        : sourceSlug

      return {
        entry,
        locale,
        slug,
        href: `${localePrefix(locale)}/blog/${slug}`,
        title: entry.data.title,
        description: entry.data.description,
        publishedAt: entry.data.publishedAt,
        updatedAt: entry.data.updatedAt,
        author: entry.data.author,
        tags: [...entry.data.tags],
        draft: entry.data.draft,
      } satisfies BlogDocument
    }),
  )
  return blogDocumentsPromise
}

export async function getBlogPosts(locale: ContentLocale) {
  return (await getBlogDocuments())
    .filter((document) => document.locale === locale && !document.draft)
    .sort(
      (left, right) =>
        Date.parse(right.publishedAt) - Date.parse(left.publishedAt),
    )
}
