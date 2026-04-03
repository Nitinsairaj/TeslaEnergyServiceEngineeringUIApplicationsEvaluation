import { buildPlannerScene, createEmptyCounts } from './planner'
import { buildStageLayout } from './stage'

describe('buildStageLayout', () => {
  it('routes wires through installed tray-like runs instead of freeform curves', () => {
    const counts = createEmptyCounts()
    counts.megapackXL = 1
    counts.powerPack = 1

    const layout = buildStageLayout(buildPlannerScene(counts))

    expect(layout.wires).toHaveLength(2)

    for (const wire of layout.wires) {
      expect(wire.path).toContain('L')
      expect(wire.path).toContain('Q')
      expect(wire.path).not.toContain('C')
      expect(wire.start.x).not.toBe(wire.end.x)
      expect(wire.start.y).not.toBe(wire.end.y)
    }
  })

  it('returns a stage viewbox large enough to hold the floor and assets', () => {
    const layout = buildStageLayout(buildPlannerScene(createEmptyCounts()))

    expect(layout.width).toBeGreaterThan(1000)
    expect(layout.height).toBeGreaterThan(650)
    expect(layout.viewBox).toContain(String(layout.width))
  })

  it('adds visible aisle spacing between projected scene rows', () => {
    const counts = createEmptyCounts()
    counts.megapackXL = 3
    counts.megapack2 = 2
    counts.megapack = 1

    const layout = buildStageLayout(buildPlannerScene(counts))
    const firstRowAsset = layout.assets.find((asset) => asset.id === 'megapackXL-1')
    const secondRowAsset = layout.assets.find((asset) => asset.id === 'megapack2-1')

    expect(firstRowAsset).toBeDefined()
    expect(secondRowAsset).toBeDefined()
    expect(secondRowAsset!.topPoints[0].y - firstRowAsset!.topPoints[0].y).toBeGreaterThan(78)
  })
})
