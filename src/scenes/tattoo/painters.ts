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

function bandPath(ctx: CanvasRenderingContext2D, frame: Frame): void {
  const wristHalf = frame.handLen * 0.52
  const elbowHalf = frame.handLen * 0.66
  const start = add(frame.wrist, frame.dir, -frame.handLen * 0.08)
  const end = add(frame.wrist, frame.dir, frame.armLen * 0.96)
  const a = add(start, frame.perp, wristHalf)
  const b = add(end, frame.perp, elbowHalf)
  const c = add(end, frame.perp, -elbowHalf)
  const d = add(start, frame.perp, -wristHalf)
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.lineTo(c.x, c.y)
  ctx.lineTo(d.x, d.y)
  ctx.closePath()
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

  bandPath(ctx, frame)
  ctx.fillStyle = "rgba(0, 26, 36, 0.5)"
  ctx.fill()
  ctx.strokeStyle = "rgba(110, 250, 255, 0.85)"
  ctx.lineWidth = 3
  ctx.stroke()

  ctx.save()
  bandPath(ctx, frame)
  ctx.clip()
  ctx.translate(wrist.x, wrist.y)
  ctx.rotate(angle)

  ctx.strokeStyle = "rgba(0, 245, 235, 0.7)"
  ctx.fillStyle = "rgba(0, 245, 235, 0.7)"
  ctx.lineWidth = 3.2
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
        ctx.arc(rail[k].x, rail[k].y, 4.5, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.fillRect(rail[k].x - 4, rail[k].y - 4, 8, 8)
      }
    }
  }

  ctx.lineWidth = 2
  ctx.strokeStyle = "rgba(110, 250, 255, 0.45)"
  for (let plate = 1; plate <= 5; plate++) {
    const x = (plate / 6) * armLen
    polyline(ctx, [
      { x: x + handLen * 0.16, y: -halfWidth },
      { x: x - handLen * 0.12, y: 0 },
      { x: x + handLen * 0.16, y: halfWidth },
    ])
  }

  const cpuX = armLen * 0.48
  ctx.lineWidth = 3
  ctx.strokeStyle = "rgba(150, 255, 250, 0.9)"
  ctx.beginPath()
  ctx.arc(cpuX, 0, handLen * 0.42, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cpuX, 0, handLen * 0.24, 0, Math.PI * 2)
  ctx.stroke()
  polyline(ctx, [
    { x: cpuX - handLen * 0.42, y: 0 },
    { x: cpuX + handLen * 0.42, y: 0 },
  ])
  polyline(ctx, [
    { x: cpuX, y: -handLen * 0.42 },
    { x: cpuX, y: handLen * 0.42 },
  ])
  for (let o = 0; o < 6; o++) {
    const orbit = now * 0.9 + (o * Math.PI) / 3
    ctx.beginPath()
    ctx.arc(cpuX + Math.cos(orbit) * handLen * 0.33, Math.sin(orbit) * handLen * 0.33, 2.4, 0, Math.PI * 2)
    ctx.fill()
  }

  for (let h = 0; h < 7; h++) {
    const hx = armLen * 0.78 + (h % 3) * handLen * 0.2
    const hy = (Math.floor(h / 3) - 1) * handLen * 0.2
    ctx.beginPath()
    for (let v = 0; v <= 6; v++) {
      const a = (v / 6) * Math.PI * 2 + Math.PI / 6
      const px = hx + Math.cos(a) * handLen * 0.09
      const py = hy + Math.sin(a) * handLen * 0.09
      if (v === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
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

  palmPath(ctx, points)
  ctx.fillStyle = "rgba(0, 26, 36, 0.42)"
  ctx.fill()
  ctx.strokeStyle = "rgba(110, 250, 255, 0.7)"
  ctx.lineWidth = 2.4
  ctx.stroke()

  ctx.strokeStyle = "rgba(0, 245, 235, 0.75)"
  ctx.fillStyle = "rgba(0, 245, 235, 0.75)"
  ctx.lineWidth = 3
  const hub = palmCenter(points)
  ctx.beginPath()
  ctx.arc(hub.x, hub.y, handLen * 0.16, 0, Math.PI * 2)
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

export function drawNature(c2d: Canvas2d, points: Pt[], forearm: Forearm, now: number): void {
  const frame = armFrame(points, forearm)
  if (!frame) return
  const { wrist, handLen, armLen, dir, perp, angle } = frame
  const ctx = c2d.ctx
  const halfWidth = handLen * 0.6

  ctx.save()
  ctx.lineJoin = "round"
  ctx.shadowColor = "rgba(90, 230, 130, 0.65)"
  ctx.shadowBlur = 9

  bandPath(ctx, frame)
  ctx.fillStyle = "rgba(8, 34, 16, 0.45)"
  ctx.fill()
  ctx.strokeStyle = "rgba(160, 255, 170, 0.7)"
  ctx.lineWidth = 2.6
  ctx.stroke()

  ctx.save()
  bandPath(ctx, frame)
  ctx.clip()
  ctx.translate(wrist.x, wrist.y)
  ctx.rotate(angle)

  ctx.strokeStyle = "rgba(150, 235, 150, 0.7)"
  ctx.fillStyle = "rgba(70, 190, 90, 0.5)"
  ctx.lineWidth = 2

  for (let i = 0; i < 14; i++) {
    const side = i % 2 === 0 ? 1 : -1
    const x = (i / 14) * armLen * 0.95 + handLen * 0.1
    const y = side * halfWidth * (0.3 + 0.35 * hashN(i * 3.3))
    const sway = Math.sin(now * 0.9 + i * 1.4) * 0.18
    const leafAngle = side * (1.1 + sway) + 0.25
    leafShape(ctx, { x, y }, leafAngle, handLen * (0.32 + 0.18 * hashN(i * 7.7)))
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

  const galaxyX = armLen * 0.52
  ctx.shadowColor = "rgba(200, 170, 255, 0.9)"
  for (let i = 0; i < 70; i++) {
    const t = i / 70
    const armOffset = i % 2 === 0 ? 0 : Math.PI
    const spiral = t * 4.6 + armOffset + now * 0.22
    const radius = handLen * 0.5 * Math.sqrt(t)
    const px = galaxyX + Math.cos(spiral) * radius
    const py = Math.sin(spiral) * radius * 0.55
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

  ctx.shadowColor = "rgba(255, 215, 120, 0.9)"
  for (let i = 0; i < 12; i++) {
    const base = add(
      add(wrist, dir, (0.2 + 0.75 * hashN(i + 40.2)) * armLen),
      perp,
      (hashN(i + 50.7) - 0.5) * handLen * 1.7,
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
