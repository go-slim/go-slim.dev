import type { Alpine, AlpineComponent } from 'alpinejs'
import { formatMessage } from '#i18n/format.ts'

export type MemberDirectoryView = 'compact' | 'large' | 'list'
export type MemberDirectoryGroup = 'none' | 'level' | 'library'
export type MemberDirectorySort = 'none' | 'name' | 'level' | 'contributions'

type DirectoryMember = {
  id: string
  name: string
  level: string
  contributionWeight: number
  libraries: string[]
}

export type MemberDirectoryOptions = {
  locale: string
  countTemplate: string
  singularLabel: string
  pluralLabel: string
  members: DirectoryMember[]
}

export interface MemberDirectoryComponent {
  view: MemberDirectoryView
  groupBy: MemberDirectoryGroup
  sortBy: MemberDirectorySort
  selectedLibraries: string[]
  popstateHandler: (() => void) | null
  readonly activeFilterCount: number
  readonly hasActiveFilters: boolean
  readonly filteredCount: number
  readonly countLabel: string
  init(): void
  destroy(): void
  readQueryString(): void
  updateQueryString(): void
  setView(view: MemberDirectoryView): void
  setGroupBy(groupBy: MemberDirectoryGroup): void
  setSortBy(sortBy: MemberDirectorySort): void
  setLibrary(library: string, selected: boolean): void
  isMemberVisible(id: string): boolean
  memberOrder(id: string): number
  compareMembers(a: DirectoryMember, b: DirectoryMember): number
}

const views = ['compact', 'large', 'list'] as const
const groups = ['none', 'level', 'library'] as const
const sorts = ['none', 'name', 'level', 'contributions'] as const
const queryKeys = ['view', 'group', 'sort', 'library', 'libraries']
const levelOrder: Record<string, number> = {
  core: 0,
  maintainer: 1,
  contributor: 2,
}

const readOption = <T extends string>(
  value: string | null,
  options: readonly T[],
  fallback: T,
): T => options.includes(value as T) ? value as T : fallback

export const memberDirectory = (
  options: MemberDirectoryOptions,
): AlpineComponent<MemberDirectoryComponent> => {
  const collator = new Intl.Collator(options.locale)
  const availableLibraries = new Set(
    options.members.flatMap((member) => member.libraries),
  )
  const membersById = new Map(
    options.members.map((member) => [member.id, member]),
  )

  return {
    view: 'compact',
    groupBy: 'none',
    sortBy: 'none',
    selectedLibraries: [],
    popstateHandler: null,

    init() {
      this.readQueryString()
      this.popstateHandler = () => this.readQueryString()
      addEventListener('popstate', this.popstateHandler)
    },

    destroy() {
      if (this.popstateHandler !== null) {
        removeEventListener('popstate', this.popstateHandler)
      }
    },

    readQueryString() {
      const params = new URLSearchParams(location.search)
      const legacyLibraries = params.get('libraries')?.split(',') ?? []
      const requestedLibraries = [
        ...params.getAll('library'),
        ...legacyLibraries,
      ]

      this.view = readOption(params.get('view'), views, 'compact')
      this.groupBy = readOption(params.get('group'), groups, 'none')
      this.sortBy = readOption(params.get('sort'), sorts, 'none')
      this.selectedLibraries = Array.from(new Set(requestedLibraries))
        .filter((library) => availableLibraries.has(library))
    },

    updateQueryString() {
      const url = new URL(location.href)
      for (const key of queryKeys) url.searchParams.delete(key)

      if (this.view !== 'compact') url.searchParams.set('view', this.view)
      if (this.groupBy !== 'none') url.searchParams.set('group', this.groupBy)
      if (this.sortBy !== 'none') url.searchParams.set('sort', this.sortBy)
      for (const library of [...this.selectedLibraries].sort()) {
        url.searchParams.append('library', library)
      }

      history.replaceState(
        history.state,
        '',
        `${url.pathname}${url.search}${url.hash}`,
      )
    },

    setView(view) {
      this.view = view
      this.updateQueryString()
    },

    setGroupBy(groupBy) {
      if (!groups.includes(groupBy)) return
      this.groupBy = groupBy
      this.updateQueryString()
    },

    setSortBy(sortBy) {
      if (!sorts.includes(sortBy)) return
      this.sortBy = sortBy
      this.updateQueryString()
    },

    setLibrary(library, selected) {
      if (!availableLibraries.has(library)) return

      this.selectedLibraries = selected
        ? Array.from(new Set([...this.selectedLibraries, library]))
        : this.selectedLibraries.filter((candidate) => candidate !== library)
      this.updateQueryString()
    },

    get activeFilterCount() {
      return Number(this.groupBy !== 'none') +
        Number(this.sortBy !== 'none') +
        this.selectedLibraries.length
    },

    get hasActiveFilters() {
      return this.activeFilterCount > 0
    },

    get filteredCount() {
      return options.members.filter((member) =>
        this.selectedLibraries.length === 0 ||
        member.libraries.some((library) =>
          this.selectedLibraries.includes(library),
        )
      ).length
    },

    get countLabel() {
      const label = new Intl.PluralRules(options.locale).select(
        this.filteredCount,
      ) === 'one'
        ? options.singularLabel
        : options.pluralLabel
      return formatMessage(options.countTemplate, {
        count: this.filteredCount,
        unit: label,
      }, options.locale)
    },

    isMemberVisible(id) {
      const member = membersById.get(id)
      return member !== undefined && (
        this.selectedLibraries.length === 0 ||
        member.libraries.some((library) =>
          this.selectedLibraries.includes(library),
        )
      )
    },

    memberOrder(id) {
      return [...options.members]
        .sort((left, right) => this.compareMembers(left, right))
        .findIndex((member) => member.id === id)
    },

    compareMembers(left, right) {
      if (this.groupBy === 'level') {
        const difference = (levelOrder[left.level] ?? 99) -
          (levelOrder[right.level] ?? 99)
        if (difference !== 0) return difference
      } else if (this.groupBy === 'library') {
        const difference = collator.compare(
          left.libraries[0] ?? '\uffff',
          right.libraries[0] ?? '\uffff',
        )
        if (difference !== 0) return difference
      }

      if (this.sortBy === 'name') return collator.compare(left.name, right.name)
      if (this.sortBy === 'level') {
        return (levelOrder[left.level] ?? 99) -
          (levelOrder[right.level] ?? 99)
      }
      if (this.sortBy === 'contributions') {
        return right.contributionWeight - left.contributionWeight
      }
      return 0
    },
  }
}

export const registerMemberDirectory = (Alpine: Alpine) => {
  Alpine.data('memberDirectory', memberDirectory)
}
