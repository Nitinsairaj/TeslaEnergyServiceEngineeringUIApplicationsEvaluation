import { CELL_FT, MAX_SITE_WIDTH_FT, type PlannerScene, type PlacedUnit } from './planner'

const TILE_WIDTH = 92
const TILE_HEIGHT = 46
const HALF_TILE_WIDTH = TILE_WIDTH / 2
const HALF_TILE_HEIGHT = TILE_HEIGHT / 2
const FLOOR_TOP_PADDING = 124
const FLOOR_SIDE_PADDING = 180
const FLOOR_BOTTOM_PADDING = 210
const UNIT_DEPTH_CELLS = 0.82
const UNIT_INSET_X = 0.08
const UNIT_INSET_Y = 0.12
const CORE_INSET = 0.16
const FLOOR_DEPTH_EXTRA_ROWS = 3
const ROW_PITCH_CELLS = 2.4

type DeviceModelKey = PlacedUnit['modelKey']

export type StagePoint = {
  x: number
  y: number
}

export type StageQuad = [StagePoint, StagePoint, StagePoint, StagePoint]

export type StageAsset = {
  coreFront: string
  coreFrontPoints: StageQuad
  coreTop: string
  coreTopPoints: StageQuad
  front: string
  frontAnchor: StagePoint
  frontPoints: StageQuad
  id: string
  kind: PlacedUnit['kind']
  modelKey: DeviceModelKey
  outline: string
  pulse: StagePoint
  shadow: string
  sortY: number
  side: string
  sideAnchor: StagePoint
  sidePoints: StageQuad
  top: string
  topPoints: StageQuad
}

export type StageWire = {
  end: StagePoint
  id: string
  path: string
  start: StagePoint
}

export type StageLayout = {
  assets: StageAsset[]
  floor: string
  floorPoints: StagePoint[]
  height: number
  lanes: string[]
  viewBox: string
  wires: StageWire[]
  width: number
}

export function buildStageLayout(scene: PlannerScene): StageLayout {
  const columnCount = MAX_SITE_WIDTH_FT / CELL_FT
  const floorDepth = Math.max(scene.rowCount * ROW_PITCH_CELLS + FLOOR_DEPTH_EXTRA_ROWS, 5)
  const originX = FLOOR_SIDE_PADDING + floorDepth * HALF_TILE_WIDTH
  const originY = FLOOR_TOP_PADDING
  const width = originX + columnCount * HALF_TILE_WIDTH + FLOOR_SIDE_PADDING
  const height =
    originY + (columnCount + floorDepth) * HALF_TILE_HEIGHT + FLOOR_BOTTOM_PADDING

  const floorPoints = [
    projectPoint(0, 0, 0, originX, originY),
    projectPoint(columnCount, 0, 0, originX, originY),
    projectPoint(columnCount, floorDepth, 0, originX, originY),
    projectPoint(0, floorDepth, 0, originX, originY),
  ]

  const lanes = createFloorLanes(columnCount, floorDepth, originX, originY)
  const assets = scene.units
    .map((unit) => createStageAsset(unit, originX, originY))
    .sort((left, right) => left.sortY - right.sortY)

  const assetById = new Map(assets.map((asset) => [asset.id, asset]))
  const wires = scene.connections.flatMap((connection) => {
    const battery = assetById.get(connection.toId)
    const transformer = assetById.get(connection.fromId)

    if (!battery || !transformer) {
      return []
    }

    return [
      {
        end: transformer.frontAnchor,
        id: `${connection.fromId}-${connection.toId}`,
        path: createWirePath(battery.sideAnchor, transformer.frontAnchor),
        start: battery.sideAnchor,
      },
    ]
  })

  return {
    assets,
    floor: pointsToString(floorPoints),
    floorPoints,
    height,
    lanes,
    viewBox: `0 0 ${round(width)} ${round(height)}`,
    wires,
    width,
  }
}

function createStageAsset(
  unit: PlacedUnit,
  originX: number,
  originY: number,
): StageAsset {
  const x = unit.col + UNIT_INSET_X
  const y = unit.row * ROW_PITCH_CELLS + UNIT_INSET_Y
  const widthCells = Math.max(unit.widthCells - UNIT_INSET_X * 2, 0.72)
  const depthCells = UNIT_DEPTH_CELLS
  const height = getAssetHeight(unit)

  const baseA = projectPoint(x, y, 0, originX, originY)
  const baseB = projectPoint(x + widthCells, y, 0, originX, originY)
  const baseC = projectPoint(x + widthCells, y + depthCells, 0, originX, originY)
  const baseD = projectPoint(x, y + depthCells, 0, originX, originY)
  const topA = projectPoint(x, y, height, originX, originY)
  const topB = projectPoint(x + widthCells, y, height, originX, originY)
  const topC = projectPoint(
    x + widthCells,
    y + depthCells,
    height,
    originX,
    originY,
  )
  const topD = projectPoint(x, y + depthCells, height, originX, originY)

  const innerX = x + CORE_INSET
  const innerY = y + CORE_INSET
  const innerWidth = Math.max(widthCells - CORE_INSET * 2, 0.34)
  const innerDepth = Math.max(depthCells - CORE_INSET * 2, 0.18)
  const innerTopHeight = Math.max(height - 13, 16)
  const innerBaseHeight = Math.max(height * 0.2, 10)
  const innerTopA = projectPoint(innerX, innerY, innerTopHeight, originX, originY)
  const innerTopB = projectPoint(
    innerX + innerWidth,
    innerY,
    innerTopHeight,
    originX,
    originY,
  )
  const innerTopC = projectPoint(
    innerX + innerWidth,
    innerY + innerDepth,
    innerTopHeight,
    originX,
    originY,
  )
  const innerTopD = projectPoint(
    innerX,
    innerY + innerDepth,
    innerTopHeight,
    originX,
    originY,
  )
  const innerBaseC = projectPoint(
    innerX + innerWidth,
    innerY + innerDepth,
    innerBaseHeight,
    originX,
    originY,
  )
  const innerBaseD = projectPoint(
    innerX,
    innerY + innerDepth,
    innerBaseHeight,
    originX,
    originY,
  )

  const shadowPoints = [baseA, baseB, baseC, baseD].map((point, index) => ({
    x: point.x + 14 + index * 1.4,
    y: point.y + 24,
  }))
  const frontPoints: StageQuad = [topD, topC, baseC, baseD]
  const sidePoints: StageQuad = [topB, topC, baseC, baseB]
  const topPoints: StageQuad = [topA, topB, topC, topD]
  const coreTopPoints: StageQuad = [innerTopA, innerTopB, innerTopC, innerTopD]
  const coreFrontPoints: StageQuad = [innerTopD, innerTopC, innerBaseC, innerBaseD]

  return {
    coreFront: pointsToString(coreFrontPoints),
    coreFrontPoints,
    coreTop: pointsToString(coreTopPoints),
    coreTopPoints,
    front: pointsToString(frontPoints),
    frontAnchor: midpoint(topD, topC, -4, -2),
    frontPoints,
    id: unit.id,
    kind: unit.kind,
    modelKey: unit.modelKey,
    outline: [
      lineTo(topD, topA),
      lineTo(topA, topB),
      lineTo(topB, topC),
      lineTo(topC, topD),
      lineTo(topB, baseB),
      lineTo(topC, baseC),
      lineTo(topD, baseD),
    ].join(' '),
    pulse: midpoint(innerTopB, innerTopD),
    shadow: pointsToString(shadowPoints),
    sortY: baseC.y,
    side: pointsToString(sidePoints),
    sideAnchor: midpoint(topB, topC, 4, -2),
    sidePoints,
    top: pointsToString(topPoints),
    topPoints,
  }
}

function createFloorLanes(
  columnCount: number,
  floorDepth: number,
  originX: number,
  originY: number,
): string[] {
  const lanes: string[] = []

  for (let column = 0; column <= columnCount; column += 1) {
    const start = projectPoint(column, 0, 0, originX, originY)
    const end = projectPoint(column, floorDepth, 0, originX, originY)
    lanes.push(lineTo(start, end))
  }

  for (let row = 0; row <= floorDepth; row += 1) {
    const start = projectPoint(0, row, 0, originX, originY)
    const end = projectPoint(columnCount, row, 0, originX, originY)
    lanes.push(lineTo(start, end))
  }

  return lanes
}

function createWirePath(start: StagePoint, end: StagePoint): string {
  const direction = end.x >= start.x ? 1 : -1
  const leadOut = 22 * direction
  const runIn = 24 * direction
  const trayY = Math.max(start.y, end.y) + 34
  const startElbowX = start.x + leadOut
  const endElbowX = end.x - runIn
  const startDropY = start.y + 10
  const endRiseY = end.y + 12

  return [
    `M ${round(start.x)} ${round(start.y)}`,
    `Q ${round(start.x + leadOut * 0.45)} ${round(start.y + 1)} ${round(startElbowX)} ${round(startDropY)}`,
    `L ${round(startElbowX)} ${round(trayY - 12)}`,
    `Q ${round(startElbowX)} ${round(trayY)} ${round(startElbowX + leadOut * 0.35)} ${round(trayY)}`,
    `L ${round(endElbowX - runIn * 0.35)} ${round(trayY)}`,
    `Q ${round(endElbowX)} ${round(trayY)} ${round(endElbowX)} ${round(trayY - 12)}`,
    `L ${round(endElbowX)} ${round(endRiseY)}`,
    `Q ${round(endElbowX)} ${round(end.y + 4)} ${round(end.x)} ${round(end.y)}`,
  ].join(' ')
}

function projectPoint(
  x: number,
  y: number,
  z: number,
  originX: number,
  originY: number,
): StagePoint {
  return {
    x: originX + (x - y) * HALF_TILE_WIDTH,
    y: originY + (x + y) * HALF_TILE_HEIGHT - z,
  }
}

function pointsToString(points: StagePoint[]): string {
  return points.map((point) => `${round(point.x)},${round(point.y)}`).join(' ')
}

function lineTo(start: StagePoint, end: StagePoint): string {
  return `M ${round(start.x)} ${round(start.y)} L ${round(end.x)} ${round(end.y)}`
}

function midpoint(
  first: StagePoint,
  second: StagePoint,
  offsetX = 0,
  offsetY = 0,
): StagePoint {
  return {
    x: (first.x + second.x) / 2 + offsetX,
    y: (first.y + second.y) / 2 + offsetY,
  }
}

function getAssetHeight(unit: PlacedUnit): number {
  switch (unit.modelKey) {
    case 'megapackXL':
      return 88
    case 'megapack2':
      return 80
    case 'megapack':
      return 74
    case 'powerPack':
      return 62
    case 'transformer':
      return 70
  }
}

function round(value: number): number {
  return Number(value.toFixed(2))
}
