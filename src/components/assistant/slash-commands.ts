import type { AlpineComponent } from 'alpinejs'
import type { LocalAiModelId } from '#data/ai-models.ts'

export type AssistantSlashCommand = 'new' | 'model' | 'sessions' | 'help'
type SlashSurface = 'commands' | 'models' | 'sessions' | 'help' | null

export interface SlashCommandDefinition {
  command: AssistantSlashCommand
  label: string
  description: string
}

export interface SlashModelDefinition {
  id: LocalAiModelId
  label: string
  meta: string
  recommended: boolean
}

export interface SlashCommandsOptions {
  commands: readonly SlashCommandDefinition[]
  models: readonly SlashModelDefinition[]
  labels: {
    commands: string
    models: string
    sessions: string
    help: string
    helpHint: string
    deleteSession: string
    noCommands: string
    noSessions: string
  }
}

interface SlashKeydownDetail {
  event: KeyboardEvent
}

export interface SlashCommandsComponent {
  surface: SlashSurface
  activeIndex: number
  dismissedDraft: string
  composing: boolean
  options: SlashCommandsOptions
  readonly open: boolean
  readonly filteredCommands: readonly SlashCommandDefinition[]
  readonly itemCount: number
  init(): void
  syncDraft(draft: string): void
  handleComposition(event: CustomEvent<{ composing: boolean }>): void
  handleKeydown(event: CustomEvent<SlashKeydownDetail>): void
  handleSubmit(): void
  move(offset: number): void
  moveBoundary(last?: boolean): void
  activateCurrent(): boolean
  executeCommand(command: AssistantSlashCommand): void
  handleSessionKeydown(event: KeyboardEvent): void
  focusSession(index: number): void
  selectModel(index: number): void
  selectSession(index: number): void
  removeSession(conversationId: string, index: number): void
  commandDisabled(command: AssistantSlashCommand): boolean
  closeSurface(dismiss?: boolean): void
  focusComposer(): void
  syncTextboxA11y(): void
  destroy(): void
}

const commandPattern = /^\/[a-z]*$/i

export const slashCommands = (
  options: SlashCommandsOptions,
): AlpineComponent<SlashCommandsComponent> => ({
  surface: null,
  activeIndex: 0,
  dismissedDraft: '',
  composing: false,
  options,

  get open() {
    return this.surface !== null
  },

  get filteredCommands() {
    const query = this.$store.ai.draft.trim().slice(1).toLowerCase()
    return this.options.commands.filter(({ command }) =>
      command.startsWith(query),
    )
  },

  get itemCount() {
    if (this.surface === 'commands') return this.filteredCommands.length
    if (this.surface === 'models') return this.options.models.length
    if (this.surface === 'sessions') {
      return this.$store.ai.conversations.length
    }
    return 0
  },

  init() {
    this.syncDraft(this.$store.ai.draft)
  },

  syncDraft(draft) {
    if (this.composing) return

    if (!commandPattern.test(draft)) {
      if (
        this.surface === 'commands' ||
        (this.surface === 'help' && draft !== '')
      ) {
        this.closeSurface(false)
      }
      this.dismissedDraft = ''
      return
    }

    if (this.surface === 'models' || this.surface === 'sessions') return
    if (draft === this.dismissedDraft) return

    this.surface = 'commands'
    this.activeIndex = Math.min(
      this.activeIndex,
      Math.max(0, this.filteredCommands.length - 1),
    )
    this.syncTextboxA11y()
  },

  handleComposition(event) {
    this.composing = event.detail.composing
    if (this.composing && this.surface === 'commands') {
      this.closeSurface(false)
      return
    }
    if (!this.composing) this.syncDraft(this.$store.ai.draft)
  },

  handleKeydown(customEvent) {
    const event = customEvent.detail.event
    const legacyKeyCode = (event as unknown as { keyCode?: number }).keyCode
    if (event.isComposing || legacyKeyCode === 229 || this.composing) return

    if (!this.open) {
      this.$store.ai.handleComposerKeydown(event)
      return
    }

    if (this.surface === 'help') {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        this.closeSurface(false)
        return
      }
      if (event.key === 'Tab') {
        this.closeSurface(false)
        return
      }
      this.closeSurface(false)
      this.$store.ai.handleComposerKeydown(event)
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.closeSurface(true)
      return
    }

    if (event.key === 'Tab') {
      this.closeSurface(true)
      return
    }

    if (event.shiftKey && event.key === 'Enter') {
      this.closeSurface(false)
      this.$store.ai.handleComposerKeydown(event)
      return
    }

    if (
      this.surface !== 'commands' &&
      event.key.length === 1 &&
      event.key !== ' ' &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      this.closeSurface(false)
      return
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        event.stopPropagation()
        this.move(1)
        return
      case 'ArrowUp':
        event.preventDefault()
        event.stopPropagation()
        this.move(-1)
        return
      case 'Home':
        event.preventDefault()
        event.stopPropagation()
        this.moveBoundary()
        return
      case 'End':
        event.preventDefault()
        event.stopPropagation()
        this.moveBoundary(true)
        return
      case 'Enter':
        if (this.itemCount > 0) {
          event.preventDefault()
          event.stopPropagation()
          this.activateCurrent()
          return
        }
        if (this.surface !== 'commands') {
          event.preventDefault()
          event.stopPropagation()
          return
        }
        this.closeSurface(false)
        this.$store.ai.handleComposerKeydown(event)
        return
      case ' ':
        if (this.surface === 'models' || this.surface === 'sessions') {
          event.preventDefault()
          event.stopPropagation()
          this.activateCurrent()
        }
    }
  },

  handleSubmit() {
    if (this.surface === 'help') {
      this.closeSurface(false)
      this.$store.ai.submit()
      return
    }
    if (this.open && this.itemCount > 0 && this.activateCurrent()) return
    if (this.open && this.surface !== 'commands') return
    this.closeSurface(false)
    this.$store.ai.submit()
  },

  move(offset) {
    if (this.itemCount === 0) return
    this.activeIndex =
      (this.activeIndex + offset + this.itemCount) % this.itemCount
    this.syncTextboxA11y()
  },

  moveBoundary(last = false) {
    if (this.itemCount === 0) return
    this.activeIndex = last ? this.itemCount - 1 : 0
    this.syncTextboxA11y()
  },

  activateCurrent() {
    if (this.surface === 'commands') {
      const command = this.filteredCommands[this.activeIndex]
      if (command === undefined || this.commandDisabled(command.command)) {
        return true
      }
      this.executeCommand(command.command)
      return true
    }
    if (this.surface === 'models') {
      this.selectModel(this.activeIndex)
      return true
    }
    if (this.surface === 'sessions') {
      this.selectSession(this.activeIndex)
      return true
    }
    return false
  },

  executeCommand(command) {
    if (this.commandDisabled(command)) return
    this.$store.ai.draft = ''
    this.$store.ai.schedulePersistence()
    this.dismissedDraft = ''

    if (command === 'new') {
      this.closeSurface(false)
      this.$store.ai.startNewConversation()
      return
    }
    if (command === 'model') {
      this.surface = 'models'
      const selectedIndex = this.options.models.findIndex(
        ({ id }) => id === this.$store.ai.selectedModelId,
      )
      this.activeIndex = selectedIndex >= 0 ? selectedIndex : 0
      this.syncTextboxA11y()
      return
    }
    if (command === 'sessions') {
      if (this.$store.ai.generating) this.$store.ai.stop()
      this.surface = 'sessions'
      this.activeIndex = 0
      this.syncTextboxA11y()
      void this.$nextTick(() => this.focusSession(0))
      return
    }

    this.surface = 'help'
    this.activeIndex = 0
    this.syncTextboxA11y()
    this.focusComposer()
  },

  handleSessionKeydown(event) {
    if (this.surface !== 'sessions' || this.itemCount === 0) return

    let nextIndex: number | null = null
    switch (event.key) {
      case 'ArrowDown':
        nextIndex = this.activeIndex + 1
        break
      case 'ArrowUp':
        nextIndex = this.activeIndex - 1
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = this.itemCount - 1
        break
    }
    if (nextIndex === null) return

    event.preventDefault()
    event.stopPropagation()
    this.focusSession(nextIndex)
  },

  focusSession(index) {
    const sessionButtons = Array.from(
      this.$root.querySelectorAll<HTMLButtonElement>(
        '[data-slash-sessions] [data-session-open]',
      ),
    )
    if (sessionButtons.length === 0) {
      this.activeIndex = 0
      this.$refs.back?.focus()
      return
    }

    const nextIndex =
      ((index % sessionButtons.length) + sessionButtons.length) %
      sessionButtons.length
    this.activeIndex = nextIndex
    sessionButtons[nextIndex]?.focus()
  },

  selectModel(index) {
    const model = this.options.models[index]
    if (model === undefined || this.commandDisabled('model')) return
    this.$store.ai.switchConversationModel(model.id)
    this.closeSurface(false)
    this.focusComposer()
  },

  selectSession(index) {
    const conversation = this.$store.ai.conversations[index]
    if (conversation === undefined) return
    this.closeSurface(false)
    this.$store.ai.openConversation(conversation.id)
  },

  removeSession(conversationId, index) {
    this.$store.ai.removeConversation(conversationId)
    const remainingCount = this.$store.ai.conversations.length
    this.activeIndex =
      remainingCount === 0 ? 0 : Math.min(index, remainingCount - 1)
    this.syncTextboxA11y()

    void this.$nextTick(() => this.focusSession(this.activeIndex))
  },

  commandDisabled(command) {
    if (command === 'model') {
      return (
        this.$store.ai.generating ||
        this.$store.ai.awaitingModelQuestionId !== null ||
        this.$store.ai.persistenceState === 'loading'
      )
    }
    if (command === 'sessions') {
      return this.$store.ai.persistenceState === 'loading'
    }
    return false
  },

  closeSurface(dismiss = false) {
    if (dismiss && this.surface === 'commands') {
      this.dismissedDraft = this.$store.ai.draft
    }
    this.surface = null
    this.activeIndex = 0
    this.syncTextboxA11y()
  },

  focusComposer() {
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event('go-slim-composer-focus'))
    })
  },

  syncTextboxA11y() {
    const textarea = this.$root
      .closest('form')
      ?.querySelector<HTMLTextAreaElement>('textarea[name="message"]')
    if (textarea === undefined || textarea === null) return

    if (!this.open || this.surface === 'sessions') {
      textarea.removeAttribute('aria-controls')
      textarea.removeAttribute('aria-activedescendant')
      textarea.removeAttribute('aria-autocomplete')
      return
    }

    if (this.surface === 'help') {
      textarea.setAttribute('aria-controls', 'assistant-slash-help')
      textarea.removeAttribute('aria-activedescendant')
      textarea.removeAttribute('aria-autocomplete')
      return
    }

    textarea.setAttribute('aria-controls', 'assistant-slash-options')
    textarea.setAttribute('aria-autocomplete', 'list')
    if (this.itemCount > 0) {
      textarea.setAttribute(
        'aria-activedescendant',
        `assistant-slash-option-${this.activeIndex}`,
      )
    } else {
      textarea.removeAttribute('aria-activedescendant')
    }
  },

  destroy() {
    this.closeSurface(false)
  },
})
