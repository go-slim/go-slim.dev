import type { Alpine } from 'alpinejs'
import { registerAiStore } from './ai'
import { registerAiRuntime } from './ai-runtime'
import { registerThemeStore } from './theme'

export const registerStores = (Alpine: Alpine) => {
  registerAiStore(Alpine)
  registerAiRuntime(Alpine)
  registerThemeStore(Alpine)
}
