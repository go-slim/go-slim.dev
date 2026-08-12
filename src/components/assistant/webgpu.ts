type NavigatorWithGpu = Navigator & {
  gpu?: {
    requestAdapter(options?: {
      powerPreference?: 'low-power' | 'high-performance'
    }): Promise<object | null>
  }
}

export async function supportsWebGpu(): Promise<boolean> {
  if (!window.isSecureContext) return false
  const gpu = (navigator as NavigatorWithGpu).gpu
  if (gpu === undefined) return false

  try {
    return await gpu.requestAdapter({ powerPreference: 'high-performance' }) !== null
  } catch {
    return false
  }
}
