export const BATTERY_MODEL_KEYS = [
  'megapackXL',
  'megapack2',
  'megapack',
  'powerPack',
] as const

export type BatteryModelKey = (typeof BATTERY_MODEL_KEYS)[number]

export type BatteryCounts = Record<BatteryModelKey, number>

export type SessionUser = {
  email: string
  userId: string
}

export type SavedLayout = {
  counts: BatteryCounts
  createdAt: string
  isDraft: boolean
  layoutId: string
  name: string | null
  updatedAt: string
  userId: string
}

export type LayoutSummary = Pick<
  SavedLayout,
  'counts' | 'createdAt' | 'isDraft' | 'layoutId' | 'name' | 'updatedAt'
>

export type SessionResponse = {
  user: SessionUser | null
}

export type LayoutListResponse = {
  layouts: LayoutSummary[]
}

export type LayoutResponse = {
  layout: LayoutSummary
}

export type AuthPayload = {
  email: string
  password: string
}

export type SaveLayoutPayload = {
  counts: BatteryCounts
  isDraft?: boolean
  layoutId?: string
  name?: string | null
}

export function createEmptyBatteryCounts(): BatteryCounts {
  return BATTERY_MODEL_KEYS.reduce<BatteryCounts>((counts, key) => {
    counts[key] = 0
    return counts
  }, {} as BatteryCounts)
}

export function sanitizeBatteryCounts(input: unknown): BatteryCounts {
  const safeCounts = createEmptyBatteryCounts()

  if (!input || typeof input !== 'object') {
    return safeCounts
  }

  for (const key of BATTERY_MODEL_KEYS) {
    const rawValue = (input as Record<string, unknown>)[key]
    const numericValue = typeof rawValue === 'number' ? rawValue : Number(rawValue ?? 0)
    safeCounts[key] = Number.isFinite(numericValue) ? Math.max(0, Math.floor(numericValue)) : 0
  }

  return safeCounts
}

export function totalConfiguredUnits(counts: BatteryCounts): number {
  return BATTERY_MODEL_KEYS.reduce((total, key) => total + counts[key], 0)
}

export function sanitizeLayoutName(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null
  }

  const normalized = input.trim().replace(/\s+/g, ' ')

  if (!normalized) {
    return null
  }

  return normalized.slice(0, 80)
}
