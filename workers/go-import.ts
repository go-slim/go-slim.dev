import { packageNameFromPathname } from './package-name.ts'

const siteHost = 'go-slim.dev'
const siteUrl = `https://${siteHost}`
const githubOrganizationUrl = 'https://github.com/go-slim'

export const goImportWorkerPrefix = '/__go_imports__'

function publicGoImportPathname(pathname: string) {
  return pathname.startsWith(`${goImportWorkerPrefix}/`)
    ? pathname.slice(goImportWorkerPrefix.length)
    : pathname
}

function createGoImportDocument(url: URL) {
  if (url.searchParams.get('go-get') !== '1') return undefined

  const packageName = packageNameFromPathname(
    publicGoImportPathname(url.pathname),
  )
  if (!packageName) return undefined

  const importPath = `${siteHost}/${packageName}`
  const repositoryUrl = `${githubOrganizationUrl}/${packageName}`

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width">',
    `<meta name="go-import" content="${importPath} git ${repositoryUrl}">`,
    `<meta name="go-source" content="${importPath} ${repositoryUrl} ${repositoryUrl}/tree/main{/dir} ${repositoryUrl}/blob/main{/dir}/{file}#L{line}">`,
    `<title>${packageName} - ${siteHost}</title>`,
    '</head>',
    `<body><a href="${siteUrl}">${siteHost}</a></body>`,
    '</html>',
  ].join('\n')
}

export function createGoImportResponse(request: Request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return undefined

  const document = createGoImportDocument(new URL(request.url))
  if (!document) return undefined

  return new Response(request.method === 'HEAD' ? null : document, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
