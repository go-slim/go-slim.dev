import { micromark } from 'micromark'
import { gfm, gfmHtml } from 'micromark-extension-gfm'

const gfmSyntax = gfm()

function unwrapAnchor(anchor: HTMLAnchorElement): void {
  anchor.replaceWith(...Array.from(anchor.childNodes))
}

function prepareLinks(fragment: DocumentFragment): void {
  for (const anchor of fragment.querySelectorAll('a')) {
    const href = anchor.getAttribute('href')
    if (href === null || href === '') {
      unwrapAnchor(anchor)
      continue
    }

    let url: URL
    try {
      url = new URL(href, document.baseURI)
    } catch {
      unwrapAnchor(anchor)
      continue
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      unwrapAnchor(anchor)
      continue
    }

    if (url.origin !== window.location.origin) {
      anchor.target = '_blank'
      anchor.rel = 'noopener noreferrer'
    }
  }
}

/**
 * Converts model-authored Markdown to an inert fragment.
 *
 * Raw HTML and dangerous URL protocols stay disabled in micromark. Images are
 * replaced with their alt text so a model response cannot make untrusted
 * third-party requests, and links are restricted to HTTP(S) or local URLs.
 */
export function renderAssistantMarkdown(
  source: string,
  clobberPrefix: string,
): DocumentFragment {
  const template = document.createElement('template')
  template.innerHTML = micromark(source, {
    allowDangerousHtml: false,
    allowDangerousProtocol: false,
    extensions: [gfmSyntax],
    htmlExtensions: [gfmHtml({ clobberPrefix })],
  })

  for (const image of template.content.querySelectorAll('img')) {
    image.replaceWith(document.createTextNode(image.alt))
  }

  prepareLinks(template.content)
  return template.content
}
