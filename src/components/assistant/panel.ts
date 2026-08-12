import type { AlpineComponent } from 'alpinejs'

export interface AssistantPanelComponent {
  mobile: boolean
  modalActive: boolean
  scrollLocked: boolean
  bodyOverflow: string
  bodyPaddingRight: string
  appWasInert: boolean
  returnFocus: HTMLElement | null
  mediaQuery: MediaQueryList | null
  mediaHandler: ((event: MediaQueryListEvent) => void) | null
  init(): void
  syncPanel(open: boolean): void
  activateModal(): void
  deactivateModal(restoreFocus?: boolean): void
  lockScroll(): void
  unlockScroll(): void
  focusPanel(): void
  restorePanelFocus(): void
  focusableElements(): HTMLElement[]
  trapFocus(event: KeyboardEvent): void
  handleEscape(event: KeyboardEvent): void
  destroy(): void
}

const desktopQuery = '(min-width: 64rem)'
const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const isVisible = (element: HTMLElement) =>
  element.isConnected &&
  !element.hidden &&
  element.getAttribute('aria-hidden') !== 'true' &&
  element.getClientRects().length > 0

export const assistantPanel = (): AlpineComponent<AssistantPanelComponent> => ({
  mobile: false,
  modalActive: false,
  scrollLocked: false,
  bodyOverflow: '',
  bodyPaddingRight: '',
  appWasInert: false,
  returnFocus: null,
  mediaQuery: null,
  mediaHandler: null,

  init() {
    this.mediaQuery = window.matchMedia(desktopQuery)
    this.mobile = !this.mediaQuery.matches
    this.mediaHandler = (event) => {
      this.mobile = !event.matches
      this.syncPanel(this.$store.ai.panelOpen)
    }
    this.mediaQuery.addEventListener('change', this.mediaHandler)
  },

  syncPanel(open) {
    if (!open) {
      const panel = this.$refs.panel
      const restoreFocus = panel instanceof HTMLElement &&
        panel.contains(document.activeElement)

      if (this.modalActive) {
        this.deactivateModal(true)
      } else if (restoreFocus) {
        void this.$nextTick(() => this.restorePanelFocus())
      }
      return
    }

    if (open && this.mobile) {
      this.activateModal()
      return
    }

    this.deactivateModal(false)
  },

  activateModal() {
    if (this.modalActive) return

    const activeElement = document.activeElement
    this.returnFocus = activeElement instanceof HTMLElement
      ? activeElement
      : null

    const app = document.querySelector<HTMLElement>('[data-app-container]')
    if (app !== null) {
      this.appWasInert = app.inert
      app.inert = true
    }

    this.lockScroll()
    this.modalActive = true
    void this.$nextTick(() => this.focusPanel())
  },

  deactivateModal(restoreFocus = true) {
    if (!this.modalActive) return

    const app = document.querySelector<HTMLElement>('[data-app-container]')
    if (app !== null) app.inert = this.appWasInert

    this.unlockScroll()
    this.modalActive = false
    this.appWasInert = false

    if (restoreFocus) {
      void this.$nextTick(() => this.restorePanelFocus())
    } else {
      this.returnFocus = null
    }
  },

  lockScroll() {
    if (this.scrollLocked) return

    const body = document.body
    const scrollbarGap = Math.max(
      0,
      window.innerWidth - document.documentElement.clientWidth,
    )
    const paddingRight = Number.parseFloat(
      window.getComputedStyle(body).paddingRight,
    )

    this.bodyOverflow = body.style.overflow
    this.bodyPaddingRight = body.style.paddingRight
    body.style.overflow = 'hidden'
    if (scrollbarGap > 0) {
      body.style.paddingRight = `${
        (Number.isFinite(paddingRight) ? paddingRight : 0) + scrollbarGap
      }px`
    }
    this.scrollLocked = true
  },

  unlockScroll() {
    if (!this.scrollLocked) return

    document.body.style.overflow = this.bodyOverflow
    document.body.style.paddingRight = this.bodyPaddingRight
    this.scrollLocked = false
  },

  focusPanel() {
    const panel = this.$refs.panel
    if (!(panel instanceof HTMLElement)) return

    const preferred = panel.querySelector<HTMLElement>(
      '[data-assistant-close]',
    )
    const target = preferred !== null && isVisible(preferred)
      ? preferred
      : this.focusableElements()[0] ?? panel
    target.focus({ preventScroll: true })
  },

  restorePanelFocus() {
    const candidates = [
      this.returnFocus,
      ...document.querySelectorAll<HTMLElement>(
        '[aria-controls="assistant-panel"]',
      ),
    ]
    this.returnFocus = null
    candidates.find((element) => element !== null && isVisible(element))
      ?.focus({ preventScroll: true })
  },

  focusableElements() {
    const panel = this.$refs.panel
    if (!(panel instanceof HTMLElement)) return []

    return Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector))
      .filter(isVisible)
  },

  trapFocus(event) {
    if (!this.mobile || !this.modalActive || !this.$store.ai.panelOpen) return

    const panel = this.$refs.panel
    if (!(panel instanceof HTMLElement)) return
    const elements = this.focusableElements()
    if (elements.length === 0) {
      event.preventDefault()
      panel.focus({ preventScroll: true })
      return
    }

    const first = elements[0]
    const last = elements[elements.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || !panel.contains(active))) {
      event.preventDefault()
      last?.focus()
      return
    }
    if (!event.shiftKey && (active === last || !panel.contains(active))) {
      event.preventDefault()
      first?.focus()
    }
  },

  handleEscape(event) {
    if (!this.$store.ai.panelOpen) return
    event.preventDefault()
    this.$store.ai.closePanel()
  },

  destroy() {
    if (this.mediaQuery !== null && this.mediaHandler !== null) {
      this.mediaQuery.removeEventListener('change', this.mediaHandler)
    }
    this.deactivateModal(false)
    this.mediaQuery = null
    this.mediaHandler = null
  },
})
