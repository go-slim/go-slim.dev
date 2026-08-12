import type { ContentLocale } from '#lib/content-types.ts'

export type LocaleOption = {
  locale: ContentLocale
  label: string
  flag: string
}

type LocaleOptionDetails = Omit<LocaleOption, 'locale'>

const localeOptionDetails = {
  'en-US': {
    label: 'English',
    flag: 'circle-flags:us',
  },
  'zh-Hans': {
    label: '简体中文',
    flag: 'circle-flags:cn',
  },
} as const satisfies Record<ContentLocale, LocaleOptionDetails>

export const localeOptions = Object.entries(localeOptionDetails).map(
  ([locale, details]) => ({
    locale: locale as ContentLocale,
    ...details,
  }),
) satisfies LocaleOption[]

export function getLocaleOption(locale: ContentLocale): LocaleOption {
  return {
    locale,
    ...localeOptionDetails[locale],
  }
}
