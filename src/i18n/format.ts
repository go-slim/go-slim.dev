export type TranslationParameterValues = {
  count: number
  group: string
  page: number
  pages: number
  progress: number
  unit: string
  url: string
  year: number
}

export type TranslationParameterName = keyof TranslationParameterValues

export type ExtractPlaceholders<Message extends string> =
  Message extends `${string}{${infer Name}}${infer Rest}`
    ? Name | ExtractPlaceholders<Rest>
    : never

export type MessageParameters<
  Names extends TranslationParameterName = TranslationParameterName,
> = Readonly<Pick<TranslationParameterValues, Names>>

type ValidMessage<Message extends string> =
  Exclude<ExtractPlaceholders<Message>, TranslationParameterName> extends never
    ? Message
    : never

type MatchingMessage<
  Base extends string,
  Candidate extends string,
> = Exclude<
  ExtractPlaceholders<Base>,
  ExtractPlaceholders<Candidate>
> extends never
  ? Exclude<
      ExtractPlaceholders<Candidate>,
      ExtractPlaceholders<Base>
    > extends never
    ? Candidate
    : never
  : never

type MatchingMessages<
  Base extends Record<string, string>,
  Messages extends Record<keyof Base, string>,
> = {
  [Key in keyof Base]: MatchingMessage<Base[Key], Messages[Key]>
}

export function defineDefaultMessages<
  const Messages extends Record<string, string>,
>(
  messages: Messages & {
    [Key in keyof Messages]: ValidMessage<Messages[Key]>
  },
): Messages {
  return messages
}

export function defineLocalizedMessages<
  Base extends Record<string, string>,
  const Messages extends Record<keyof Base, string>,
>(
  _base: Base,
  messages: Messages & MatchingMessages<Base, Messages>,
): Messages {
  return messages
}

const placeholderPattern = /\{([^{}]+)\}/g

/**
 * Interpolates an already-localized message.
 *
 * This helper is safe to ship to the browser: it contains no locale
 * dictionaries. Astro should select the localized template at build time,
 * while client code supplies only values that are known at runtime.
 */
export function formatMessage<Names extends TranslationParameterName>(
  message: string,
  parameters: MessageParameters<Names>,
  locale: string,
): string {
  const formatted = message.replace(placeholderPattern, (placeholder, name: string) =>
    Object.hasOwn(parameters, name) && name in parameters
      ? formatParameter(
          name as TranslationParameterName,
          parameters[name as Names],
          locale,
        )
      : placeholder
  )

  if (import.meta.env.DEV && /\{[^{}]+\}/.test(formatted)) {
    throw new Error(`Missing translation parameter in: ${formatted}`)
  }

  return formatted
}

function formatParameter(
  name: TranslationParameterName,
  value: TranslationParameterValues[TranslationParameterName],
  locale: string,
): string {
  if (
    (name === 'count' || name === 'page' || name === 'pages') &&
    typeof value === 'number'
  ) {
    return new Intl.NumberFormat(locale).format(value)
  }

  if (name === 'progress' && typeof value === 'number') {
    return new Intl.NumberFormat(locale, {
      maximumFractionDigits: 0,
      useGrouping: false,
    }).format(Math.min(100, Math.max(0, Math.round(value))))
  }

  if (name === 'year' && typeof value === 'number') {
    return new Intl.NumberFormat(locale, { useGrouping: false }).format(value)
  }

  return String(value)
}
