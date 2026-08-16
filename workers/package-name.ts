const packageNamePattern =
  /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9])?$/

export function packageNameFromSegment(segment: string) {
  try {
    const packageName = decodeURIComponent(segment)
    return packageNamePattern.test(packageName) ? packageName : undefined
  } catch {
    return undefined
  }
}

export function packageNameFromPathname(pathname: string) {
  const segment = pathname.split('/').find(Boolean)
  return segment ? packageNameFromSegment(segment) : undefined
}
