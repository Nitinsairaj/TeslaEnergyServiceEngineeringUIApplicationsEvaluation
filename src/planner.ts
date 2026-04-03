export const BATTERY_MODELS = [
  {
    key: 'megapackXL',
    cost: 120000,
    depthFt: 10,
    energyMWh: 4,
    name: 'MegapackXL',
    releaseYear: 2022,
    shortName: 'MP XL',
    widthFt: 40,
  },
  {
    key: 'megapack2',
    cost: 80000,
    depthFt: 10,
    energyMWh: 3,
    name: 'Megapack2',
    releaseYear: 2021,
    shortName: 'MP 2',
    widthFt: 30,
  },
  {
    key: 'megapack',
    cost: 50000,
    depthFt: 10,
    energyMWh: 2,
    name: 'Megapack',
    releaseYear: 2005,
    shortName: 'MP',
    widthFt: 30,
  },
  {
    key: 'powerPack',
    cost: 10000,
    depthFt: 10,
    energyMWh: 1,
    name: 'PowerPack',
    releaseYear: 2000,
    shortName: 'PP',
    widthFt: 10,
  },
] as const

export const TRANSFORMER_MODEL = {
  cost: 10000,
  depthFt: 10,
  energyMWh: -0.5,
  key: 'transformer',
  name: 'Transformer',
  shortName: 'XFR',
  widthFt: 10,
} as const

export const CELL_FT = 10
const MAX_COLUMNS = 10
export const MAX_SITE_WIDTH_FT = MAX_COLUMNS * CELL_FT

export type BatteryModel = (typeof BATTERY_MODELS)[number]
export type BatteryModelKey = BatteryModel['key']
export type BatteryCounts = Record<BatteryModelKey, number>
type DeviceModelKey = BatteryModelKey | typeof TRANSFORMER_MODEL.key

type BatteryUnit = {
  cost: number
  energyMWh: number
  groupId: string
  id: string
  kind: 'battery'
  modelKey: BatteryModelKey
  shortName: string
  widthCells: number
  widthFt: number
}

type TransformerUnit = {
  cost: number
  energyMWh: number
  groupId: string
  id: string
  kind: 'transformer'
  modelKey: typeof TRANSFORMER_MODEL.key
  shortName: string
  widthCells: 1
  widthFt: 10
}

export type PlacedUnit = (BatteryUnit | TransformerUnit) & {
  col: number
  row: number
}

export type PlannerScene = {
  connections: Array<{ fromId: string; toId: string }>
  energyDensityKWhPerSqFt: number
  envelopeHeightFt: number
  envelopeWidthFt: number
  footprintSqFt: number
  industrialBatteryCount: number
  netEnergyMWh: number
  rowCount: number
  totalCost: number
  totalUnits: number
  transformerCount: number
  units: PlacedUnit[]
}

export function createEmptyCounts(): BatteryCounts {
  return BATTERY_MODELS.reduce<BatteryCounts>((counts, model) => {
    counts[model.key] = 0
    return counts
  }, {} as BatteryCounts)
}

export function buildPlannerScene(counts: BatteryCounts): PlannerScene {
  const batteryUnits = BATTERY_MODELS.flatMap((model) =>
    Array.from({ length: counts[model.key] }, (_, index) => ({
      cost: model.cost,
      energyMWh: model.energyMWh,
      groupId: '',
      id: `${model.key}-${index + 1}`,
      kind: 'battery' as const,
      modelKey: model.key,
      shortName: model.shortName,
      widthCells: model.widthFt / CELL_FT,
      widthFt: model.widthFt,
    })),
  )

  const groupedBatteries: BatteryUnit[][] = []

  for (let index = 0; index < batteryUnits.length; index += 2) {
    const groupId = `group-${index / 2 + 1}`
    const pair = batteryUnits.slice(index, index + 2).map((unit) => ({
      ...unit,
      groupId,
    }))
    groupedBatteries.push(pair)
  }

  const groupedUnits = groupedBatteries.map((pair, index) => ({
    batteryWidthCells: pair.reduce((total, unit) => total + unit.widthCells, 0),
    batteries: pair,
    transformer: {
      cost: TRANSFORMER_MODEL.cost,
      energyMWh: TRANSFORMER_MODEL.energyMWh,
      groupId: `group-${index + 1}`,
      id: `transformer-${index + 1}`,
      kind: 'transformer' as const,
      modelKey: TRANSFORMER_MODEL.key,
      shortName: TRANSFORMER_MODEL.shortName,
      widthCells: 1 as const,
      widthFt: 10 as const,
    },
    widthCells: pair.reduce((total, unit) => total + unit.widthCells, 0) + 1,
  }))

  const rowPacks = groupedUnits.reduce<
    Array<{
      groups: typeof groupedUnits
      widthCells: number
    }>
  >((rows, group) => {
    const currentRow = rows.at(-1)

    if (!currentRow || currentRow.widthCells + group.widthCells > MAX_COLUMNS) {
      rows.push({
        groups: [group],
        widthCells: group.widthCells,
      })
      return rows
    }

    currentRow.groups.push(group)
    currentRow.widthCells += group.widthCells
    return rows
  }, [])

  const placedUnits: PlacedUnit[] = []
  const connections: PlannerScene['connections'] = []
  let maxUsedColumns = 0

  rowPacks.forEach((rowPack, rowIndex) => {
    let batteryCursor = 0
    let transformerCursor = rowPack.groups.reduce(
      (total, group) => total + group.batteryWidthCells,
      0,
    )

    rowPack.groups.forEach((group) => {
      group.batteries.forEach((battery) => {
        placedUnits.push({
          ...battery,
          col: batteryCursor,
          row: rowIndex,
        })
        batteryCursor += battery.widthCells
      })

      placedUnits.push({
        ...group.transformer,
        col: transformerCursor,
        row: rowIndex,
      })

      group.batteries.forEach((battery) => {
        connections.push({
          fromId: group.transformer.id,
          toId: battery.id,
        })
      })

      transformerCursor += group.transformer.widthCells
    })

    maxUsedColumns = Math.max(maxUsedColumns, transformerCursor)
  })

  const industrialBatteryCount = batteryUnits.length
  const transformerCount = groupedUnits.length
  const totalBatteryCost = batteryUnits.reduce((total, unit) => total + unit.cost, 0)
  const totalBatteryEnergy = batteryUnits.reduce(
    (total, unit) => total + unit.energyMWh,
    0,
  )
  const totalCost = totalBatteryCost + transformerCount * TRANSFORMER_MODEL.cost
  const netEnergyMWh =
    totalBatteryEnergy + transformerCount * TRANSFORMER_MODEL.energyMWh
  const footprintSqFt =
    batteryUnits.reduce((total, unit) => total + unit.widthFt * CELL_FT, 0) +
    transformerCount * TRANSFORMER_MODEL.widthFt * TRANSFORMER_MODEL.depthFt
  const energyDensityKWhPerSqFt =
    footprintSqFt === 0 ? 0 : (netEnergyMWh * 1000) / footprintSqFt

  return {
    connections,
    energyDensityKWhPerSqFt,
    envelopeHeightFt: rowPacks.length * CELL_FT,
    envelopeWidthFt: maxUsedColumns * CELL_FT,
    footprintSqFt,
    industrialBatteryCount,
    netEnergyMWh,
    rowCount: rowPacks.length,
    totalCost,
    totalUnits: industrialBatteryCount + transformerCount,
    transformerCount,
    units: placedUnits,
  }
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value)
}

export function formatEnergy(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
  }).format(value)
}

export function formatDensity(value: number): string {
  return `${new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(value)} kWh/sqft`
}

export function isTransformerKey(key: DeviceModelKey): key is 'transformer' {
  return key === 'transformer'
}
