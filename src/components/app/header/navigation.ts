import type {
  ContentLocale,
  LibraryNavGroup,
  LibraryStatus,
} from '#lib/content-types.ts'
import { discordInviteUrl } from '#data/community-links.ts'
import { useTranslations } from '#i18n/utils.ts'
import { localePrefix } from '#lib/content-types.ts'

type MenuEntry = {
  icon: string
  title: string
  description?: string
  status?: LibraryStatus
}

export type MenuItem = MenuEntry &
  (
    | {
      href: string
      external?: boolean
    }
    | {
      href?: never
      external?: never
    }
  )

export type MenuAction = Omit<MenuEntry, 'description'> & {
  href: string
  external?: boolean
}

export type MenuGroup = {
  title: string
  items: readonly MenuItem[]
}

export type MenuLink =
  | {
    kind: 'link'
    title: string
    href: string
    external?: boolean
  }
  | {
    kind: 'menu'
    id: string
    title: string
    groups: readonly MenuGroup[]
    more?: MenuAction
  }

const libraryIconName = (icon: string) =>
  icon.replace(/^icons\//, '').replace(/\.svg$/i, '')

export function createNavigationLinks(
  locale: ContentLocale,
  libraryGroups: readonly LibraryNavGroup[],
): readonly MenuLink[] {
  const t = useTranslations(locale)
  const prefix = localePrefix(locale)

  return [
    {
      kind: 'menu',
      id: 'libraries',
      title: t('header.nav.libraries'),
      groups: libraryGroups.map((group) => ({
        title: group.title,
        items: group.items.map((item) => ({
          icon: libraryIconName(item.icon),
          title: item.name,
          description: item.description,
          href: item.href,
          status: item.status,
        })),
      })),
      more: {
        icon: 'tabler:layout-grid',
        title: t('header.nav.browseLibraries'),
        href: `${prefix}/libraries`,
      },
    },
    {
      kind: 'link',
      title: t('header.nav.blog'),
      href: `${prefix}/blog`,
    },
    {
      kind: 'menu',
      id: 'community',
      title: t('header.nav.community'),
      groups: [
        {
          title: t('header.nav.channels'),
          items: [
            {
              icon: 'tabler:brand-discord',
              title: 'Discord',
              description: t('header.nav.discordDescription'),
              href: discordInviteUrl,
              external: true,
            },
            {
              icon: 'tabler:brand-github',
              title: 'GitHub',
              description: t('header.nav.githubDescription'),
              href: 'https://github.com/go-slim',
              external: true,
            },
          ],
        },
        {
          title: t('header.nav.peopleAndWork'),
          items: [
            {
              icon: 'tabler:users',
              title: t('header.nav.maintainers'),
              description: t('header.nav.maintainersDescription'),
              href: `${prefix}/community/maintainers`,
            },
            {
              icon: 'tabler:layout-dashboard',
              title: t('header.nav.showcase'),
              description: t('header.nav.showcaseDescription'),
            },
          ],
        },
      ],
    },
  ] satisfies readonly MenuLink[]
}
