import type { Canvas2d } from "../../core/canvas2d"

type Pt = { x: number; y: number }

export type Forearm = { dir: Pt; length: number } | null

const FINGER_CHAINS = [
  [1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
]
const KNUCKLES = [5, 9, 13, 17]
const PALM_RING = [0, 1, 5, 9, 13, 17]

const hashN = (n: number): number => {
  const s = Math.sin(n * 127.1) * 43758.5453
  return s - Math.floor(s)
}

const add = (a: Pt, b: Pt, scale: number): Pt => ({ x: a.x + b.x * scale, y: a.y + b.y * scale })

type Frame = { wrist: Pt; handLen: number; armLen: number; dir: Pt; perp: Pt; angle: number }

function armFrame(points: Pt[], forearm: Forearm): Frame | null {
  const wrist = points[0]
  const mcp = points[9]
  const handLen = Math.hypot(wrist.x - mcp.x, wrist.y - mcp.y)
  if (handLen < 12) return null
  let dir = { x: (wrist.x - mcp.x) / handLen, y: (wrist.y - mcp.y) / handLen }
  let armLen = handLen * 2.4
  if (forearm) {
    dir = forearm.dir
    armLen = Math.max(forearm.length * 0.94, handLen)
  }
  return {
    wrist,
    handLen,
    armLen,
    dir,
    perp: { x: -dir.y, y: dir.x },
    angle: Math.atan2(dir.y, dir.x),
  }
}

function palmPath(ctx: CanvasRenderingContext2D, points: Pt[]): void {
  ctx.beginPath()
  const first = points[PALM_RING[0]]
  ctx.moveTo(first.x, first.y)
  for (let i = 1; i < PALM_RING.length; i++) {
    const point = points[PALM_RING[i]]
    ctx.lineTo(point.x, point.y)
  }
  ctx.closePath()
}

function palmCenter(points: Pt[]): Pt {
  let x = 0
  let y = 0
  for (const index of KNUCKLES) {
    x += points[index].x
    y += points[index].y
  }
  x += points[0].x
  y += points[0].y
  return { x: x / (KNUCKLES.length + 1), y: y / (KNUCKLES.length + 1) }
}

function polyline(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.stroke()
}

function smoothLine(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length - 1; i++) {
    const midX = (pts[i].x + pts[i + 1].x) / 2
    const midY = (pts[i].y + pts[i + 1].y) / 2
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY)
  }
  const last = pts[pts.length - 1]
  ctx.lineTo(last.x, last.y)
  ctx.stroke()
}

function hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  for (let v = 0; v <= 6; v++) {
    const a = (v / 6) * Math.PI * 2 + Math.PI / 6
    const px = cx + Math.cos(a) * radius
    const py = cy + Math.sin(a) * radius
    if (v === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
}

function chamferPlate(x0: number, x1: number, w0: number, w1: number, c: number): Pt[] {
  return [
    { x: x0 + c, y: -w0 },
    { x: x1 - c, y: -w1 },
    { x: x1, y: -w1 + c },
    { x: x1, y: w1 - c },
    { x: x1 - c, y: w1 },
    { x: x0 + c, y: w0 },
    { x: x0, y: w0 - c },
    { x: x0, y: -w0 + c },
  ]
}

function buildPlates(handLen: number, armLen: number): Pt[][] {
  const bounds = [-0.08, 0.2, 0.46, 0.72, 0.96]
  const plates: Pt[][] = []
  for (let s = 0; s < bounds.length - 1; s++) {
    const x0 = bounds[s] * armLen + (s === 0 ? 0 : 4)
    const x1 = bounds[s + 1] * armLen - 4
    const taper0 = 0.5 + 0.16 * ((bounds[s] + 0.08) / 1.04)
    const taper1 = 0.5 + 0.16 * ((bounds[s + 1] + 0.08) / 1.04)
    const w0 = handLen * taper0 * (0.92 + 0.14 * hashN(s * 3.1))
    const w1 = handLen * taper1 * (0.92 + 0.14 * hashN(s * 3.1 + 1))
    const chamfer = Math.min(13, (x1 - x0) * 0.24)
    plates.push(chamferPlate(x0, x1, w0, w1, chamfer))
  }
  return plates
}

function tracePlates(ctx: CanvasRenderingContext2D, plates: Pt[][]): void {
  ctx.beginPath()
  for (const plate of plates) {
    ctx.moveTo(plate[0].x, plate[0].y)
    for (let i = 1; i < plate.length; i++) ctx.lineTo(plate[i].x, plate[i].y)
    ctx.closePath()
  }
}

function hexCluster(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  count: number,
  spread: number,
  baseSize: number,
  seed: number,
  now: number,
): void {
  for (let i = 0; i < count; i++) {
    const scatter = hashN(seed + i * 7.3) * Math.PI * 2
    const dist = spread * (0.25 + 0.75 * hashN(seed + i * 3.1))
    const bob = Math.sin(now * (0.6 + hashN(seed + i) * 0.7) + i * 2.2) * baseSize * 0.35
    const px = cx + Math.cos(scatter) * dist
    const py = cy + Math.sin(scatter) * dist * 0.8 + bob
    const size = baseSize * (0.45 + 0.9 * hashN(seed + i * 11.7))
    const pulse = 0.5 + 0.5 * Math.sin(now * 1.3 + i * 1.9 + seed)
    ctx.fillStyle = `rgba(40, 170, 255, ${(0.14 + 0.2 * pulse).toFixed(3)})`
    ctx.strokeStyle = `rgba(120, 220, 255, ${(0.5 + 0.45 * pulse).toFixed(3)})`
    ctx.lineWidth = 2.4
    ctx.beginPath()
    hexPath(ctx, px, py, size)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    if (i % 3 === 0) {
      ctx.beginPath()
      hexPath(ctx, px, py, size * 0.55)
      ctx.closePath()
      ctx.stroke()
    }
  }
}

function holoPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
  now: number,
): void {
  const c = Math.min(w, h) * 0.18
  ctx.beginPath()
  ctx.moveTo(x + c, y)
  ctx.lineTo(x + w, y)
  ctx.lineTo(x + w, y + h - c)
  ctx.lineTo(x + w - c, y + h)
  ctx.lineTo(x, y + h)
  ctx.lineTo(x, y + c)
  ctx.closePath()
  ctx.fillStyle = "rgba(0, 30, 44, 0.5)"
  ctx.fill()
  ctx.strokeStyle = "rgba(90, 240, 255, 0.85)"
  ctx.lineWidth = 2.2
  ctx.stroke()
  ctx.fillStyle = "rgba(90, 240, 255, 0.8)"
  ctx.fillRect(x + 5, y + 5, w * 0.45, 4)
  ctx.lineWidth = 2.2
  ctx.strokeStyle = "rgba(90, 240, 255, 0.55)"
  for (let row = 0; row < 4; row++) {
    const ry = y + h * 0.32 + row * h * 0.16
    const jitter = hashN(seed + row * 3.7 + Math.floor(now * (1.4 + hashN(seed + row))))
    ctx.beginPath()
    ctx.moveTo(x + 7, ry)
    ctx.lineTo(x + 7 + (w * 0.62 - 14) * (0.3 + 0.7 * jitter), ry)
    ctx.stroke()
  }
  const gx = x + w * 0.78
  const gy = y + h * 0.45
  ctx.beginPath()
  ctx.arc(gx, gy, h * 0.2, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = "rgba(190, 255, 255, 0.95)"
  ctx.beginPath()
  ctx.arc(gx, gy, h * 0.2, now * 1.7 + seed, now * 1.7 + seed + Math.PI * 1.2)
  ctx.stroke()
}

function haloRings(
  ctx: CanvasRenderingContext2D,
  x: number,
  count: number,
  handLen: number,
  seed: number,
  now: number,
): void {
  ctx.save()
  ctx.strokeStyle = "rgba(80, 230, 255, 0.55)"
  for (let r = 0; r < count; r++) {
    const radius = handLen * (0.85 + r * 0.32)
    ctx.lineWidth = 2.6 - r * 0.5
    ctx.setLineDash([radius * 0.5, radius * 0.28])
    ctx.lineDashOffset = now * 30 * (r % 2 === 0 ? 1 : -1) + seed
    ctx.beginPath()
    ctx.ellipse(x, 0, radius * 0.32, radius, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.setLineDash([])
  ctx.restore()
}

export function drawTech(c2d: Canvas2d, points: Pt[], forearm: Forearm, now: number): void {
  const frame = armFrame(points, forearm)
  if (!frame) return
  const { wrist, handLen, armLen, angle } = frame
  const ctx = c2d.ctx
  const halfWidth = handLen * 0.6

  ctx.save()
  ctx.lineJoin = "miter"
  ctx.shadowColor = "rgba(0, 230, 255, 0.7)"
  ctx.shadowBlur = 9

  ctx.save()
  ctx.translate(wrist.x, wrist.y)
  ctx.rotate(angle)

  haloRings(ctx, armLen * 0.14, 3, handLen, 2.3, now)
  haloRings(ctx, armLen * 0.86, 2, handLen, 7.9, now)

  const plates = buildPlates(handLen, armLen)
  tracePlates(ctx, plates)
  ctx.fillStyle = "rgba(0, 26, 36, 0.46)"
  ctx.fill()

  ctx.save()
  tracePlates(ctx, plates)
  ctx.clip()

  ctx.strokeStyle = "rgba(0, 245, 235, 0.7)"
  ctx.fillStyle = "rgba(0, 245, 235, 0.7)"
  ctx.lineWidth = 3
  const rails = [-0.62, -0.3, 0, 0.32, 0.6]
  const railPaths: Pt[][] = []
  for (let r = 0; r < rails.length; r++) {
    const baseY = rails[r] * halfWidth
    const rail: Pt[] = [{ x: -handLen * 0.1, y: baseY }]
    let y = baseY
    for (let k = 1; k <= 5; k++) {
      const x = (k / 5) * armLen * 0.96
      const jog = hashN(r * 17 + k * 7) > 0.55 ? (hashN(r * 5 + k * 11) - 0.5) * halfWidth * 0.45 : 0
      if (jog !== 0) {
        rail.push({ x: x - handLen * 0.16, y })
        y = Math.max(-halfWidth * 0.85, Math.min(halfWidth * 0.85, baseY + jog))
      }
      rail.push({ x, y })
    }
    railPaths.push(rail)
    polyline(ctx, rail)
    for (let k = 1; k < rail.length - 1; k++) {
      if (hashN(r * 31 + k * 13) > 0.5) {
        ctx.beginPath()
        ctx.arc(rail[k].x, rail[k].y, 4, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.fillRect(rail[k].x - 3.5, rail[k].y - 3.5, 7, 7)
      }
    }
  }

  ctx.lineWidth = 1.6
  ctx.strokeStyle = "rgba(110, 250, 255, 0.35)"
  for (let cut = 0; cut < 3; cut++) {
    const cutX = armLen * (0.18 + 0.3 * cut)
    polyline(ctx, [
      { x: cutX - halfWidth * 0.5, y: -halfWidth },
      { x: cutX + halfWidth * 0.5, y: halfWidth },
    ])
  }

  const cpuX = armLen * 0.48
  ctx.lineWidth = 3
  ctx.strokeStyle = "rgba(150, 255, 250, 0.9)"
  ctx.beginPath()
  ctx.arc(cpuX, 0, handLen * 0.4, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  hexPath(ctx, cpuX, 0, handLen * 0.26)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cpuX, 0, handLen * 0.12, 0, Math.PI * 2)
  ctx.stroke()
  polyline(ctx, [
    { x: cpuX - handLen * 0.4, y: 0 },
    { x: cpuX + handLen * 0.4, y: 0 },
  ])
  polyline(ctx, [
    { x: cpuX, y: -handLen * 0.4 },
    { x: cpuX, y: handLen * 0.4 },
  ])
  ctx.fillStyle = "rgba(150, 255, 250, 0.9)"
  for (let o = 0; o < 6; o++) {
    const orbit = now * 0.9 + (o * Math.PI) / 3
    ctx.beginPath()
    ctx.arc(cpuX + Math.cos(orbit) * handLen * 0.33, Math.sin(orbit) * handLen * 0.33, 2.4, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.lineWidth = 2
  ctx.strokeStyle = "rgba(0, 245, 235, 0.7)"
  for (let h = 0; h < 7; h++) {
    const hx = armLen * 0.78 + (h % 3) * handLen * 0.19
    const hy = (Math.floor(h / 3) - 1) * handLen * 0.19
    ctx.beginPath()
    hexPath(ctx, hx, hy, handLen * 0.085)
    ctx.stroke()
  }

  const sweepX = ((now * 0.22) % 1) * armLen
  ctx.strokeStyle = "rgba(180, 255, 252, 0.35)"
  ctx.lineWidth = 7
  ctx.shadowBlur = 18
  polyline(ctx, [
    { x: sweepX, y: -halfWidth },
    { x: sweepX, y: halfWidth },
  ])

  ctx.shadowBlur = 9
  ctx.shadowColor = "rgba(255, 60, 220, 0.9)"
  ctx.fillStyle = "rgba(255, 90, 230, 0.95)"
  for (let i = 0; i < 6; i++) {
    const rail = railPaths[i % railPaths.length]
    const t = (now * 0.3 + i * 0.17) % 1
    const seg = t * (rail.length - 1)
    const sIndex = Math.min(Math.floor(seg), rail.length - 2)
    const f = seg - sIndex
    const px = rail[sIndex].x + (rail[sIndex + 1].x - rail[sIndex].x) * f
    const py = rail[sIndex].y + (rail[sIndex + 1].y - rail[sIndex].y) * f
    ctx.beginPath()
    ctx.arc(px, py, 3, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  ctx.shadowColor = "rgba(0, 230, 255, 0.7)"
  ctx.strokeStyle = "rgba(110, 250, 255, 0.85)"
  ctx.fillStyle = "rgba(0, 245, 235, 0.7)"
  ctx.lineWidth = 2.6
  for (let p = 0; p < plates.length; p++) {
    const plate = plates[p]
    ctx.beginPath()
    ctx.moveTo(plate[0].x, plate[0].y)
    for (let i = 1; i < plate.length; i++) ctx.lineTo(plate[i].x, plate[i].y)
    ctx.closePath()
    ctx.stroke()
    ctx.lineWidth = 1.4
    ctx.beginPath()
    hexPath(ctx, plate[0].x + 6, plate[0].y + 8, 3.4)
    ctx.stroke()
    ctx.beginPath()
    hexPath(ctx, plate[4].x - 6, plate[4].y - 8, 3.4)
    ctx.stroke()
    ctx.lineWidth = 2.6
    if (p < plates.length - 1) {
      const gapX = plate[2].x + 4
      const side = p % 2 === 0 ? 1 : -1
      const wingY = side * (handLen * 0.56)
      ctx.beginPath()
      ctx.moveTo(gapX - 12, wingY)
      ctx.lineTo(gapX + 12, wingY)
      ctx.lineTo(gapX, wingY + side * 18)
      ctx.closePath()
      ctx.stroke()
    }
  }

  const clusterX = armLen * 0.62
  const clusterY = -(halfWidth + handLen * 1.1)
  ctx.strokeStyle = "rgba(90, 240, 255, 0.4)"
  ctx.lineWidth = 1.6
  polyline(ctx, [
    { x: clusterX, y: -halfWidth * 0.9 },
    { x: clusterX, y: clusterY + handLen * 0.5 },
  ])
  ctx.fillStyle = "rgba(150, 255, 250, 0.9)"
  ctx.beginPath()
  ctx.arc(clusterX, clusterY + handLen * 0.5, 3, 0, Math.PI * 2)
  ctx.fill()
  hexCluster(ctx, clusterX, clusterY, 9, handLen * 1.05, handLen * 0.3, 3.7, now)
  hexCluster(ctx, armLen * 0.06, halfWidth + handLen * 0.9, 5, handLen * 0.55, handLen * 0.2, 9.2, now)

  const panelX = armLen * 0.52
  const panelY = halfWidth + handLen * 0.55 + Math.sin(now * 1.1) * handLen * 0.08
  ctx.strokeStyle = "rgba(90, 240, 255, 0.4)"
  ctx.lineWidth = 1.6
  polyline(ctx, [
    { x: panelX + handLen * 0.2, y: halfWidth * 0.9 },
    { x: panelX + handLen * 0.2, y: panelY },
  ])
  holoPanel(ctx, panelX, panelY, handLen * 1.6, handLen * 1.05, 4.2, now)

  ctx.fillStyle = "rgba(120, 220, 255, 0.65)"
  for (let i = 0; i < 10; i++) {
    const t = now * (0.2 + 0.25 * hashN(i + 60.3)) + hashN(i + 61.7) * 9
    const px = armLen * (0.05 + 0.9 * hashN(i + 62.1)) + Math.sin(t) * handLen * 0.35
    const py = (hashN(i + 63.9) - 0.5) * handLen * 4.6 + Math.cos(t * 0.7) * handLen * 0.3
    const size = 3 + 4 * hashN(i + 64.3)
    ctx.beginPath()
    for (let v = 0; v < 3; v++) {
      const vertA = t * 0.8 + (v / 3) * Math.PI * 2
      const vx = px + Math.cos(vertA) * size
      const vy = py + Math.sin(vertA) * size
      if (v === 0) ctx.moveTo(vx, vy)
      else ctx.lineTo(vx, vy)
    }
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()

  palmPath(ctx, points)
  ctx.fillStyle = "rgba(0, 26, 36, 0.42)"
  ctx.fill()
  ctx.strokeStyle = "rgba(110, 250, 255, 0.7)"
  ctx.lineWidth = 2.4
  ctx.stroke()

  ctx.strokeStyle = "rgba(0, 245, 235, 0.75)"
  ctx.fillStyle = "rgba(0, 245, 235, 0.75)"
  ctx.lineWidth = 2.6
  const hub = palmCenter(points)
  ctx.beginPath()
  hexPath(ctx, hub.x, hub.y, handLen * 0.22)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(hub.x, hub.y, handLen * 0.11, 0, Math.PI * 2)
  ctx.stroke()
  for (const knuckle of KNUCKLES) {
    polyline(ctx, [hub, points[knuckle]])
    ctx.fillRect(points[knuckle].x - 4, points[knuckle].y - 4, 8, 8)
  }
  polyline(ctx, [hub, points[2]])

  for (const chain of FINGER_CHAINS) {
    const chainPts = chain.map((index) => points[index])
    ctx.lineWidth = 3.4
    polyline(ctx, chainPts)
    ctx.lineWidth = 1.4
    const tip = chainPts[chainPts.length - 1]
    const blink = 0.5 + 0.5 * Math.abs(Math.sin(now * 2.2 + chain[0]))
    ctx.fillStyle = `rgba(120, 255, 245, ${blink.toFixed(3)})`
    ctx.fillRect(tip.x - 3, tip.y - 3, 6, 6)
    ctx.fillStyle = "rgba(0, 245, 235, 0.75)"
    for (let j = 1; j < chainPts.length - 1; j++) {
      ctx.beginPath()
      ctx.arc(chainPts[j].x, chainPts[j].y, 2.6, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

function leafShape(ctx: CanvasRenderingContext2D, base: Pt, angle: number, size: number): void {
  const tip = add(base, { x: Math.cos(angle), y: Math.sin(angle) }, size)
  const side = { x: -Math.sin(angle), y: Math.cos(angle) }
  const mid = add(base, { x: Math.cos(angle), y: Math.sin(angle) }, size * 0.5)
  const c1 = add(mid, side, size * 0.42)
  const c2 = add(mid, side, -size * 0.42)
  ctx.beginPath()
  ctx.moveTo(base.x, base.y)
  ctx.quadraticCurveTo(c1.x, c1.y, tip.x, tip.y)
  ctx.quadraticCurveTo(c2.x, c2.y, base.x, base.y)
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(base.x, base.y)
  ctx.lineTo(mid.x, mid.y)
  ctx.stroke()
}

function traceOrganic(ctx: CanvasRenderingContext2D, handLen: number, armLen: number, now: number): void {
  const w = handLen * 0.62
  const steps = 7
  ctx.beginPath()
  let prev: Pt = { x: -handLen * 0.06, y: -w * 0.72 }
  ctx.moveTo(prev.x, prev.y)
  for (let k = 1; k <= steps; k++) {
    const x = (k / steps) * armLen * 0.96
    const y = -(w * (0.58 + 0.34 * hashN(k * 7.7)) + Math.sin(now * 0.9 + k * 1.3) * 3)
    const ctrlX = (prev.x + x) / 2
    const ctrlY = Math.min(prev.y, y) - w * 0.3
    ctx.quadraticCurveTo(ctrlX, ctrlY, x, y)
    prev = { x, y }
  }
  const elbowTip: Pt = { x: armLen * 1.02, y: 0 }
  ctx.quadraticCurveTo(armLen * 1.0, -w * 0.3, elbowTip.x, elbowTip.y)
  let prevBottom: Pt = elbowTip
  for (let k = steps; k >= 1; k--) {
    const x = (k / steps) * armLen * 0.96
    const y = w * (0.58 + 0.34 * hashN(k * 4.3 + 9)) + Math.sin(now * 0.8 + k * 1.7) * 3
    const ctrlX = (prevBottom.x + x) / 2
    const ctrlY = Math.max(prevBottom.y, y) + w * 0.3
    ctx.quadraticCurveTo(ctrlX, ctrlY, x, y)
    prevBottom = { x, y }
  }
  ctx.quadraticCurveTo(-handLen * 0.1, w * 0.4, -handLen * 0.06, -w * 0.72)
  ctx.closePath()
}

export function drawNature(c2d: Canvas2d, points: Pt[], forearm: Forearm, now: number): void {
  const frame = armFrame(points, forearm)
  if (!frame) return
  const { wrist, handLen, armLen, dir, perp, angle } = frame
  const ctx = c2d.ctx
  const halfWidth = handLen * 0.62

  ctx.save()
  ctx.lineJoin = "round"
  ctx.shadowColor = "rgba(90, 230, 130, 0.65)"
  ctx.shadowBlur = 9

  ctx.save()
  ctx.translate(wrist.x, wrist.y)
  ctx.rotate(angle)

  traceOrganic(ctx, handLen, armLen, now)
  ctx.fillStyle = "rgba(8, 34, 16, 0.42)"
  ctx.fill()

  ctx.save()
  traceOrganic(ctx, handLen, armLen, now)
  ctx.clip()

  ctx.strokeStyle = "rgba(150, 235, 150, 0.7)"
  ctx.fillStyle = "rgba(70, 190, 90, 0.5)"
  ctx.lineWidth = 2

  for (let i = 0; i < 14; i++) {
    const side = i % 2 === 0 ? 1 : -1
    const x = (i / 14) * armLen * 0.95 + handLen * 0.1
    const y = side * halfWidth * (0.3 + 0.35 * hashN(i * 3.3))
    const sway = Math.sin(now * 0.9 + i * 1.4) * 0.18
    leafShape(ctx, { x, y }, side * (1.1 + sway) + 0.25, handLen * (0.32 + 0.18 * hashN(i * 7.7)))
  }

  ctx.lineWidth = 4.2
  ctx.strokeStyle = "rgba(170, 245, 160, 0.85)"
  const vine: Pt[] = []
  for (let k = 0; k <= 8; k++) {
    vine.push({
      x: (k / 8) * armLen * 0.95,
      y: Math.sin(k * 1.1 + now * 0.7) * halfWidth * 0.38,
    })
  }
  smoothLine(ctx, vine)
  ctx.lineWidth = 2.4
  ctx.strokeStyle = "rgba(150, 235, 150, 0.55)"
  const vine2: Pt[] = []
  for (let k = 0; k <= 8; k++) {
    vine2.push({
      x: (k / 8) * armLen * 0.9,
      y: Math.sin(k * 1.3 + now * 0.7 + 2.4) * halfWidth * 0.55,
    })
  }
  smoothLine(ctx, vine2)

  ctx.fillStyle = "rgba(220, 160, 200, 0.6)"
  for (let i = 0; i < 5; i++) {
    const bx = armLen * (0.15 + 0.17 * i)
    const by = Math.sin(i * 2.2 + now * 0.5) * halfWidth * 0.5
    for (let berry = 0; berry < 3; berry++) {
      ctx.beginPath()
      ctx.arc(bx + (hashN(i * 9 + berry) - 0.5) * 14, by + (hashN(i * 5 + berry) - 0.5) * 14, 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  ctx.restore()

  traceOrganic(ctx, handLen, armLen, now)
  ctx.strokeStyle = "rgba(160, 255, 170, 0.7)"
  ctx.lineWidth = 2.6
  ctx.stroke()

  const galaxyX = armLen * 0.52
  ctx.shadowColor = "rgba(200, 170, 255, 0.9)"
  for (let i = 0; i < 90; i++) {
    const t = i / 90
    const armOffset = i % 2 === 0 ? 0 : Math.PI
    const spiral = t * 4.6 + armOffset + now * 0.22
    const radius = handLen * 0.95 * Math.sqrt(t)
    const px = galaxyX + Math.cos(spiral) * radius
    const py = Math.sin(spiral) * radius * 0.62
    const twinkle = 0.6 + 0.4 * Math.sin(now * 2.1 + i * 1.7)
    ctx.fillStyle =
      i % 6 === 0
        ? `rgba(255, 255, 255, ${((0.95 - t * 0.6) * twinkle).toFixed(3)})`
        : `rgba(215, 195, 255, ${((0.8 - t * 0.5) * twinkle).toFixed(3)})`
    ctx.beginPath()
    ctx.arc(px, py, i % 6 === 0 ? 2 : 1.4, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.shadowBlur = 16
  ctx.fillStyle = "rgba(255, 252, 255, 0.95)"
  ctx.beginPath()
  ctx.arc(galaxyX, 0, 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 9
  ctx.shadowColor = "rgba(90, 230, 130, 0.65)"

  ctx.fillStyle = "rgba(60, 170, 80, 0.55)"
  ctx.strokeStyle = "rgba(170, 250, 170, 0.75)"
  ctx.lineWidth = 2
  for (let burst = 0; burst < 9; burst++) {
    const side = burst % 2 === 0 ? -1 : 1
    const bx = armLen * (0.05 + 0.11 * burst)
    const baseY = side * halfWidth * (0.65 + 0.3 * hashN(burst * 5.1))
    const fan = hashN(burst * 7.7) > 0.5 ? 3 : 2
    for (let leaf = 0; leaf < fan; leaf++) {
      const leafAngle =
        side * (Math.PI / 2) + (leaf - (fan - 1) / 2) * 0.6 + Math.sin(now * 0.8 + burst + leaf) * 0.14
      const size = handLen * (0.34 + 0.3 * hashN(burst * 13.3 + leaf * 3.7))
      leafShape(ctx, { x: bx, y: baseY }, leafAngle, size)
    }
  }

  for (let leaf = 0; leaf < 5; leaf++) {
    const leafAngle = (leaf - 2) * 0.5 + Math.sin(now * 0.7 + leaf) * 0.1
    leafShape(ctx, { x: armLen * 0.99, y: 0 }, leafAngle, handLen * (0.3 + 0.22 * hashN(leaf * 3.3 + 21)))
  }

  ctx.strokeStyle = "rgba(150, 220, 140, 0.85)"
  for (let br = 0; br < 3; br++) {
    const side = br % 2 === 0 ? 1 : -1
    const sx = armLen * (0.22 + 0.3 * br)
    const reach = handLen * (0.9 + 0.5 * hashN(br * 11.1))
    const sway = Math.sin(now * 0.9 + br * 2.1) * 0.15
    const branch: Pt[] = []
    for (let k = 0; k <= 3; k++) {
      const f = k / 3
      branch.push({
        x: sx + reach * f * (0.55 + sway * 0.3),
        y: side * (halfWidth * 0.7 + reach * f * (0.8 + sway)),
      })
    }
    ctx.lineWidth = 4.6 - br * 0.8
    smoothLine(ctx, branch)
    const tip = branch[3]
    const tipAngle = Math.atan2(tip.y - branch[2].y, tip.x - branch[2].x)
    for (let leaf = 0; leaf < 3; leaf++) {
      leafShape(ctx, tip, tipAngle + (leaf - 1) * 0.7, handLen * (0.22 + 0.12 * hashN(br * 7 + leaf)))
    }
  }

  const downLocal = { x: Math.sin(angle), y: Math.cos(angle) }
  const downPerp = { x: -downLocal.y, y: downLocal.x }
  ctx.strokeStyle = "rgba(150, 235, 150, 0.7)"
  for (let strand = 0; strand < 4; strand++) {
    const anchor: Pt = {
      x: armLen * (0.15 + 0.22 * strand),
      y: (downLocal.y >= 0 ? 1 : -1) * halfWidth * 0.8,
    }
    const len = handLen * (0.8 + 0.8 * hashN(strand * 9.1))
    const pts: Pt[] = []
    for (let k = 0; k <= 4; k++) {
      const f = k / 4
      const sway = Math.sin(now * 1.2 + strand * 1.9 + f * 2.2) * f * f * handLen * 0.22
      pts.push(add(add(anchor, downLocal, len * f), downPerp, sway))
    }
    ctx.lineWidth = 2.2
    smoothLine(ctx, pts)
    const hang = Math.atan2(downLocal.y, downLocal.x)
    leafShape(ctx, pts[4], hang + Math.sin(now * 1.2 + strand) * 0.3, handLen * 0.16)
    ctx.fillStyle = "rgba(220, 160, 200, 0.7)"
    ctx.beginPath()
    ctx.arc(pts[2].x, pts[2].y, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "rgba(60, 170, 80, 0.55)"
  }
  ctx.restore()

  palmPath(ctx, points)
  ctx.fillStyle = "rgba(8, 34, 16, 0.38)"
  ctx.fill()
  ctx.strokeStyle = "rgba(160, 255, 170, 0.6)"
  ctx.lineWidth = 2.2
  ctx.stroke()

  const center = palmCenter(points)
  ctx.strokeStyle = "rgba(170, 245, 160, 0.75)"
  ctx.fillStyle = "rgba(70, 190, 90, 0.4)"
  ctx.lineWidth = 2
  for (let ringIndex = 0; ringIndex < 2; ringIndex++) {
    const petals = ringIndex === 0 ? 6 : 10
    const radius = handLen * (ringIndex === 0 ? 0.18 : 0.32)
    for (let petal = 0; petal < petals; petal++) {
      const petalAngle = (petal / petals) * Math.PI * 2 + ringIndex * 0.3 + now * 0.1
      leafShape(ctx, center, petalAngle, radius)
    }
  }
  ctx.fillStyle = "rgba(255, 220, 150, 0.8)"
  ctx.beginPath()
  ctx.arc(center.x, center.y, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = "rgba(70, 190, 90, 0.4)"

  for (const chain of FINGER_CHAINS) {
    const chainPts = chain.map((index) => points[index])
    ctx.lineWidth = 3
    smoothLine(ctx, chainPts)
    ctx.lineWidth = 1.6
    for (let j = 1; j < chainPts.length - 1; j++) {
      const joint = chainPts[j]
      const next = chainPts[j + 1]
      const jointAngle = Math.atan2(next.y - joint.y, next.x - joint.x)
      const side = j % 2 === 0 ? 1 : -1
      leafShape(ctx, joint, jointAngle + side * 1.2, handLen * 0.11)
    }
    const tip = chainPts[chainPts.length - 1]
    const prev = chainPts[chainPts.length - 2]
    const tipAngle = Math.atan2(tip.y - prev.y, tip.x - prev.x)
    leafShape(ctx, tip, tipAngle + Math.sin(now * 1.4) * 0.3, handLen * 0.18)
  }

  ctx.strokeStyle = "rgba(170, 250, 170, 0.45)"
  ctx.lineWidth = 1.4
  for (let i = 0; i < 8; i++) {
    const base = add(
      add(wrist, dir, (0.05 + 0.95 * hashN(i + 70.3)) * armLen),
      perp,
      (hashN(i + 80.7) - 0.5) * handLen * 3.6,
    )
    const wobX = Math.sin(now * (0.5 + hashN(i + 5) * 0.6) + i * 2.7) * handLen * 0.2
    const wobY = Math.cos(now * (0.4 + hashN(i + 8) * 0.5) + i * 1.9) * handLen * 0.16
    const alpha = 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(now * 1.6 + i * 2.1))
    ctx.fillStyle = `rgba(120, 220, 110, ${alpha.toFixed(3)})`
    leafShape(
      ctx,
      { x: base.x + wobX, y: base.y + wobY },
      hashN(i + 90.1) * Math.PI * 2 + now * 0.5,
      handLen * 0.14,
    )
  }

  ctx.shadowColor = "rgba(255, 215, 120, 0.9)"
  for (let i = 0; i < 12; i++) {
    const base = add(
      add(wrist, dir, (0.2 + 0.75 * hashN(i + 40.2)) * armLen),
      perp,
      (hashN(i + 50.7) - 0.5) * handLen * 2.6,
    )
    const wobX = Math.sin(now * (0.7 + hashN(i) * 0.8) + i * 2.1) * handLen * 0.14
    const wobY = Math.cos(now * (0.6 + hashN(i + 3) * 0.7) + i * 1.3) * handLen * 0.1
    const alpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(now * 2.3 + i * 2.4))
    ctx.fillStyle = `rgba(255, 225, 140, ${alpha.toFixed(3)})`
    ctx.beginPath()
    ctx.arc(base.x + wobX, base.y + wobY, 2.2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}
