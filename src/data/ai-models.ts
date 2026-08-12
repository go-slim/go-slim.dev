export const localAiModels = [
  {
    id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    label: 'Qwen2.5 0.5B',
    downloadSize: '290 MB',
    gpuMemory: '1 GB',
    recommended: true,
  },
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    label: 'Qwen2.5 1.5B',
    downloadSize: '880 MB',
    gpuMemory: '1.6 GB',
    recommended: false,
  },
  {
    id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC',
    label: 'Qwen2.5 3B',
    downloadSize: '1.75 GB',
    gpuMemory: '2.5 GB',
    recommended: false,
  },
  {
    id: 'DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC',
    label: 'DeepSeek R1 7B',
    downloadSize: '4.29 GB',
    gpuMemory: '5.1 GB',
    recommended: false,
    highMemory: true,
  },
] as const

export type LocalAiModel = (typeof localAiModels)[number]
export type LocalAiModelId = LocalAiModel['id']

export const defaultLocalAiModelId: LocalAiModelId = localAiModels[0].id

const localAiModelIds = new Set<string>(
  localAiModels.map(({ id }) => id),
)

export function isLocalAiModelId(value: string): value is LocalAiModelId {
  return localAiModelIds.has(value)
}
