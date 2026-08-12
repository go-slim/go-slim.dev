import type { Alpine } from 'alpinejs'

type MarkdownRenderer = typeof import('./markdown-renderer.ts')

let rendererPromise: Promise<MarkdownRenderer> | null = null
let rendererLoaded = false
let markdownInstance = 0

function loadRenderer(): Promise<MarkdownRenderer> {
  rendererPromise ??= import('./markdown-renderer.ts')
    .then((renderer) => {
      rendererLoaded = true
      return renderer
    })
    .catch((error: unknown) => {
      rendererPromise = null
      throw error
    })

  return rendererPromise
}

export function registerAssistantMarkdown(Alpine: Alpine): void {
  Alpine.directive(
    'markdown',
    (element, { expression }, { Alpine, cleanup, effect, evaluateLater }) => {
      const evaluateMarkdown = evaluateLater<unknown>(expression)
      const clobberPrefix = `go-slim-assistant-${++markdownInstance}-`
      let source = ''
      let revision = 0
      let renderedRevision = -1
      let frame: number | null = null
      let rendering = false
      let disposed = false

      const renderLatest = async (): Promise<void> => {
        rendering = true
        try {
          const { renderAssistantMarkdown } = await loadRenderer()
          if (disposed) return

          const renderRevision = revision
          const fragment = renderAssistantMarkdown(source, clobberPrefix)
          if (disposed) return

          Alpine.mutateDom(() => element.replaceChildren(fragment))
          renderedRevision = renderRevision
        } catch (error) {
          console.error('Unable to render assistant Markdown.', error)
          if (disposed) return

          Alpine.mutateDom(() => {
            element.textContent = source
          })
          renderedRevision = revision
        } finally {
          rendering = false
          if (!disposed && renderedRevision !== revision) queueRender()
        }
      }

      const queueRender = (): void => {
        if (disposed || rendering || frame !== null) return

        frame = window.requestAnimationFrame(() => {
          frame = null
          void renderLatest()
        })
      }

      effect(() => {
        evaluateMarkdown((value) => {
          source = typeof value === 'string' ? value : ''
          revision += 1

          // Keep useful, safe text visible while the parser chunk is loading.
          if (!rendererLoaded) {
            Alpine.mutateDom(() => {
              element.textContent = source
            })
          }

          queueRender()
        })
      })

      cleanup(() => {
        disposed = true
        if (frame !== null) window.cancelAnimationFrame(frame)
        frame = null
      })
    },
  )
}
