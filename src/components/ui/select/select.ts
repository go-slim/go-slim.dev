import type { AlpineComponent } from 'alpinejs'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectGroup {
  label: string
  options: readonly SelectOption[]
}

export interface SelectMenuComponent {
  open: boolean
  value: string
  label: string
  placeholder: string
  init(): void
  getOptions(): HTMLElement[]
  getOptionFromEvent(event: Event): HTMLElement | null
  syncSelection(): void
  toggleOptions(): void
  openOptions(focusSelected?: boolean): void
  closeOptions(restoreFocus?: boolean): void
  focusOption(option: HTMLElement, offset: number): void
  focusBoundaryOption(last?: boolean): void
  selectOption(option: HTMLElement): void
  handleOptionsKeydown(event: KeyboardEvent): void
  handleOptionsClick(event: MouseEvent): void
  dismiss(event: KeyboardEvent): void
}

export const selectMenu = (
  initialValue = '',
  placeholder = 'Select…',
): AlpineComponent<SelectMenuComponent> => ({
  open: false,
  value: initialValue,
  label: placeholder,
  placeholder,

  init() {
    void this.$nextTick(() => this.syncSelection())
  },

  getOptions() {
    const listbox = this.$refs.options
    if (!(listbox instanceof HTMLElement)) return []

    return Array.from(
      listbox.querySelectorAll<HTMLElement>(
        '[role="option"]:not([aria-disabled="true"])',
      ),
    )
  },

  getOptionFromEvent(event) {
    const target = event.target
    const listbox = this.$refs.options
    if (!(target instanceof Element) || !(listbox instanceof HTMLElement)) {
      return null
    }

    const option = target.closest<HTMLElement>('[role="option"]')
    return option !== null && listbox.contains(option) ? option : null
  },

  syncSelection() {
    const listbox = this.$refs.options
    if (!(listbox instanceof HTMLElement)) return

    const options = Array.from(
      listbox.querySelectorAll<HTMLElement>('[role="option"]'),
    )
    const selected = options.find((option) => option.dataset.value === this.value)

    for (const option of options) {
      option.setAttribute(
        'aria-selected',
        String(option.dataset.value === this.value),
      )
    }

    this.label = selected?.dataset.label ?? this.placeholder
  },

  toggleOptions() {
    if (this.open) {
      this.closeOptions()
      return
    }

    this.openOptions(false)
  },

  openOptions(focusSelected = true) {
    const options = this.getOptions()
    if (options.length === 0) return

    this.open = true
    if (!focusSelected) return

    void this.$nextTick(() => {
      const selected = options.find(
        (option) => option.getAttribute('aria-selected') === 'true',
      )
      const option = selected ?? options[0]
      option?.focus()
    })
  },

  closeOptions(restoreFocus = true) {
    this.open = false
    if (!restoreFocus) return

    void this.$nextTick(() => this.$refs.trigger?.focus())
  },

  focusOption(option, offset) {
    const options = this.getOptions()
    const currentIndex = options.indexOf(option)
    if (currentIndex === -1) return

    const nextIndex = Math.min(
      options.length - 1,
      Math.max(0, currentIndex + offset),
    )
    options[nextIndex]?.focus()
  },

  focusBoundaryOption(last = false) {
    const options = this.getOptions()
    const option = last ? options.at(-1) : options[0]
    option?.focus()
  },

  selectOption(option) {
    if (option.getAttribute('aria-disabled') === 'true') return

    const value = option.dataset.value
    if (value === undefined) return

    this.value = value
    this.label = option.dataset.label ?? value
    this.$dispatch('select-change', {
      value: this.value,
      label: this.label,
    })
    this.closeOptions()
  },

  handleOptionsKeydown(event) {
    const option = this.getOptionFromEvent(event)
    if (option === null) return

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        event.stopPropagation()
        this.focusOption(option, 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        event.stopPropagation()
        this.focusOption(option, -1)
        break
      case 'Home':
        event.preventDefault()
        event.stopPropagation()
        this.focusBoundaryOption()
        break
      case 'End':
        event.preventDefault()
        event.stopPropagation()
        this.focusBoundaryOption(true)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        event.stopPropagation()
        this.selectOption(option)
        break
    }
  },

  handleOptionsClick(event) {
    const option = this.getOptionFromEvent(event)
    if (option !== null) this.selectOption(option)
  },

  dismiss(event) {
    if (!this.open) return

    event.preventDefault()
    event.stopPropagation()
    this.closeOptions()
  },
})
