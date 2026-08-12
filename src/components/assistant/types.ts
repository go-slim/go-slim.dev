export type ModelGroup = {
  title: string
  items: readonly Model[]
}

export type Model = {
  name: string
  value: string
  checked?: boolean
}
