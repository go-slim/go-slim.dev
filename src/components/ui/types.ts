export type AlpineAttributes = {
  [key: `x-${string}`]: string | boolean | undefined
  [key: `@${string}`]: string | undefined
  [key: `:${string}`]: string | undefined
}
