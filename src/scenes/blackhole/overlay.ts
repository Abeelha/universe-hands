const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]
const FINGERTIPS = [4, 8, 12, 16, 20]
const PALM_POINTS = [0, 5, 9, 13, 17]
const FONT = '11px "Cascadia Mono", "JetBrains Mono", Consolas, monospace'

export type ControlMode = "idle" | "knob" | "jet" | "fist" | "reset"

export type ControlViz = {
  points: { x: number; y: number }[]
  mode: ControlMode
  knobTip: number
  value: number
  label: string
}

export type Overlay = {
  draw: (viz: ControlViz | null, timeSeconds: number) => void
  resize: () => void
}

const ACCENTS: Record<ControlMode, string> = {
  idle: "rgba(110, 240, 255, 0.75)",
  knob: "rgba(255, 200, 110, 0.95)",
  jet: "rgba(150, 195, 255, 0.95)",
  fist: "rgba(255, 110, 110, 0.95)",
  reset: "rgba(170, 255, 160, 0.95)",
}

export function createOverlay(canvas: HTMLCanvasElement): Overlay {
  const context = canvas.getContext("2d")
  if (!context) throw new Error("2d context unavailable")
  const ctx = context
  let width = 0
  let height = 0

  const resize = (): void => {
    const ratio = Math.min(window.devicePixelRatio, 2)
    width = window.innerWidth
    height = window.innerHeight
    canvas.width = width * ratio
    canvas.height = height * ratio
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  }
  resize()

  const drawSkeleton = (points: { x: number; y: number }[], accent: string): void => {
    ctx.lineWidth = 1.4
    ctx.strokeStyle = "rgba(110, 240, 255, 0.4)"
    ctx.shadowColor = "rgba(0, 230, 255, 0.7)"
    ctx.shadowBlur = 7
    ctx.beginPath()
    for (const [from, to] of CONNECTIONS) {
      ctx.moveTo(points[from].x, points[from].y)
      ctx.lineTo(points[to].x, points[to].y)
    }
    ctx.stroke()

    ctx.fillStyle = "rgba(150, 245, 255, 0.7)"
    for (const point of points) {
      ctx.beginPath()
      ctx.arc(point.x, point.y, 2, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.strokeStyle = accent
    ctx.lineWidth = 1.2
    for (const tip of FINGERTIPS) {
      ctx.beginPath()
      ctx.arc(points[tip].x, points[tip].y, 4.5, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  const palmCenter = (points: { x: number; y: number }[]): { x: number; y: number } => {
    let x = 0
    let y = 0
    for (const index of PALM_POINTS) {
      x += points[index].x
      y += points[index].y
    }
    return { x: x / PALM_POINTS.length, y: y / PALM_POINTS.length }
  }

  const drawLabel = (text: string, x: number, y: number, accent: string): void => {
    ctx.font = FONT
    ctx.fillStyle = accent
    ctx.shadowBlur = 6
    ctx.fillText(text, x, y)
  }

  const drawKnobGauge = (viz: ControlViz, points: { x: number; y: number }[], accent: string): void => {
    const thumb = points[4]
    const tip = points[viz.knobTip]
    const cx = (thumb.x + tip.x) / 2
    const cy = (thumb.y + tip.y) / 2
    const start = Math.PI * 0.75
    const sweep = Math.PI * 1.5

    ctx.lineWidth = 2.5
    ctx.strokeStyle = "rgba(110, 240, 255, 0.25)"
    ctx.beginPath()
    ctx.arc(cx, cy, 24, start, start + sweep)
    ctx.stroke()

    ctx.strokeStyle = accent
    ctx.beginPath()
    ctx.arc(cx, cy, 24, start, start + sweep * Math.min(viz.value, 1))
    ctx.stroke()

    ctx.lineWidth = 1
    ctx.setLineDash([3, 5])
    ctx.strokeStyle = "rgba(110, 240, 255, 0.4)"
    ctx.beginPath()
    ctx.moveTo(thumb.x, thumb.y)
    ctx.lineTo(tip.x, tip.y)
    ctx.stroke()
    ctx.setLineDash([])

    drawLabel(viz.label, cx + 34, cy + 4, accent)
  }

  const drawJetSight = (viz: ControlViz, points: { x: number; y: number }[], accent: string): void => {
    const base = points[5]
    const tip = points[8]
    const dx = tip.x - base.x
    const dy = tip.y - base.y
    const length = Math.max(Math.hypot(dx, dy), 1e-5)
    const reach = Math.hypot(width, height)

    ctx.lineWidth = 1.2
    ctx.strokeStyle = accent
    ctx.setLineDash([7, 9])
    ctx.beginPath()
    ctx.moveTo(tip.x, tip.y)
    ctx.lineTo(tip.x + (dx / length) * reach, tip.y + (dy / length) * reach)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.beginPath()
    ctx.arc(tip.x, tip.y, 11, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(tip.x - 16, tip.y)
    ctx.lineTo(tip.x - 6, tip.y)
    ctx.moveTo(tip.x + 6, tip.y)
    ctx.lineTo(tip.x + 16, tip.y)
    ctx.moveTo(tip.x, tip.y - 16)
    ctx.lineTo(tip.x, tip.y - 6)
    ctx.moveTo(tip.x, tip.y + 6)
    ctx.lineTo(tip.x, tip.y + 16)
    ctx.stroke()

    drawLabel(viz.label, tip.x + 20, tip.y - 14, accent)
  }

  const drawFistWarning = (viz: ControlViz, points: { x: number; y: number }[], accent: string, timeSeconds: number): void => {
    const palm = palmCenter(points)
    const pulse = 1 + 0.18 * Math.sin(timeSeconds * 7)
    ctx.lineWidth = 1.6
    ctx.strokeStyle = accent
    ctx.beginPath()
    ctx.arc(palm.x, palm.y, 20 * pulse, 0, Math.PI * 2)
    ctx.stroke()
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.arc(palm.x, palm.y, 30 * pulse, 0, Math.PI * 2)
    ctx.stroke()
    drawLabel(viz.label, palm.x + 38, palm.y + 4, accent)
  }

  const drawResetRing = (viz: ControlViz, points: { x: number; y: number }[], accent: string): void => {
    const palm = palmCenter(points)
    ctx.lineWidth = 2.5
    ctx.strokeStyle = "rgba(110, 240, 255, 0.25)"
    ctx.beginPath()
    ctx.arc(palm.x, palm.y, 26, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = accent
    ctx.beginPath()
    ctx.arc(palm.x, palm.y, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(viz.value, 1))
    ctx.stroke()
    drawLabel(viz.label, palm.x + 36, palm.y + 4, accent)
  }

  const draw = (viz: ControlViz | null, timeSeconds: number): void => {
    ctx.clearRect(0, 0, width, height)
    if (!viz || viz.points.length < 21) return
    const points = viz.points.map((point) => ({ x: point.x * width, y: point.y * height }))
    const accent = ACCENTS[viz.mode]

    drawSkeleton(points, accent)
    if (viz.mode === "knob") drawKnobGauge(viz, points, accent)
    else if (viz.mode === "jet") drawJetSight(viz, points, accent)
    else if (viz.mode === "fist") drawFistWarning(viz, points, accent, timeSeconds)
    else if (viz.mode === "reset") drawResetRing(viz, points, accent)
    ctx.shadowBlur = 0
  }

  return { draw, resize }
}
