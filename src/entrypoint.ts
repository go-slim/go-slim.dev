import type { Alpine, AlpineComponent } from 'alpinejs'
import collapse from '@alpinejs/collapse'
import intersect from '@alpinejs/intersect'
import resize from '@alpinejs/resize'
import { registerAssistantMarkdown } from '#components/assistant/markdown.ts'
import { assistantPanel } from '#components/assistant/panel.ts'
import { slashCommands } from '#components/assistant/slash-commands.ts'
import { searchDialog } from '#components/search/search-dialog.ts'
import { searchPage } from '#components/search/search-page.ts'
import { scrollArea } from '#components/ui/scrollarea/scrollarea.ts'
import { selectMenu } from '#components/ui/select/select.ts'
import { registerMemberDirectory } from '#components/views/maintainers-page/member-directory.ts'
import { registerStores } from '#state/index.ts'

export type MegaMenuName = string
export type MegaMenuRefs = Readonly<Record<string, HTMLElement | undefined>>

export interface MegaMenuComponent {
  open: MegaMenuName | null
  openTimer: number | null
  closeTimer: number | null
  openMenu(menu: MegaMenuName): void
  queueClose(): void
  cancelOpen(): void
  cancelClose(): void
  closeMenu(): void
  renderMenu(
    menu: MegaMenuName | null,
    refs: MegaMenuRefs,
    target: HTMLElement,
  ): void
  destroy(): void
}

export interface TooltipComponent {
  hovered: boolean
  hoverReady: boolean
  focused: boolean
  dismissed: boolean
  showTimer: number | null
  delay: number
  readonly open: boolean
  queueOpen(): void
  closeHover(): void
  openFocus(): void
  closeFocus(): void
  cancelShow(): void
  dismiss(): void
  destroy(): void
}

export interface MobileMenuComponent {
  open: boolean
  unlockTimer: number | null
  bodyOverflow: string
  bodyPaddingRight: string
  scrollLocked: boolean
  toggleMenu(): void
  openMenu(): void
  closeMenu(restoreFocus?: boolean): void
  finishClose(): void
  closeForDesktop(): void
  cancelUnlock(): void
  lockScroll(): void
  unlockScroll(): void
  destroy(): void
}

const megaMenu = (): AlpineComponent<MegaMenuComponent> => ({
  open: null,
  openTimer: null,
  closeTimer: null,

  openMenu(menu) {
    this.cancelClose()
    this.cancelOpen()
    if (this.open === menu) return

    this.openTimer = window.setTimeout(() => {
      this.open = menu
      this.openTimer = null
    }, 120)
  },

  queueClose() {
    this.cancelClose()
    this.closeTimer = window.setTimeout(() => this.closeMenu(), 100)
  },

  cancelOpen() {
    if (this.openTimer === null) return
    window.clearTimeout(this.openTimer)
    this.openTimer = null
  },

  cancelClose() {
    if (this.closeTimer === null) return
    window.clearTimeout(this.closeTimer)
    this.closeTimer = null
  },

  closeMenu() {
    this.cancelOpen()
    this.cancelClose()
    this.open = null
  },

  renderMenu(menu, refs, target) {
    if (menu === null) return

    const source = refs[`${menu}Source`]
    if (source === undefined) {
      target.replaceChildren()
      return
    }

    const content = Array.from(source.childNodes, (node) =>
      node.cloneNode(true),
    )
    target.replaceChildren(...content)
  },

  destroy() {
    this.cancelOpen()
    this.cancelClose()
  },
})

const tooltip = (delay = 500): AlpineComponent<TooltipComponent> => ({
  hovered: false,
  hoverReady: false,
  focused: false,
  dismissed: false,
  showTimer: null,
  delay: Number.isFinite(delay) && delay >= 0 ? delay : 500,

  get open() {
    return !this.dismissed && (this.hoverReady || this.focused)
  },

  queueOpen() {
    this.hovered = true
    this.dismissed = false
    this.cancelShow()
    this.showTimer = window.setTimeout(() => {
      this.showTimer = null
      if (!this.hovered || this.dismissed) return
      this.hoverReady = true
    }, this.delay)
  },

  closeHover() {
    this.hovered = false
    this.hoverReady = false
    this.cancelShow()
    if (!this.focused) this.dismissed = false
  },

  openFocus() {
    this.focused = true
    this.dismissed = false
  },

  closeFocus() {
    this.focused = false
    if (!this.hovered) this.dismissed = false
  },

  cancelShow() {
    if (this.showTimer === null) return
    window.clearTimeout(this.showTimer)
    this.showTimer = null
  },

  dismiss() {
    if (!this.open && this.showTimer === null) return
    this.dismissed = true
    this.hoverReady = false
    this.cancelShow()
  },

  destroy() {
    this.cancelShow()
  },
})

const mobileMenuUnlockFallbackDuration = 300
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

const mobileMenu = (): AlpineComponent<MobileMenuComponent> => ({
  open: false,
  unlockTimer: null,
  bodyOverflow: '',
  bodyPaddingRight: '',
  scrollLocked: false,

  toggleMenu() {
    if (this.open) {
      this.closeMenu()
      return
    }

    this.openMenu()
  },

  openMenu() {
    this.cancelUnlock()
    if (this.open) return

    this.lockScroll()
    this.open = true
  },

  closeMenu(restoreFocus = true) {
    if (!this.open) return

    this.open = false
    this.cancelUnlock()
    this.unlockTimer = window.setTimeout(() => {
      this.finishClose()
    }, reducedMotion.matches ? 0 : mobileMenuUnlockFallbackDuration)

    if (restoreFocus) {
      void this.$nextTick(() => this.$refs.trigger?.focus())
    }
  },

  finishClose() {
    if (this.open) return

    this.cancelUnlock()
    this.unlockScroll()
  },

  closeForDesktop() {
    if (!this.open && !this.scrollLocked) return

    this.open = false
    this.finishClose()

    const activeElement = document.activeElement
    if (
      activeElement instanceof HTMLElement &&
      this.$root.contains(activeElement)
    ) {
      activeElement.blur()
    }
  },

  cancelUnlock() {
    if (this.unlockTimer === null) return
    window.clearTimeout(this.unlockTimer)
    this.unlockTimer = null
  },

  lockScroll() {
    if (this.scrollLocked) return

    const body = document.body
    const scrollbarGap = Math.max(
      0,
      window.innerWidth - document.documentElement.clientWidth,
    )
    const bodyPaddingRight = Number.parseFloat(
      window.getComputedStyle(body).paddingRight,
    )

    this.bodyOverflow = body.style.overflow
    this.bodyPaddingRight = body.style.paddingRight
    this.scrollLocked = true
    body.style.overflow = 'hidden'

    if (scrollbarGap > 0) {
      body.style.paddingRight = `${(Number.isFinite(bodyPaddingRight) ? bodyPaddingRight : 0) + scrollbarGap
        }px`
    }
  },

  unlockScroll() {
    if (!this.scrollLocked) return

    const body = document.body
    body.style.overflow = this.bodyOverflow
    body.style.paddingRight = this.bodyPaddingRight
    this.scrollLocked = false
  },

  destroy() {
    this.cancelUnlock()
    this.unlockScroll()
  },
})

export default (Alpine: Alpine) => {
  Alpine.plugin(collapse)
  Alpine.plugin(intersect)
  Alpine.plugin(resize)
  registerAssistantMarkdown(Alpine)
  Alpine.data('assistantPanel', assistantPanel)
  Alpine.data('slashCommands', slashCommands)
  Alpine.data('megaMenu', megaMenu)
  Alpine.data('tooltip', tooltip)
  Alpine.data('mobileMenu', mobileMenu)
  Alpine.data('searchDialog', searchDialog)
  Alpine.data('searchPage', searchPage)
  Alpine.data('scrollArea', scrollArea)
  Alpine.data('selectMenu', selectMenu)
  registerMemberDirectory(Alpine)
  registerStores(Alpine)
}
