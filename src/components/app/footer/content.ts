import { useTranslations } from '#i18n/utils.ts'
import type { ContentLocale } from '#lib/content-types.ts'
import { discordInviteUrl } from '#data/community-links.ts'

const socialLinks = [
  {
    href: 'https://github.com/orgs/go-slim/discussions',
    icon: 'tabler:brand-github',
    label: 'GitHub Discussions',
    external: true,
  },
  {
    href: discordInviteUrl,
    icon: 'tabler:brand-discord',
    label: 'Discord',
    external: true,
  },
] as const

export function getAppFooterContent(locale: ContentLocale) {
  const t = useTranslations(locale)

  return {
    copyright: t('footer.copyright', {
      year: new Date().getUTCFullYear(),
    }),
    socialLabel: t('footer.socialLinks'),
    socialLinks,
  }
}
