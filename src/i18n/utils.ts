import type { ContentLocale } from '#lib/content-types.ts'
import {
  type ExtractPlaceholders,
  formatMessage,
  type MessageParameters,
  type TranslationParameterName,
  type TranslationParameterValues,
} from './format.ts'
import {
  defaultLocale,
  ui,
  type UiTranslationKey,
  type UiTranslationMessage,
} from './ui.ts'

export type TranslationParameters<Key extends UiTranslationKey> = Readonly<
  MessageParameters<
    ExtractPlaceholders<UiTranslationMessage<Key>> & TranslationParameterName
  >
>

type TranslationArguments<Key extends UiTranslationKey> =
  [ExtractPlaceholders<UiTranslationMessage<Key>>] extends [never]
    ? readonly []
    : readonly [parameters: TranslationParameters<Key>]

export type TranslationKeyWithoutParameters = {
  [Key in UiTranslationKey]:
    [ExtractPlaceholders<UiTranslationMessage<Key>>] extends [never]
      ? Key
      : never
}[UiTranslationKey]

export type Translate = <Key extends UiTranslationKey>(
  key: Key,
  ...arguments_: TranslationArguments<Key>
) => string

export function getTranslationTemplate<Key extends UiTranslationKey>(
  locale: ContentLocale,
  key: Key,
): string {
  return ui[locale]?.[key] ?? ui[defaultLocale][key]
}

export function useTranslations(locale: ContentLocale): Translate {
  return ((
    key: UiTranslationKey,
    parameters?: Partial<TranslationParameterValues>,
  ) => {
    const message = getTranslationTemplate(locale, key)
    return parameters === undefined
      ? message
      : formatMessage(message, parameters as MessageParameters, locale)
  }) as Translate
}
