import type { AlpineComponent } from 'alpinejs'

export type ScrollAreaOrientation = 'vertical' | 'horizontal'

export interface ScrollAreaComponent {
  orientation: ScrollAreaOrientation
  followEnd: boolean
  endThreshold: number
  ready: boolean
  hasOverflow: boolean
  pinnedToEnd: boolean
  hasUnseen: boolean
  contentSize: number
  thumbSize: number
  thumbOffset: number
  scrollRange: number
  thumbRange: number
  scrolling: boolean
  scrollEndTimer: number | null
  dragging: boolean
  dragPointerId: number | null
  dragStartPointer: number
  dragStartOffset: number
  updateFrame: number | null
  resizeObserver: ResizeObserver | null
  init(): void
  scheduleUpdate(): void
  update(): void
  syncFromViewport(): void
  updateEndState(): void
  scrollToEnd(): void
  showScrollbarTemporarily(): void
  handleVisibilityChange(): void
  jumpToPointer(event: PointerEvent): void
  startThumbDrag(event: PointerEvent): void
  moveThumb(event: PointerEvent): void
  endThumbDrag(event: PointerEvent): void
  setThumbOffset(offset: number): void
  destroy(): void
}

const minimumThumbSize = 24
const scrollEndDelay = 700

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value))

export const scrollArea = (
  orientation: ScrollAreaOrientation = 'vertical',
  followEnd = false,
  endThreshold = 64,
): AlpineComponent<ScrollAreaComponent> => ({
  orientation,
  followEnd,
  endThreshold: Number.isFinite(endThreshold) && endThreshold >= 0
    ? endThreshold
    : 64,
  ready: false,
  hasOverflow: false,
  pinnedToEnd: true,
  hasUnseen: false,
  contentSize: 0,
  thumbSize: 0,
  thumbOffset: 0,
  scrollRange: 0,
  thumbRange: 0,
  scrolling: false,
  scrollEndTimer: null,
  dragging: false,
  dragPointerId: null,
  dragStartPointer: 0,
  dragStartOffset: 0,
  updateFrame: null,
  resizeObserver: null,

  init() {
    if (typeof ResizeObserver === 'undefined') return

    void this.$nextTick(() => {
      const viewport = this.$refs.viewport
      const content = this.$refs.content
      const scrollbar = this.$refs.scrollbar
      if (
        !(viewport instanceof HTMLElement) ||
        !(content instanceof HTMLElement) ||
        !(scrollbar instanceof HTMLElement)
      ) {
        return
      }

      this.resizeObserver = new ResizeObserver(() => this.scheduleUpdate())
      this.resizeObserver.observe(viewport)
      this.resizeObserver.observe(content)
      this.resizeObserver.observe(scrollbar)
      this.update()
      this.ready = true
      if (this.followEnd) this.scrollToEnd()
    })
  },

  scheduleUpdate() {
    if (this.updateFrame !== null) return

    this.updateFrame = window.requestAnimationFrame(() => {
      this.updateFrame = null
      this.update()
    })
  },

  update() {
    const viewport = this.$refs.viewport
    const scrollbar = this.$refs.scrollbar
    if (
      !(viewport instanceof HTMLElement) ||
      !(scrollbar instanceof HTMLElement)
    ) {
      return
    }

    const vertical = this.orientation === 'vertical'
    const viewportSize = vertical
      ? viewport.clientHeight
      : viewport.clientWidth
    const contentSize = vertical
      ? viewport.scrollHeight
      : viewport.scrollWidth
    const contentGrew = contentSize > this.contentSize
    this.contentSize = contentSize
    const scrollbarSize = vertical
      ? scrollbar.clientHeight
      : scrollbar.clientWidth
    const scrollRange = Math.max(0, contentSize - viewportSize)

    this.hasOverflow = scrollRange > 0 && scrollbarSize > 0
    this.scrollRange = scrollRange

    if (!this.hasOverflow) {
      this.pinnedToEnd = true
      this.hasUnseen = false
      this.thumbSize = scrollbarSize
      this.thumbOffset = 0
      this.thumbRange = 0
      return
    }

    if (this.followEnd && this.ready && contentGrew) {
      if (this.pinnedToEnd) {
        if (vertical) {
          viewport.scrollTop = scrollRange
        } else {
          viewport.scrollLeft = scrollRange
        }
      } else {
        this.hasUnseen = true
      }
    }

    const proportionalSize = scrollbarSize * viewportSize / contentSize
    this.thumbSize = clamp(
      proportionalSize,
      Math.min(minimumThumbSize, scrollbarSize),
      scrollbarSize,
    )
    this.thumbRange = Math.max(0, scrollbarSize - this.thumbSize)

    const scrollPosition = vertical
      ? viewport.scrollTop
      : viewport.scrollLeft
    this.thumbOffset = this.thumbRange === 0
      ? 0
      : clamp(
          scrollPosition / this.scrollRange * this.thumbRange,
          0,
          this.thumbRange,
        )
  },

  syncFromViewport() {
    if (!this.ready) return
    this.updateEndState()
    this.showScrollbarTemporarily()
    this.scheduleUpdate()
  },

  updateEndState() {
    if (!this.followEnd) return

    const viewport = this.$refs.viewport
    if (!(viewport instanceof HTMLElement)) return

    const distance = this.orientation === 'vertical'
      ? viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop
      : viewport.scrollWidth - viewport.clientWidth - viewport.scrollLeft
    this.pinnedToEnd = distance <= this.endThreshold
    if (this.pinnedToEnd) this.hasUnseen = false
  },

  scrollToEnd() {
    if (!this.followEnd) return

    const viewport = this.$refs.viewport
    if (!(viewport instanceof HTMLElement)) return

    if (this.orientation === 'vertical') {
      viewport.scrollTop = viewport.scrollHeight
    } else {
      viewport.scrollLeft = viewport.scrollWidth
    }
    this.pinnedToEnd = true
    this.hasUnseen = false
    this.showScrollbarTemporarily()
    this.scheduleUpdate()
  },

  showScrollbarTemporarily() {
    if (!this.ready || !this.hasOverflow) return

    this.scrolling = true
    if (this.scrollEndTimer !== null) {
      window.clearTimeout(this.scrollEndTimer)
    }
    this.scrollEndTimer = window.setTimeout(() => {
      this.scrolling = false
      this.scrollEndTimer = null
    }, scrollEndDelay)
  },

  handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      this.showScrollbarTemporarily()
    }
  },

  jumpToPointer(event) {
    if (!this.hasOverflow || event.button !== 0) return

    const scrollbar = this.$refs.scrollbar
    if (!(scrollbar instanceof HTMLElement)) return

    event.preventDefault()
    const bounds = scrollbar.getBoundingClientRect()
    const pointerPosition = this.orientation === 'vertical'
      ? event.clientY - bounds.top
      : event.clientX - bounds.left
    this.setThumbOffset(pointerPosition - this.thumbSize / 2)
  },

  startThumbDrag(event) {
    if (!this.hasOverflow || event.button !== 0) return

    const thumb = this.$refs.thumb
    if (!(thumb instanceof HTMLElement)) return

    event.preventDefault()
    this.dragging = true
    this.dragPointerId = event.pointerId
    this.dragStartPointer = this.orientation === 'vertical'
      ? event.clientY
      : event.clientX
    this.dragStartOffset = this.thumbOffset
    thumb.setPointerCapture(event.pointerId)
  },

  moveThumb(event) {
    if (!this.dragging || event.pointerId !== this.dragPointerId) return

    const pointerPosition = this.orientation === 'vertical'
      ? event.clientY
      : event.clientX
    this.setThumbOffset(
      this.dragStartOffset + pointerPosition - this.dragStartPointer,
    )
  },

  endThumbDrag(event) {
    if (!this.dragging || event.pointerId !== this.dragPointerId) return

    const thumb = this.$refs.thumb
    if (
      thumb instanceof HTMLElement &&
      thumb.hasPointerCapture(event.pointerId)
    ) {
      thumb.releasePointerCapture(event.pointerId)
    }

    this.dragging = false
    this.dragPointerId = null
    this.scheduleUpdate()
  },

  setThumbOffset(offset) {
    const viewport = this.$refs.viewport
    if (!(viewport instanceof HTMLElement)) return

    const nextOffset = clamp(offset, 0, this.thumbRange)
    this.thumbOffset = nextOffset
    const scrollPosition = this.thumbRange === 0
      ? 0
      : nextOffset / this.thumbRange * this.scrollRange

    if (this.orientation === 'vertical') {
      viewport.scrollTop = scrollPosition
      return
    }

    viewport.scrollLeft = scrollPosition
  },

  destroy() {
    if (this.updateFrame !== null) {
      window.cancelAnimationFrame(this.updateFrame)
      this.updateFrame = null
    }
    if (this.scrollEndTimer !== null) {
      window.clearTimeout(this.scrollEndTimer)
      this.scrollEndTimer = null
    }
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.scrolling = false
    this.pinnedToEnd = true
    this.hasUnseen = false
    this.contentSize = 0
    this.dragging = false
    this.dragPointerId = null
    this.ready = false
  },
})
