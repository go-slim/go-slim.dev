export const contentLocales = ['en-US', 'zh-Hans'] as const
export const defaultContentLocale = 'en-US' as const
export const libraryLlmsFiles = ['llms.txt', 'llms-full.txt'] as const

export type ContentLocale = (typeof contentLocales)[number]

export function isContentLocale(value: string): value is ContentLocale {
  return (contentLocales as readonly string[]).includes(value)
}
export type LibraryStatus =
  | 'design'
  | 'experimental'
  | 'stable'
  | 'deprecated'
export type LibraryLlmsFile = (typeof libraryLlmsFiles)[number]

export type LibraryLlmsConfig = {
  repository: string
  ref: string
  files: LibraryLlmsFile[]
  skillDescription?: string
}

export type LibraryNavItem = {
  name: string
  description: string
  href: string
  icon: string
  status: LibraryStatus
  library: string
}

export type LibraryNavGroup = {
  id: string
  title: string
  items: LibraryNavItem[]
}

export type SidebarItem = {
  title: string
  icon?: string
  href: string
  slug: string
  depth: number
  isSection: boolean
}

export function localePrefix(locale: ContentLocale) {
  return locale === defaultContentLocale ? '' : `/${locale}`
}
