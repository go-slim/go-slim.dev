import {
  defaultContentLocale,
  isContentLocale,
  type ContentLocale,
} from './content-types'

export function localeHref(
  pathname: string,
  locale: ContentLocale,
  search = '',
): string {
  const [, firstSegment = ''] = pathname.split('/')
  const unprefixedPath = isContentLocale(firstSegment)
    ? pathname.slice(firstSegment.length + 1) || '/'
    : pathname
  const localizedPath =
    locale !== defaultContentLocale
      ? `/${locale}${unprefixedPath === '/' ? '' : unprefixedPath}`
      : unprefixedPath

  return `${localizedPath}${search}`
}
