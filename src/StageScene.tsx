import type { CSSProperties } from 'react'
import { useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { MAX_SITE_WIDTH_FT, type PlannerScene } from './planner'
import {
  buildStageLayout,
  type StageAsset,
  type StagePoint,
  type StageQuad,
} from './stage'

const MODEL_KEYS = [
  'megapackXL',
  'megapack2',
  'megapack',
  'powerPack',
  'transformer',
] as const

type StageSceneProps = {
  isPending: boolean
  scene: PlannerScene
}

export function StageScene({ isPending, scene }: StageSceneProps) {
  const layout = useMemo(() => buildStageLayout(scene), [scene])
  const hasUnits = scene.units.length > 0

  return (
    <section className="stage-shell" aria-label="Power yard scene">
      <div className="stage-hud" role="group" aria-label="Stage status">
        <StageHudCard label="Site Width" value={`${MAX_SITE_WIDTH_FT}FT`} />
        <StageHudCard
          label="Transformers"
          value={scene.transformerCount.toString().padStart(2, '0')}
        />
        <StageHudCard
          label="Status"
          value={hasUnits ? 'Active' : 'Standby'}
        />
      </div>

      <div className="stage-window">
        <svg
          aria-label="Power yard layout"
          className="stage-canvas"
          role="img"
          viewBox={layout.viewBox}
        >
          <defs>
            <filter
              height="170%"
              id="asset-shadow"
              width="170%"
              x="-35%"
              y="-35%"
            >
              <feGaussianBlur stdDeviation="18" />
            </filter>
            <filter
              height="180%"
              id="wire-glow"
              width="180%"
              x="-40%"
              y="-40%"
            >
              <feGaussianBlur result="blur" stdDeviation="3.6" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <radialGradient id="yard-glow" r="70%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.34)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </radialGradient>
            <linearGradient id="yard-floor" x1="0%" x2="100%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(31,35,42,0.98)" />
              <stop offset="100%" stopColor="rgba(8,10,13,0.98)" />
            </linearGradient>
            <linearGradient id="yard-floor-sheen" x1="0%" x2="0%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.14)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>
            {MODEL_KEYS.map((modelKey) => (
              <GradientSet key={modelKey} modelKey={modelKey} />
            ))}
            {layout.wires.map((wire) => (
              <WireGradientSet key={wire.id} wire={wire} />
            ))}
          </defs>

          <ellipse className="stage-light stage-light--left" cx="26%" cy="16%" rx="180" ry="90" />
          <ellipse className="stage-light stage-light--right" cx="78%" cy="18%" rx="200" ry="104" />
          <ellipse className="stage-light stage-light--floor" cx="50%" cy="82%" rx="360" ry="120" />

          <polygon className="stage-floor" points={layout.floor} />
          <polygon className="stage-floor stage-floor--sheen" points={layout.floor} />
          {layout.lanes.map((lane, index) => (
            <path key={index} className="stage-floor__lane" d={lane} />
          ))}

          {layout.wires.map((wire, index) => (
            <g
              className={`stage-wire-group${isPending ? ' stage-wire-group--pending' : ''}`}
              key={wire.id}
              style={
                {
                  '--wire-delay': `${index * 0.12}s`,
                  '--wire-duration': `${isPending ? 1.45 + (index % 3) * 0.16 : 2.3 + (index % 3) * 0.3}s`,
                  '--wire-glow-duration': `${isPending ? 1.8 + (index % 2) * 0.18 : 2.9 + (index % 2) * 0.24}s`,
                } as CSSProperties
              }
            >
              <path className="stage-wire__cable" d={wire.path} />
              <path className="stage-wire__sheath" d={wire.path} />
              <path
                className="stage-wire stage-wire--glow"
                d={wire.path}
                stroke={`url(#wire-energy-${wire.id})`}
              />
              <path
                className="stage-wire stage-wire--charge"
                d={wire.path}
                stroke={`url(#wire-energy-${wire.id})`}
              />
              <path
                className="stage-wire stage-wire--charge stage-wire--charge-soft"
                d={wire.path}
                stroke={`url(#wire-highlight-${wire.id})`}
              />
            </g>
          ))}

          <AnimatePresence initial={false}>
            {layout.assets.map((asset, index) => (
              <motion.g
                key={asset.id}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className={`stage-asset stage-asset--${asset.modelKey}`}
                data-asset-kind={asset.kind}
                exit={{ opacity: 0, scale: 0.94, y: 22 }}
                initial={{ opacity: 0, scale: 0.92, y: 34 }}
                style={{ transformBox: 'fill-box', transformOrigin: 'center bottom' }}
                transition={{
                  damping: 22,
                  delay: index * 0.03,
                  mass: 0.86,
                  stiffness: 185,
                  type: 'spring',
                }}
              >
                <StageAssetGraphic asset={asset} />
              </motion.g>
            ))}
          </AnimatePresence>
        </svg>

        {!hasUnits && (
          <div className="stage-empty">
            <div className="stage-empty__panel">
              <p className="stage-empty__title">Add a storage module</p>
              <p className="stage-empty__body">A live site layout will render here.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function GradientSet({ modelKey }: { modelKey: (typeof MODEL_KEYS)[number] }) {
  const palette = getPalette(modelKey)

  return (
    <>
      <linearGradient id={`${modelKey}-top`} x1="0%" x2="100%" y1="0%" y2="100%">
        <stop offset="0%" stopColor={palette.topStart} />
        <stop offset="100%" stopColor={palette.topEnd} />
      </linearGradient>
      <linearGradient id={`${modelKey}-front`} x1="0%" x2="0%" y1="0%" y2="100%">
        <stop offset="0%" stopColor={palette.frontStart} />
        <stop offset="100%" stopColor={palette.frontEnd} />
      </linearGradient>
      <linearGradient id={`${modelKey}-side`} x1="0%" x2="0%" y1="0%" y2="100%">
        <stop offset="0%" stopColor={palette.sideStart} />
        <stop offset="100%" stopColor={palette.sideEnd} />
      </linearGradient>
      <linearGradient id={`${modelKey}-core`} x1="0%" x2="100%" y1="0%" y2="100%">
        <stop offset="0%" stopColor={palette.coreStart} />
        <stop offset="100%" stopColor={palette.coreEnd} />
      </linearGradient>
    </>
  )
}

function WireGradientSet({
  wire,
}: {
  wire: {
    end: StagePoint
    id: string
    start: StagePoint
  }
}) {
  return (
    <>
      <linearGradient
        gradientUnits="userSpaceOnUse"
        id={`wire-energy-${wire.id}`}
        x1={wire.start.x}
        x2={wire.end.x}
        y1={wire.start.y}
        y2={wire.end.y}
      >
        <stop offset="0%" stopColor="rgba(255,166,82,0.98)" />
        <stop offset="42%" stopColor="rgba(255,214,86,0.98)" />
        <stop offset="72%" stopColor="rgba(123,255,160,0.98)" />
        <stop offset="100%" stopColor="rgba(76,255,170,1)" />
      </linearGradient>
      <linearGradient
        gradientUnits="userSpaceOnUse"
        id={`wire-highlight-${wire.id}`}
        x1={wire.start.x}
        x2={wire.end.x}
        y1={wire.start.y}
        y2={wire.end.y}
      >
        <stop offset="0%" stopColor="rgba(255,246,224,0.84)" />
        <stop offset="48%" stopColor="rgba(255,241,193,0.92)" />
        <stop offset="100%" stopColor="rgba(229,255,241,0.96)" />
      </linearGradient>
    </>
  )
}

function StageAssetGraphic({ asset }: { asset: StageAsset }) {
  if (asset.kind === 'transformer') {
    return <TransformerAssetGraphic asset={asset} />
  }

  return <BatteryAssetGraphic asset={asset} />
}

function BatteryAssetGraphic({ asset }: { asset: StageAsset }) {
  const topCap = pointsToString(sampleQuad(asset.topPoints, 0.08, 0.18, 0.92, 0.76))
  const frontPanel = pointsToString(sampleQuad(asset.frontPoints, 0.08, 0.14, 0.92, 0.82))
  const sidePanel = pointsToString(sampleQuad(asset.sidePoints, 0.1, 0.18, 0.9, 0.84))
  const accentStrip = pointsToString(sampleQuad(asset.frontPoints, 0.1, 0.16, 0.16, 0.82))
  const topAccent = pointsToString(sampleQuad(asset.topPoints, 0.12, 0.18, 0.3, 0.32))
  const frontBadge = pointsToString(sampleQuad(asset.frontPoints, 0.14, 0.2, 0.34, 0.32))
  const frontSkirt = pointsToString(sampleQuad(asset.frontPoints, 0.05, 0.84, 0.95, 1))
  const topSeam = lineBetween(
    quadPoint(asset.topPoints, 0.16, 0.5),
    quadPoint(asset.topPoints, 0.84, 0.5),
  )
  const frontSeams = [0.14, 0.86].map((u) =>
    lineBetween(quadPoint(asset.frontPoints, u, 0.18), quadPoint(asset.frontPoints, u, 0.8)),
  )
  const sideVents = [0.24, 0.38, 0.52, 0.66, 0.8].map((u) =>
    lineBetween(quadPoint(asset.sidePoints, u, 0.22), quadPoint(asset.sidePoints, u, 0.82)),
  )

  return (
    <>
      <polygon className="stage-asset__shadow" points={asset.shadow} />
      <polygon className="stage-asset__side" fill={`url(#${asset.modelKey}-side)`} points={asset.side} />
      <polygon className="stage-asset__front" fill={`url(#${asset.modelKey}-front)`} points={asset.front} />
      <polygon className="stage-asset__top" fill={`url(#${asset.modelKey}-top)`} points={asset.top} />
      <polygon className="stage-battery__cap" points={topCap} />
      <polygon className="stage-battery__panel" points={frontPanel} />
      <polygon className="stage-battery__panel stage-battery__panel--side" points={sidePanel} />
      <polygon className="stage-battery__accent-strip" points={accentStrip} />
      <polygon className="stage-battery__accent-cap" points={topAccent} />
      <polygon className="stage-battery__badge" points={frontBadge} />
      <polygon className="stage-battery__skirt" points={frontSkirt} />
      <polygon className="stage-asset__core" fill={`url(#${asset.modelKey}-core)`} points={asset.coreTop} />
      <polygon
        className="stage-asset__core stage-asset__core--front"
        fill={`url(#${asset.modelKey}-core)`}
        points={asset.coreFront}
      />
      <path className="stage-asset__outline" d={asset.outline} />
      <path className="stage-battery__seam" d={topSeam} />
      {frontSeams.map((seam, index) => (
        <path className="stage-battery__seam" d={seam} key={index} />
      ))}
      {sideVents.map((vent, index) => (
        <path className="stage-battery__vent" d={vent} key={index} />
      ))}
    </>
  )
}

function TransformerAssetGraphic({ asset }: { asset: StageAsset }) {
  const deck = pointsToString(sampleQuad(asset.topPoints, 0.08, 0.18, 0.92, 0.82))
  const frontPanel = pointsToString(sampleQuad(asset.frontPoints, 0.1, 0.16, 0.9, 0.58))
  const accentStrip = pointsToString(sampleQuad(asset.frontPoints, 0.12, 0.18, 0.18, 0.82))
  const accentDeck = pointsToString(sampleQuad(asset.topPoints, 0.12, 0.18, 0.26, 0.32))
  const serviceDoorPoints = sampleQuad(asset.frontPoints, 0.18, 0.3, 0.46, 0.78)
  const radiatorPoints = sampleQuad(asset.sidePoints, 0.18, 0.18, 0.9, 0.9)
  const plinth = pointsToString(sampleQuad(asset.frontPoints, 0.04, 0.84, 0.96, 1))
  const fins = [0.28, 0.38, 0.48, 0.58, 0.68, 0.78, 0.88].map((u) =>
    lineBetween(quadPoint(asset.sidePoints, u, 0.2), quadPoint(asset.sidePoints, u, 0.9)),
  )
  const bushings = [0.28, 0.5, 0.72].map((u, index) => {
    const base = quadPoint(asset.topPoints, u, 0.38)
    return {
      base,
      tip: {
        x: base.x,
        y: base.y - 18 - (index === 1 ? 4 : 0),
      },
    }
  })

  return (
    <>
      <polygon className="stage-asset__shadow" points={asset.shadow} />
      <polygon className="stage-asset__side" fill={`url(#${asset.modelKey}-side)`} points={asset.side} />
      <polygon className="stage-asset__front" fill={`url(#${asset.modelKey}-front)`} points={asset.front} />
      <polygon className="stage-asset__top" fill={`url(#${asset.modelKey}-top)`} points={asset.top} />
      <polygon className="stage-transformer__deck" points={deck} />
      <polygon className="stage-transformer__panel" points={frontPanel} />
      <polygon className="stage-transformer__accent-strip" points={accentStrip} />
      <polygon className="stage-transformer__accent-deck" points={accentDeck} />
      <polygon className="stage-transformer__radiator" points={pointsToString(radiatorPoints)} />
      <polygon className="stage-transformer__door" points={pointsToString(serviceDoorPoints)} />
      <polygon className="stage-transformer__plinth" points={plinth} />
      <polygon className="stage-asset__core" fill={`url(#${asset.modelKey}-core)`} points={asset.coreTop} />
      <polygon
        className="stage-asset__core stage-asset__core--front"
        fill={`url(#${asset.modelKey}-core)`}
        points={asset.coreFront}
      />
      <path className="stage-asset__outline" d={asset.outline} />
      <path
        className="stage-transformer__bus"
        d={lineBetween(bushings[0].tip, bushings[bushings.length - 1].tip)}
      />
      {fins.map((fin, index) => (
        <path className="stage-transformer__fin" d={fin} key={index} />
      ))}
      {bushings.map((bushing, index) => (
        <g key={index}>
          <path className="stage-transformer__bushing-stem" d={lineBetween(bushing.base, bushing.tip)} />
          <circle className="stage-transformer__bushing-glow" cx={bushing.tip.x} cy={bushing.tip.y} r="7.2" />
          <circle className="stage-transformer__bushing-head" cx={bushing.tip.x} cy={bushing.tip.y} r="3.6" />
        </g>
      ))}
    </>
  )
}

function StageHudCard({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <article className="stage-hud__card">
      <p className="stage-hud__label">{label}</p>
      <p className="stage-hud__value">{value}</p>
    </article>
  )
}

function sampleQuad(
  quad: StageQuad,
  left: number,
  top: number,
  right: number,
  bottom: number,
): StageQuad {
  return [
    quadPoint(quad, left, top),
    quadPoint(quad, right, top),
    quadPoint(quad, right, bottom),
    quadPoint(quad, left, bottom),
  ]
}

function quadPoint(quad: StageQuad, u: number, v: number): StagePoint {
  const topEdge = lerpPoint(quad[0], quad[1], u)
  const bottomEdge = lerpPoint(quad[3], quad[2], u)
  return lerpPoint(topEdge, bottomEdge, v)
}

function lerpPoint(start: StagePoint, end: StagePoint, amount: number): StagePoint {
  return {
    x: start.x + (end.x - start.x) * amount,
    y: start.y + (end.y - start.y) * amount,
  }
}

function lineBetween(start: StagePoint, end: StagePoint): string {
  return `M ${round(start.x)} ${round(start.y)} L ${round(end.x)} ${round(end.y)}`
}

function pointsToString(points: StagePoint[]): string {
  return points.map((point) => `${round(point.x)},${round(point.y)}`).join(' ')
}

function round(value: number): number {
  return Number(value.toFixed(2))
}

function getPalette(modelKey: (typeof MODEL_KEYS)[number]) {
  switch (modelKey) {
    case 'megapackXL':
      return {
        coreEnd: 'rgba(86,241,255,0.08)',
        coreStart: 'rgba(204,251,255,0.22)',
        frontEnd: 'rgba(18,23,29,0.98)',
        frontStart: 'rgba(78,88,97,0.92)',
        sideEnd: 'rgba(13,18,23,0.98)',
        sideStart: 'rgba(66,76,86,0.9)',
        topEnd: 'rgba(42,50,58,0.96)',
        topStart: 'rgba(103,114,124,0.88)',
      }
    case 'megapack2':
      return {
        coreEnd: 'rgba(95,147,255,0.08)',
        coreStart: 'rgba(218,228,255,0.2)',
        frontEnd: 'rgba(17,22,29,0.98)',
        frontStart: 'rgba(72,83,97,0.92)',
        sideEnd: 'rgba(13,18,24,0.98)',
        sideStart: 'rgba(60,70,82,0.9)',
        topEnd: 'rgba(41,49,58,0.96)',
        topStart: 'rgba(98,108,121,0.88)',
      }
    case 'megapack':
      return {
        coreEnd: 'rgba(177,118,255,0.08)',
        coreStart: 'rgba(232,216,255,0.2)',
        frontEnd: 'rgba(18,22,29,0.98)',
        frontStart: 'rgba(74,82,96,0.92)',
        sideEnd: 'rgba(13,17,23,0.98)',
        sideStart: 'rgba(62,69,82,0.9)',
        topEnd: 'rgba(42,48,57,0.96)',
        topStart: 'rgba(98,107,120,0.88)',
      }
    case 'powerPack':
      return {
        coreEnd: 'rgba(255,111,208,0.1)',
        coreStart: 'rgba(255,223,241,0.24)',
        frontEnd: 'rgba(18,22,28,0.98)',
        frontStart: 'rgba(78,83,93,0.9)',
        sideEnd: 'rgba(14,17,22,0.98)',
        sideStart: 'rgba(64,69,79,0.9)',
        topEnd: 'rgba(42,47,54,0.96)',
        topStart: 'rgba(101,107,117,0.86)',
      }
    case 'transformer':
      return {
        coreEnd: 'rgba(255,201,114,0.06)',
        coreStart: 'rgba(255,244,212,0.16)',
        frontEnd: 'rgba(16,19,24,0.98)',
        frontStart: 'rgba(86,91,98,0.92)',
        sideEnd: 'rgba(12,14,18,0.98)',
        sideStart: 'rgba(70,74,82,0.9)',
        topEnd: 'rgba(44,48,54,0.96)',
        topStart: 'rgba(106,111,118,0.88)',
      }
  }
}
