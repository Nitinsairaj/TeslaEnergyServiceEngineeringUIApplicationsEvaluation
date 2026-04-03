import {
  MAX_SITE_WIDTH_FT,
  buildPlannerScene,
  createEmptyCounts,
  formatDensity,
} from './planner'

describe('buildPlannerScene', () => {
  it('returns an empty scene for zero counts', () => {
    const scene = buildPlannerScene(createEmptyCounts())

    expect(scene.totalUnits).toBe(0)
    expect(scene.transformerCount).toBe(0)
    expect(scene.netEnergyMWh).toBe(0)
    expect(scene.footprintSqFt).toBe(0)
    expect(scene.units).toHaveLength(0)
    expect(scene.connections).toHaveLength(0)
  })

  it('adds one transformer for every two industrial batteries and computes totals', () => {
    const counts = createEmptyCounts()
    counts.megapackXL = 1
    counts.powerPack = 2

    const scene = buildPlannerScene(counts)

    expect(scene.industrialBatteryCount).toBe(3)
    expect(scene.transformerCount).toBe(2)
    expect(scene.totalUnits).toBe(5)
    expect(scene.totalCost).toBe(160000)
    expect(scene.netEnergyMWh).toBe(5)
    expect(scene.footprintSqFt).toBe(800)
    expect(scene.envelopeWidthFt).toBe(80)
    expect(scene.envelopeHeightFt).toBe(10)
    expect(scene.connections).toHaveLength(3)
    expect(formatDensity(scene.energyDensityKWhPerSqFt)).toBe('6.3 kWh/sqft')
  })

  it('never packs a row beyond the 100ft width limit', () => {
    const counts = createEmptyCounts()
    counts.megapackXL = 6
    counts.megapack2 = 4
    counts.megapack = 4
    counts.powerPack = 8

    const scene = buildPlannerScene(counts)

    expect(scene.envelopeWidthFt).toBeLessThanOrEqual(MAX_SITE_WIDTH_FT)
    expect(scene.rowCount).toBeGreaterThan(1)
  })

  it('keeps transformers at the end of each occupied row', () => {
    const counts = createEmptyCounts()
    counts.megapackXL = 1
    counts.megapack2 = 1
    counts.powerPack = 4

    const scene = buildPlannerScene(counts)
    const rows = new Map<number, { batteryCols: number[]; transformerCols: number[] }>()

    for (const unit of scene.units) {
      const row = rows.get(unit.row) ?? { batteryCols: [], transformerCols: [] }

      if (unit.kind === 'transformer') {
        row.transformerCols.push(unit.col)
      } else {
        row.batteryCols.push(unit.col + unit.widthCells - 1)
      }

      rows.set(unit.row, row)
    }

    expect(rows.size).toBeGreaterThan(0)

    for (const row of rows.values()) {
      expect(row.transformerCols.length).toBeGreaterThan(0)
      expect(Math.min(...row.transformerCols)).toBeGreaterThan(Math.max(...row.batteryCols))
    }
  })
})
