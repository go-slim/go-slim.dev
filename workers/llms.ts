import { packageNameFromSegment } from './package-name.ts'

export const llmsWorkerPrefix = '/__llms__'

type PackageResource = 'llms.txt' | 'llms-full.txt' | 'SKILL.md'

const packageResourcePathPattern =
  /^\/([^/]+)\/(llms\.txt|llms-full\.txt|SKILL\.md)$/

function publicLlmsPathname(pathname: string) {
  return pathname.startsWith(`${llmsWorkerPrefix}/`)
    ? pathname.slice(llmsWorkerPrefix.length)
    : pathname
}

function getPackageResource(pathname: string) {
  const match = packageResourcePathPattern.exec(publicLlmsPathname(pathname))
  if (!match) return undefined

  const packageName = packageNameFromSegment(match[1])
  if (!packageName) return undefined

  return { packageName, file: match[2] as PackageResource }
}

function createSkillMarkdown(packageName: string) {
  const displayName =
    packageName === 'h3'
      ? 'H3'
      : `${packageName.charAt(0).toUpperCase()}${packageName.slice(1)}`

  return [
    '---',
    `name: ${JSON.stringify(packageName)}`,
    `description: ${JSON.stringify(`${displayName} is a Go package documented by go-slim.`)}`,
    '---',
    '',
    `Up-to-date ${displayName} documentation for this project. Read it before working with ${displayName}:`,
    '',
    `https://go-slim.dev/${packageName}/llms.txt`,
    '',
  ].join('\n')
}

export async function createLlmsResponse(request: Request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return undefined

  const source = getPackageResource(new URL(request.url).pathname)
  if (!source) return undefined

  if (source.file === 'SKILL.md') {
    return new Response(
      request.method === 'HEAD' ? null : createSkillMarkdown(source.packageName),
      {
        headers: {
          'Cache-Control': 'public, max-age=3600, s-maxage=3600',
          'Content-Disposition': 'inline; filename="SKILL.md"',
          'Content-Type': 'text/markdown; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
        },
      },
    )
  }

  const upstreamUrl = new URL(
    `go-slim/${source.packageName}/main/${source.file}`,
    'https://raw.githubusercontent.com/',
  )
  const upstream = await fetch(upstreamUrl, {
    headers: { 'User-Agent': 'go-slim.dev package resource proxy' },
    cf: { cacheEverything: true, cacheTtl: 300 },
  } as RequestInit)

  if (!upstream.ok) {
    const message =
      upstream.status === 404
        ? 'The requested package resource was not found.'
        : 'The requested package resource is temporarily unavailable.'

    return new Response(message, {
      status: upstream.status === 404 ? 404 : 502,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }

  const headers = new Headers({
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  })
  for (const name of ['etag', 'last-modified'] as const) {
    const value = upstream.headers.get(name)
    if (value) headers.set(name, value)
  }

  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: 200,
    headers,
  })
}
