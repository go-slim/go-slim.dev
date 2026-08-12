import type { Alpine } from 'alpinejs'
import { isContentLocale } from '#lib/content-types.ts'
import { defaultLocale } from '#i18n/ui.ts'
import { useTranslations } from '#i18n/utils.ts'
import {
  defaultLocalAiModelId,
  isLocalAiModelId,
  type LocalAiModelId,
} from '#data/ai-models.ts'
import { createAiPersistence } from '#state/ai-persistence.ts'

export interface AiReply {
  id: string
  content: string
  status: AiReplyStatus
  sources: AiSourceReference[]
  createdAt: number
}

export type AiReplyStatus =
  | 'thinking'
  | 'model-selection'
  | 'streaming'
  | 'complete'
  | 'error'
  | 'stopped'

export interface AiSourceReference {
  url: string
  title: string
  section: string
}

export interface AiQuestion {
  id: string
  message: string
  replies: AiReply[]
  createdAt: number
}

export interface AiConversation {
  id: string
  title: string
  draft: string
  modelId: LocalAiModelId | null
  questions: AiQuestion[]
  createdAt: number
  updatedAt: number
}

export interface AiRequestDetail {
  questionId: string
  message: string
  downloadApprovedModelId?: LocalAiModelId
}

export type AiPersistenceState = 'loading' | 'ready' | 'unavailable'

interface AiSnapshotV1 {
  schemaVersion: 1
  savedAt: number
  sequence: number
  draft: string
  sendOnEnter: boolean
  active: AiConversation | null
  history: AiConversation[]
}

export interface AiStore {
  panelOpen: boolean
  generating: boolean
  activeQuestionId: string | null
  announcement: string
  draft: string
  sendOnEnter: boolean
  persistenceState: AiPersistenceState
  activeConversationId: string | null
  activeConversationCreatedAt: number | null
  selectedModelId: LocalAiModelId | null
  modelChoiceId: LocalAiModelId
  awaitingModelQuestionId: string | null
  questions: AiQuestion[]
  conversations: AiConversation[]
  sequence: number
  readonly canSend: boolean
  readonly hasActiveConversation: boolean
  init(): void
  openPanel(): void
  closePanel(): void
  togglePanel(): void
  submit(): void
  handleComposerKeydown(event: KeyboardEvent): void
  addReply(
    questionId: string,
    content: string,
    status?: AiReplyStatus,
  ): string | null
  appendReply(questionId: string, replyId: string, chunk: string): void
  updateReply(
    questionId: string,
    replyId: string,
    update: Partial<Pick<AiReply, 'content' | 'status' | 'sources'>>,
  ): void
  beginGeneration(questionId: string): void
  finishGeneration(questionId: string): void
  stop(): void
  retry(questionId: string): void
  switchConversationModel(modelId: string): void
  requireModelSelection(questionId: string): void
  confirmModelSelection(questionId: string): void
  dismissModelSelection(questionId: string): void
  startNewConversation(): void
  openConversation(conversationId: string): void
  removeConversation(conversationId: string): void
  schedulePersistence(immediate?: boolean): void
  clear(): void
  destroy(): Promise<void>
}

declare module 'alpinejs' {
  interface Stores {
    ai: AiStore
  }
}

declare global {
  interface WindowEventMap {
    'go-slim:ai-request': CustomEvent<AiRequestDetail>
    'go-slim:ai-stop': CustomEvent<{ questionId: string | null }>
  }
}

const createId = (prefix: string, sequence: number) =>
  `${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}`

const cloneQuestion = (question: AiQuestion): AiQuestion => ({
  ...question,
  replies: question.replies.map((reply) => ({
    ...reply,
    sources: reply.sources.map((source) => ({ ...source })),
  })),
})

const cloneConversation = (conversation: AiConversation): AiConversation => ({
  ...conversation,
  questions: conversation.questions.map(cloneQuestion),
})

const replyStatuses = [
  'thinking',
  'model-selection',
  'streaming',
  'complete',
  'error',
  'stopped',
] as const satisfies readonly AiReplyStatus[]

const maximumDraftLength = 4_000
const maximumMessageLength = 4_000
const maximumReplyLength = 200_000
const maximumQuestions = 200
const maximumReplies = 20
const maximumSources = 20
const maximumHistory = 100

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readString = (value: unknown, maximumLength: number): string | null =>
  typeof value === 'string' ? value.slice(0, maximumLength) : null

const readTimestamp = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null

const isReplyStatus = (value: unknown): value is AiReplyStatus =>
  typeof value === 'string' &&
  (replyStatuses as readonly string[]).includes(value)

const isSafeSourceUrl = (value: string): boolean => {
  try {
    const url = new URL(value, window.location.href)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

const parseSource = (value: unknown): AiSourceReference | null => {
  if (!isRecord(value)) return null
  const url = readString(value.url, 2_000)
  const title = readString(value.title, 500)
  const section = readString(value.section, 500)
  if (url === null || title === null || section === null) return null
  if (!isSafeSourceUrl(url)) return null
  return { url, title, section }
}

const parseReply = (
  value: unknown,
  interruptedMessage: string,
  modelSelectionDeclined: string,
): AiReply | null => {
  if (!isRecord(value)) return null
  const id = readString(value.id, 200)
  const content = readString(value.content, maximumReplyLength)
  const createdAt = readTimestamp(value.createdAt)
  if (
    id === null ||
    id === '' ||
    content === null ||
    createdAt === null ||
    !isReplyStatus(value.status)
  ) {
    return null
  }

  const sources = Array.isArray(value.sources)
    ? value.sources.slice(0, maximumSources).flatMap((source) => {
        const parsed = parseSource(source)
        return parsed === null ? [] : [parsed]
      })
    : []

  if (value.status === 'thinking') {
    return {
      id,
      content: interruptedMessage,
      status: 'stopped',
      sources,
      createdAt,
    }
  }
  if (value.status === 'streaming') {
    return {
      id,
      content: content.trim() === '' ? interruptedMessage : content,
      status: 'stopped',
      sources,
      createdAt,
    }
  }
  if (value.status === 'model-selection') {
    return {
      id,
      content: modelSelectionDeclined,
      status: 'stopped',
      sources: [],
      createdAt,
    }
  }

  return { id, content, status: value.status, sources, createdAt }
}

const parseQuestion = (
  value: unknown,
  interruptedMessage: string,
  modelSelectionDeclined: string,
): AiQuestion | null => {
  if (!isRecord(value)) return null
  const id = readString(value.id, 200)
  const message = readString(value.message, maximumMessageLength)
  const createdAt = readTimestamp(value.createdAt)
  if (id === null || id === '' || message === null || createdAt === null) {
    return null
  }

  const seenReplies = new Set<string>()
  const replies = Array.isArray(value.replies)
    ? value.replies.slice(0, maximumReplies).flatMap((reply) => {
        const parsed = parseReply(
          reply,
          interruptedMessage,
          modelSelectionDeclined,
        )
        if (parsed === null || seenReplies.has(parsed.id)) return []
        seenReplies.add(parsed.id)
        return [parsed]
      })
    : []
  return { id, message, replies, createdAt }
}

const parseConversation = (
  value: unknown,
  interruptedMessage: string,
  modelSelectionDeclined: string,
): AiConversation | null => {
  if (!isRecord(value)) return null
  const id = readString(value.id, 200)
  const title = readString(value.title, maximumMessageLength)
  const createdAt = readTimestamp(value.createdAt)
  const updatedAt = readTimestamp(value.updatedAt)
  if (
    id === null ||
    id === '' ||
    title === null ||
    createdAt === null ||
    updatedAt === null
  ) {
    return null
  }

  const seenQuestions = new Set<string>()
  const questions = Array.isArray(value.questions)
    ? value.questions.slice(0, maximumQuestions).flatMap((question) => {
        const parsed = parseQuestion(
          question,
          interruptedMessage,
          modelSelectionDeclined,
        )
        if (parsed === null || seenQuestions.has(parsed.id)) return []
        seenQuestions.add(parsed.id)
        return [parsed]
      })
    : []
  const modelId =
    typeof value.modelId === 'string' && isLocalAiModelId(value.modelId)
      ? value.modelId
      : null
  const draft =
    value.draft === undefined ? '' : readString(value.draft, maximumDraftLength)
  if (draft === null) return null

  return { id, title, draft, modelId, questions, createdAt, updatedAt }
}

const parseSnapshot = (
  value: unknown,
  interruptedMessage: string,
  modelSelectionDeclined: string,
): AiSnapshotV1 | null => {
  if (!isRecord(value) || value.schemaVersion !== 1) return null
  const savedAt = readTimestamp(value.savedAt)
  const sequence =
    typeof value.sequence === 'number' &&
    Number.isSafeInteger(value.sequence) &&
    value.sequence >= 0
      ? value.sequence
      : null
  const draft = readString(value.draft, maximumDraftLength)
  if (
    savedAt === null ||
    sequence === null ||
    draft === null ||
    typeof value.sendOnEnter !== 'boolean'
  ) {
    return null
  }

  const active =
    value.active === null
      ? null
      : parseConversation(
          value.active,
          interruptedMessage,
          modelSelectionDeclined,
        )
  if (value.active !== null && active === null) return null

  const seenConversations = new Set(active === null ? [] : [active.id])
  const history = Array.isArray(value.history)
    ? value.history.slice(0, maximumHistory).flatMap((conversation) => {
        const parsed = parseConversation(
          conversation,
          interruptedMessage,
          modelSelectionDeclined,
        )
        if (parsed === null || seenConversations.has(parsed.id)) return []
        seenConversations.add(parsed.id)
        return [parsed]
      })
    : []

  return {
    schemaVersion: 1,
    savedAt,
    sequence,
    draft,
    sendOnEnter: value.sendOnEnter,
    active,
    history: history.sort((left, right) => right.updatedAt - left.updatedAt),
  }
}

const desktopPanelMedia = window.matchMedia('(min-width: 64rem)')
const modelStorageKey = 'go-slim-ai-model'

const getStoredModelId = (): LocalAiModelId | null => {
  try {
    const value = localStorage.getItem(modelStorageKey)
    return value !== null && isLocalAiModelId(value) ? value : null
  } catch {
    return null
  }
}

export const createAiStore = (
  untitledConversation: string,
  modelSelectionDeclined: string,
  interruptedMessage: string,
  hydrationBarrier: Promise<void> = Promise.resolve(),
): AiStore => {
  let store: AiStore
  let registeredStore: AiStore | null = null
  let changedBeforeHydration = false
  let discardRestoredState = false
  let destroyed = false
  let hydrationEpoch = 0
  let lifecycleController: AbortController | null = null

  const currentStore = () => registeredStore ?? store

  const activeConversation = (): AiConversation | null => {
    const target = currentStore()
    if (
      (target.questions.length === 0 &&
        target.draft.trim() === '' &&
        target.selectedModelId === null) ||
      target.activeConversationId === null ||
      target.activeConversationCreatedAt === null
    ) {
      return null
    }

    return {
      id: target.activeConversationId,
      title:
        target.questions[0]?.message ??
        (target.draft.trim() || untitledConversation),
      draft: target.draft.slice(0, maximumDraftLength),
      modelId: target.selectedModelId,
      questions: target.questions.map(cloneQuestion),
      createdAt: target.activeConversationCreatedAt,
      updatedAt: Date.now(),
    }
  }

  const snapshot = (): AiSnapshotV1 => {
    const target = currentStore()
    return {
      schemaVersion: 1,
      savedAt: Date.now(),
      sequence: target.sequence,
      draft: target.draft.slice(0, maximumDraftLength),
      sendOnEnter: target.sendOnEnter,
      active: activeConversation(),
      history: target.conversations
        .slice(0, maximumHistory)
        .map(cloneConversation),
    }
  }

  const persistence = createAiPersistence(snapshot)

  const normalizePendingSelection = () => {
    const target = currentStore()
    if (target.awaitingModelQuestionId === null) return
    const pendingQuestion = target.questions.find(
      ({ id }) => id === target.awaitingModelQuestionId,
    )
    for (const reply of pendingQuestion?.replies ?? []) {
      if (reply.status !== 'model-selection') continue
      reply.content = modelSelectionDeclined
      reply.status = 'stopped'
    }
  }

  const archiveActiveConversation = () => {
    const target = currentStore()
    // A model-only active state is persisted for refresh recovery, but it is
    // not useful as an empty entry in the conversation history.
    if (target.questions.length === 0 && target.draft.trim() === '') return
    const conversation = activeConversation()
    if (conversation === null) return
    target.conversations = [
      conversation,
      ...target.conversations.filter(({ id }) => id !== conversation.id),
    ].slice(0, maximumHistory)
  }

  const resetActiveConversation = () => {
    const target = currentStore()
    target.draft = ''
    target.announcement = ''
    target.questions = []
    target.activeConversationId = null
    target.activeConversationCreatedAt = null
    target.selectedModelId = null
    target.awaitingModelQuestionId = null
    target.generating = false
    target.activeQuestionId = null
  }

  const hydrate = async (epoch: number) => {
    try {
      await hydrationBarrier
      if (destroyed || epoch !== hydrationEpoch) return
      const value = await persistence.load()
      if (destroyed || epoch !== hydrationEpoch) return
      const target = currentStore()
      if (discardRestoredState) {
        target.persistenceState = 'ready'
        target.schedulePersistence(true)
        return
      }
      if (value === null) {
        target.persistenceState = 'ready'
        if (changedBeforeHydration) target.schedulePersistence()
        return
      }

      const restored = parseSnapshot(
        value,
        interruptedMessage,
        modelSelectionDeclined,
      )
      if (restored === null) {
        target.persistenceState = 'unavailable'
        console.warn('The saved AI conversation has an unsupported format.')
        return
      }

      const currentDraft = target.draft
      const currentSendOnEnter = target.sendOnEnter
      target.sequence = restored.sequence
      target.draft = changedBeforeHydration
        ? currentDraft
        : (restored.active?.draft ?? restored.draft)
      target.sendOnEnter = changedBeforeHydration
        ? currentSendOnEnter
        : restored.sendOnEnter
      target.conversations = restored.history.map(cloneConversation)
      target.questions = restored.active?.questions.map(cloneQuestion) ?? []
      target.activeConversationId = restored.active?.id ?? null
      target.activeConversationCreatedAt = restored.active?.createdAt ?? null
      target.selectedModelId = restored.active?.modelId ?? null
      if (target.selectedModelId !== null) {
        target.modelChoiceId = target.selectedModelId
      }
      target.awaitingModelQuestionId = null
      target.generating = false
      target.activeQuestionId = null
      target.announcement = ''
      target.persistenceState = 'ready'

      // Persist the normalized stopped state for any generation interrupted by
      // a refresh, so it cannot reappear as active on the next restoration.
      target.schedulePersistence(true)
    } catch (error) {
      if (destroyed || epoch !== hydrationEpoch) return
      currentStore().persistenceState = 'unavailable'
      console.warn('Could not restore the saved AI conversation.', error)
    }
  }

  store = {
    panelOpen: false,
    generating: false,
    activeQuestionId: null,
    announcement: '',
    draft: '',
    sendOnEnter: false,
    persistenceState: 'loading',
    activeConversationId: null,
    activeConversationCreatedAt: null,
    // A model is active only for the current conversation. The stored value is
    // merely the default choice shown when a new conversation asks for consent.
    selectedModelId: null,
    modelChoiceId: getStoredModelId() ?? defaultLocalAiModelId,
    awaitingModelQuestionId: null,
    questions: [],
    conversations: [],
    sequence: 0,

    get canSend() {
      return (
        this.draft.trim() !== '' &&
        !this.generating &&
        this.persistenceState !== 'loading' &&
        this.awaitingModelQuestionId === null
      )
    },

    get hasActiveConversation() {
      return (
        this.questions.length > 0 ||
        this.draft.trim() !== '' ||
        this.selectedModelId !== null
      )
    },

    init() {
      registeredStore = this
      destroyed = false
      lifecycleController?.abort()
      lifecycleController = new AbortController()
      const { signal } = lifecycleController
      desktopPanelMedia.addEventListener(
        'change',
        (event) => {
          if (!event.matches) this.closePanel()
        },
        { signal },
      )
      document.addEventListener(
        'visibilitychange',
        () => {
          if (document.visibilityState === 'hidden') {
            void persistence.flush().catch((error) => {
              console.warn('Could not save the AI conversation.', error)
            })
          }
        },
        { signal },
      )
      window.addEventListener(
        'pagehide',
        () => {
          void persistence.flush().catch((error) => {
            console.warn('Could not save the AI conversation.', error)
          })
        },
        { signal },
      )
      const epoch = ++hydrationEpoch
      void hydrate(epoch)
    },

    openPanel() {
      this.panelOpen = true
    },

    closePanel() {
      this.panelOpen = false
    },

    togglePanel() {
      this.panelOpen = !this.panelOpen
    },

    submit() {
      const message = this.draft.trim().slice(0, maximumMessageLength)
      if (!this.canSend || message === '') return

      const now = Date.now()
      if (this.activeConversationId === null) {
        this.sequence += 1
        this.activeConversationId = createId('conversation', this.sequence)
        this.activeConversationCreatedAt = now
      }
      this.sequence += 1
      const questionId = createId('question', this.sequence)
      this.questions.push({
        id: questionId,
        message,
        replies: [],
        createdAt: now,
      })
      this.draft = ''

      window.dispatchEvent(
        new CustomEvent<AiRequestDetail>('go-slim:ai-request', {
          detail: { questionId, message },
        }),
      )
      this.schedulePersistence()
    },

    handleComposerKeydown(event) {
      if (
        event.key !== 'Enter' ||
        event.shiftKey ||
        event.isComposing ||
        !this.sendOnEnter ||
        !this.canSend
      ) {
        return
      }

      event.preventDefault()
      this.submit()
    },

    addReply(questionId, content, status = 'thinking') {
      const question = this.questions.find(({ id }) => id === questionId)
      if (question === undefined) return null

      this.sequence += 1
      const replyId = createId('reply', this.sequence)
      question.replies.push({
        id: replyId,
        content,
        status,
        sources: [],
        createdAt: Date.now(),
      })
      this.schedulePersistence()
      return replyId
    },

    appendReply(questionId, replyId, chunk) {
      if (chunk === '') return

      const question = this.questions.find(({ id }) => id === questionId)
      const reply = question?.replies.find(({ id }) => id === replyId)
      if (reply !== undefined) {
        reply.content = (reply.content + chunk).slice(0, maximumReplyLength)
        this.schedulePersistence()
      }
    },

    updateReply(questionId, replyId, update) {
      const question = this.questions.find(({ id }) => id === questionId)
      const reply = question?.replies.find(({ id }) => id === replyId)
      if (reply === undefined) return

      if (update.content !== undefined) {
        reply.content = update.content.slice(0, maximumReplyLength)
      }
      if (update.status !== undefined) reply.status = update.status
      if (update.sources !== undefined) {
        reply.sources = update.sources
          .slice(0, maximumSources)
          .map((source) => ({ ...source }))
      }
      const terminal =
        update.status !== undefined &&
        update.status !== 'thinking' &&
        update.status !== 'streaming'
      this.schedulePersistence(terminal)
    },

    beginGeneration(questionId) {
      this.generating = true
      this.activeQuestionId = questionId
    },

    finishGeneration(questionId) {
      if (this.activeQuestionId !== questionId) return
      this.generating = false
      this.activeQuestionId = null
      this.schedulePersistence(true)
    },

    stop() {
      if (!this.generating) return
      window.dispatchEvent(
        new CustomEvent('go-slim:ai-stop', {
          detail: { questionId: this.activeQuestionId },
        }),
      )
    },

    retry(questionId) {
      if (this.generating || this.awaitingModelQuestionId !== null) return
      const question = this.questions.find(({ id }) => id === questionId)
      if (question === undefined) return

      window.dispatchEvent(
        new CustomEvent<AiRequestDetail>('go-slim:ai-request', {
          detail: { questionId, message: question.message },
        }),
      )
    },

    switchConversationModel(modelId) {
      if (
        this.generating ||
        this.awaitingModelQuestionId !== null ||
        this.persistenceState === 'loading' ||
        !isLocalAiModelId(modelId)
      ) {
        return
      }
      if (this.selectedModelId === modelId) return

      this.selectedModelId = modelId
      this.schedulePersistence(true)
    },

    requireModelSelection(questionId) {
      this.awaitingModelQuestionId = questionId
      if (this.selectedModelId !== null) {
        this.modelChoiceId = this.selectedModelId
      }
      this.schedulePersistence(true)
    },

    confirmModelSelection(questionId) {
      if (this.awaitingModelQuestionId !== questionId) return

      const question = this.questions.find(({ id }) => id === questionId)
      if (question === undefined) return

      const modelId = this.modelChoiceId
      if (!isLocalAiModelId(modelId)) {
        this.modelChoiceId = defaultLocalAiModelId
        return
      }
      this.selectedModelId = modelId
      try {
        localStorage.setItem(modelStorageKey, modelId)
      } catch {
        // The confirmed model remains selected for this page session.
      }
      this.awaitingModelQuestionId = null
      question.replies = question.replies.filter(
        ({ status }) => status !== 'model-selection',
      )
      this.schedulePersistence(true)

      window.dispatchEvent(
        new CustomEvent<AiRequestDetail>('go-slim:ai-request', {
          detail: {
            questionId,
            message: question.message,
            downloadApprovedModelId: modelId,
          },
        }),
      )
      window.requestAnimationFrame(() => {
        window.dispatchEvent(new Event('go-slim-composer-focus'))
      })
    },

    dismissModelSelection(questionId) {
      if (this.awaitingModelQuestionId !== questionId) return

      const question = this.questions.find(({ id }) => id === questionId)
      const reply = question?.replies.findLast(
        ({ status }) => status === 'model-selection',
      )
      if (reply !== undefined) {
        reply.content = modelSelectionDeclined
        reply.status = 'stopped'
      }
      this.awaitingModelQuestionId = null
      this.announcement = modelSelectionDeclined
      this.schedulePersistence(true)
      window.requestAnimationFrame(() => {
        window.dispatchEvent(new Event('go-slim-composer-focus'))
      })
    },

    startNewConversation() {
      if (this.persistenceState === 'loading') discardRestoredState = true
      this.stop()
      normalizePendingSelection()
      archiveActiveConversation()
      resetActiveConversation()
      this.schedulePersistence(true)
      window.requestAnimationFrame(() => {
        window.dispatchEvent(new Event('go-slim-composer-focus'))
      })
    },

    openConversation(conversationId) {
      if (this.persistenceState === 'loading') return
      const conversation = this.conversations.find(
        ({ id }) => id === conversationId,
      )
      if (conversation === undefined) return

      const target = cloneConversation(conversation)
      this.stop()
      normalizePendingSelection()
      archiveActiveConversation()
      this.conversations = this.conversations.filter(
        ({ id }) => id !== conversationId,
      )
      resetActiveConversation()
      this.activeConversationId = target.id
      this.activeConversationCreatedAt = target.createdAt
      this.draft = target.draft
      this.questions = target.questions.map(cloneQuestion)
      this.selectedModelId = target.modelId
      this.modelChoiceId =
        target.modelId ?? getStoredModelId() ?? defaultLocalAiModelId
      this.schedulePersistence(true)
      window.requestAnimationFrame(() => {
        window.dispatchEvent(new Event('go-slim-composer-focus'))
      })
    },

    removeConversation(conversationId) {
      this.conversations = this.conversations.filter(
        ({ id }) => id !== conversationId,
      )
      this.schedulePersistence(true)
    },

    schedulePersistence(immediate = false) {
      if (this.persistenceState === 'loading') {
        changedBeforeHydration = true
        return
      }
      if (this.persistenceState === 'unavailable') return

      if (
        (this.draft.trim() !== '' || this.selectedModelId !== null) &&
        this.activeConversationId === null
      ) {
        this.sequence += 1
        this.activeConversationId = createId('conversation', this.sequence)
        this.activeConversationCreatedAt = Date.now()
      }

      const hasData =
        this.draft.trim() !== '' ||
        this.questions.length > 0 ||
        this.selectedModelId !== null ||
        this.conversations.length > 0
      if (!hasData) {
        void persistence.clear().catch((error) => {
          this.persistenceState = 'unavailable'
          console.warn('Could not clear the saved AI conversation.', error)
        })
        return
      }

      persistence.schedule()
      if (immediate) {
        void persistence.flush().catch((error) => {
          this.persistenceState = 'unavailable'
          console.warn('Could not save the AI conversation.', error)
        })
      }
    },

    clear() {
      if (this.persistenceState === 'loading') discardRestoredState = true
      this.stop()
      this.draft = ''
      this.announcement = ''
      this.questions = []
      this.conversations = []
      this.activeConversationId = null
      this.activeConversationCreatedAt = null
      this.selectedModelId = null
      this.awaitingModelQuestionId = null
      this.generating = false
      this.activeQuestionId = null
      void persistence.clear().catch((error) => {
        this.persistenceState = 'unavailable'
        console.warn('Could not clear the saved AI conversation.', error)
      })
    },

    async destroy() {
      destroyed = true
      hydrationEpoch += 1
      lifecycleController?.abort()
      lifecycleController = null
      await persistence.destroy()
    },
  }

  return store
}

let activeStore: AiStore | null = null

export const registerAiStore = (Alpine: Alpine) => {
  const documentLocale = document.documentElement.lang
  const locale = isContentLocale(documentLocale)
    ? documentLocale
    : defaultLocale
  const t = useTranslations(locale)
  const hydrationBarrier = activeStore?.destroy() ?? Promise.resolve()
  activeStore = createAiStore(
    t('assistant.untitledConversation'),
    t('assistant.modelSelectionDeclined'),
    t('assistant.restoredInterrupted'),
    hydrationBarrier,
  )
  Alpine.store('ai', activeStore)
}
