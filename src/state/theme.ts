import type { Alpine } from 'alpinejs'

export type ThemeMode = 'system' | 'light' | 'dark'

export interface ThemeStore {
  mode: ThemeMode
  changeFrame: number
  init(): void
  set(mode: ThemeMode): void
  cycle(): void
  apply(): void
}

declare module 'alpinejs' {
  interface Stores {
    theme: ThemeStore
  }
}

const themeStorageKey = 'theme'
const systemDarkMode = window.matchMedia('(prefers-color-scheme: dark)')
const nextThemeMode = {
  system: 'light',
  light: 'dark',
  dark: 'system',
} as const satisfies Record<ThemeMode, ThemeMode>

const isThemeMode = (value: string | null): value is ThemeMode =>
  value === 'system' || value === 'light' || value === 'dark'

const getStoredTheme = (): ThemeMode => {
  try {
    const theme = localStorage.getItem(themeStorageKey)
    return isThemeMode(theme) ? theme : 'system'
  } catch {
    return 'system'
  }
}

const updateFavicon = (dark: boolean) => {
  const favicon = document.querySelector<HTMLLinkElement>(
    'link[data-theme-favicon]',
  )
  if (favicon === null) return

  const href = dark ? favicon.dataset.darkHref : favicon.dataset.lightHref
  if (href === undefined || favicon.getAttribute('href') === href) return

  favicon.setAttribute('href', href)
}

const createThemeStore = (): ThemeStore => ({
  mode: getStoredTheme(),
  changeFrame: 0,

  init() {
    this.apply()
    systemDarkMode.addEventListener('change', () => {
      if (this.mode === 'system') {
        this.apply()
        return
      }

      updateFavicon(systemDarkMode.matches)
    })
  },

  set(mode) {
    if (this.mode === mode) return

    this.mode = mode
    try {
      localStorage.setItem(themeStorageKey, mode)
    } catch {
      // The theme still works for this page when storage is unavailable.
    }
    this.apply()
  },

  cycle() {
    this.set(nextThemeMode[this.mode])
  },

  apply() {
    const root = document.documentElement
    const dark =
      this.mode === 'dark' ||
      (this.mode === 'system' && systemDarkMode.matches)

    cancelAnimationFrame(this.changeFrame)
    root.dataset.theme = this.mode
    root.dataset.themeChanging = ''
    root.classList.toggle('dark', dark)
    updateFavicon(systemDarkMode.matches)
    this.changeFrame = requestAnimationFrame(() => {
      root.removeAttribute('data-theme-changing')
      this.changeFrame = 0
    })
  },
})

export const registerThemeStore = (Alpine: Alpine) => {
  Alpine.store('theme', createThemeStore())
}
