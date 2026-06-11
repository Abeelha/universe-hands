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

const hashN = (n: number): number => {
  const s = Math.sin(n * 127.1) * 43758.5453
  return s - Math.floor(s)
}

const rotate = (v: Pt, angle: number): Pt => ({
  x: v.x * Math.cos(angle) - v.y * Math.sin(angle),
  y: v.x * Math.sin(angle) + v.y * Math.cos(angle),
})

const add = (a: Pt, b: Pt, scale: number): Pt => ({ x: a.x + b.x * scale, y: a.y + b.y * scale })

type Frame = { wrist: Pt; handLen: number; armLen: number; dir: Pt; perp: Pt }

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
  return { wrist, handLen, armLen, dir, perp: { x: -dir.y, y: dir.x } }
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

function spinePoints(frame: Frame, count: number, wobble: number, seedBase: number): Pt[] {
  const pts: Pt[] = [frame.wrist]
  for (let k = 1; k <= count; k++) {
    const along = add(frame.wrist, frame.dir, (k / count) * frame.armLen * 0.95)
    pts.push(add(along, frame.perp, (hashN(k * 3.7 + seedBase) - 0.5) * frame.handLen * wobble))
  }
  return pts
}

function alongPath(pts: Pt[], t: number): Pt {
  const seg = t * (pts.length - 1)
  const a = Math.min(Math.floor(seg), pts.length - 2)
  const f = seg - a
  return {
    x: pts[a].x + (pts[a + 1].x - pts[a].x) * f,
    y: pts[a].y + (pts[a + 1].y - pts[a].y) * f,
  }
}

export function drawTech(c2d: Canvas2d, points: Pt[], forearm: Forearm, now: number): void {
  const frame = armFrame(points, forearm)
  if (!frame) return
  const { wrist, handLen, dir, perp } = frame
  const ctx = c2d.ctx
  const dirAngle = Math.atan2(dir.y, dir.x)

  ctx.save()
  ctx.lineJoin = "miter"
  ctx.shadowColor = "rgba(0, 230, 255, 0.75)"
  ctx.shadowBlur = 8
  ctx.strokeStyle = "rgba(0, 240, 230, 0.55)"
  ctx.fillStyle = "rgba(0, 240, 230, 0.55)"
  ctx.lineWidth = 1.6

  const spine = spinePoints(frame, 8, 0.32, 0)
  polyline(ctx, spine)

  ctx.save()
  ctx.lineWidth = 0.9
  ctx.strokeStyle = "rgba(0, 240, 230, 0.3)"
  const rail = spine.map((p) => add(p, perp, handLen * 0.16))
  polyline(ctx, rail)
  for (let k = 1; k < spine.length - 1; k++) {
    const mid = alongPath(spine, (k + 0.5) / (spine.length - 1))
    polyline(ctx, [add(mid, perp, -handLen * 0.07), add(mid, perp, handLen * 0.07)])
  }
  ctx.restore()

  for (let k = 1; k < spine.length; k++) {
    const node = spine[k]
    if (k % 2 === 0) {
      ctx.fillRect(node.x - 2.5, node.y - 2.5, 5, 5)
    } else {
      ctx.beginPath()
      ctx.arc(node.x, node.y, 3, 0, Math.PI * 2)
      ctx.stroke()
    }
    for (let b = 0; b < 2; b++) {
      if (hashN(k * 7 + b * 13 + 11) < 0.35) continue
      const branchDir = rotate(dir, (hashN(k * 5 + b * 17 + 23) - 0.5) * 1.9)
      const end = add(node, branchDir, handLen * (0.3 + 0.4 * hashN(k * 3 + b + 31)))
      polyline(ctx, [node, end])
      ctx.beginPath()
      ctx.arc(end.x, end.y, 2.2, 0, Math.PI * 2)
      ctx.stroke()
      if (hashN(k * 11 + b + 41) > 0.55) {
        const subDir = rotate(branchDir, hashN(k + b + 51) > 0.5 ? 0.8 : -0.8)
        const subEnd = add(end, subDir, handLen * 0.22)
        polyline(ctx, [end, subEnd])
        ctx.fillRect(subEnd.x - 1.5, subEnd.y - 1.5, 3, 3)
      }
    }
  }

  const cpu = alongPath(spine, 0.45)
  ctx.beginPath()
  ctx.arc(cpu.x, cpu.y, handLen * 0.32, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cpu.x, cpu.y, handLen * 0.18, 0, Math.PI * 2)
  ctx.stroke()
  polyline(ctx, [add(cpu, perp, -handLen * 0.32), add(cpu, perp, handLen * 0.32)])
  polyline(ctx, [add(cpu, dir, -handLen * 0.32), add(cpu, dir, handLen * 0.32)])
  for (let o = 0; o < 4; o++) {
    const orbit = dirAngle + now * 0.9 + (o * Math.PI) / 2
    ctx.beginPath()
    ctx.arc(cpu.x + Math.cos(orbit) * handLen * 0.25, cpu.y + Math.sin(orbit) * handLen * 0.25, 1.6, 0, Math.PI * 2)
    ctx.fill()
  }

  const lowRing = alongPath(spine, 0.82)
  ctx.beginPath()
  ctx.arc(lowRing.x, lowRing.y, handLen * 0.14, 0, Math.PI * 2)
  ctx.stroke()
  polyline(ctx, [add(lowRing, perp, -handLen * 0.14), add(lowRing, perp, handLen * 0.14)])

  ctx.setLineDash([5, 7])
  ctx.lineDashOffset = -now * 26
  ctx.beginPath()
  ctx.arc(wrist.x, wrist.y, handLen * 0.5, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])

  const sweepPos = alongPath(spine, (now * 0.22) % 1)
  ctx.save()
  ctx.strokeStyle = "rgba(160, 255, 250, 0.3)"
  ctx.lineWidth = 3
  ctx.shadowBlur = 14
  polyline(ctx, [add(sweepPos, perp, -handLen * 0.45), add(sweepPos, perp, handLen * 0.45)])
  ctx.restore()

  ctx.save()
  ctx.translate(cpu.x + perp.x * handLen * 0.45, cpu.y + perp.y * handLen * 0.45)
  ctx.rotate(dirAngle)
  ctx.font = '8px "Cascadia Mono", Consolas, monospace'
  ctx.fillStyle = "rgba(0, 240, 230, 0.4)"
  ctx.fillText("1011 0x4F 0110", 0, 0)
  ctx.restore()

  const knucklePts = KNUCKLES.map((index) => points[index])
  polyline(ctx, knucklePts)
  for (const knuckle of knucklePts) {
    ctx.fillRect(knuckle.x - 1.8, knuckle.y - 1.8, 3.6, 3.6)
  }

  for (const chain of FINGER_CHAINS) {
    const chainPts = chain.map((index) => points[index])
    polyline(ctx, chainPts)
    const tip = chainPts[chainPts.length - 1]
    const blink = 0.45 + 0.55 * Math.abs(Math.sin(now * 2.2 + chain[0]))
    ctx.fillStyle = `rgba(0, 240, 230, ${blink.toFixed(3)})`
    ctx.fillRect(tip.x - 2, tip.y - 2, 4, 4)
    ctx.fillStyle = "rgba(0, 240, 230, 0.55)"
    ctx.beginPath()
    ctx.arc(chainPts[1].x, chainPts[1].y, 2.2, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(chainPts[2].x, chainPts[2].y, 1.4, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.shadowColor = "rgba(255, 60, 220, 0.9)"
  ctx.fillStyle = "rgba(255, 90, 230, 0.9)"
  for (let i = 0; i < 6; i++) {
    const t = (now * 0.3 + i * 0.17) % 1
    const pos = alongPath(spine, t)
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, 2.4, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function leaf(ctx: CanvasRenderingContext2D, base: Pt, angle: number, size: number): void {
  const tip = add(base, { x: Math.cos(angle), y: Math.sin(angle) }, size)
  const side = { x: -Math.sin(angle), y: Math.cos(angle) }
  const c1 = add(add(base, { x: Math.cos(angle), y: Math.sin(angle) }, size * 0.5), side, size * 0.38)
  const c2 = add(add(base, { x: Math.cos(angle), y: Math.sin(angle) }, size * 0.5), side, -size * 0.38)
  ctx.beginPath()
  ctx.moveTo(base.x, base.y)
  ctx.quadraticCurveTo(c1.x, c1.y, tip.x, tip.y)
  ctx.quadraticCurveTo(c2.x, c2.y, base.x, base.y)
  ctx.fill()
  ctx.stroke()
}

function curl(ctx: CanvasRenderingContext2D, base: Pt, startAngle: number, radius: number, spin: number): void {
  ctx.beginPath()
  for (let s = 0; s <= 14; s++) {
    const a = (s / 14) * 4.4
    const r = radius * (1 - s / 16)
    const angle = startAngle + a + spin
    const px = base.x + Math.cos(angle) * r
    const py = base.y + Math.sin(angle) * r
    if (s === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.stroke()
}

function blossom(ctx: CanvasRenderingContext2D, center: Pt, size: number, sway: number): void {
  ctx.save()
  ctx.fillStyle = "rgba(255, 235, 245, 0.55)"
  for (let petal = 0; petal < 5; petal++) {
    const angle = (petal / 5) * Math.PI * 2 + sway
    ctx.beginPath()
    ctx.arc(center.x + Math.cos(angle) * size, center.y + Math.sin(angle) * size, size * 0.75, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = "rgba(255, 215, 130, 0.85)"
  ctx.beginPath()
  ctx.arc(center.x, center.y, size * 0.55, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

export function drawNature(c2d: Canvas2d, points: Pt[], forearm: Forearm, now: number): void {
  const frame = armFrame(points, forearm)
  if (!frame) return
  const { wrist, handLen, armLen, dir, perp } = frame
  const ctx = c2d.ctx
  const dirAngle = Math.atan2(dir.y, dir.x)

  ctx.save()
  ctx.lineJoin = "round"
  ctx.shadowColor = "rgba(90, 230, 130, 0.7)"
  ctx.shadowBlur = 8
  ctx.strokeStyle = "rgba(150, 235, 150, 0.55)"
  ctx.fillStyle = "rgba(90, 210, 110, 0.3)"
  ctx.lineWidth = 1.6

  const spine: Pt[] = []
  for (let k = 0; k <= 5; k++) {
    const along = add(wrist, dir, (k / 5) * armLen * 0.95)
    spine.push(add(along, perp, Math.sin(now * 0.8 + k * 1.9) * handLen * 0.14))
  }
  smoothLine(ctx, spine)

  for (let side = -1; side <= 1; side += 2) {
    ctx.save()
    ctx.lineWidth = 1
    ctx.strokeStyle = "rgba(150, 235, 150, 0.35)"
    const vine: Pt[] = []
    for (let k = 0; k <= 4; k++) {
      const along = add(wrist, dir, (k / 4) * armLen * (side < 0 ? 0.8 : 0.62))
      vine.push(
        add(along, perp, side * handLen * 0.2 + Math.sin(now * 1.1 + k * 2.1 + side) * handLen * 0.1),
      )
    }
    smoothLine(ctx, vine)
    leaf(ctx, vine[2], dirAngle + side * 1.2, handLen * 0.14)
    leaf(ctx, vine[vine.length - 1], dirAngle + side * 0.6, handLen * 0.17)
    ctx.restore()
  }

  for (let k = 1; k < spine.length; k++) {
    const sway = Math.sin(now * 1.1 + k * 2.3) * 0.25
    const side = k % 2 === 0 ? 1 : -1
    leaf(ctx, spine[k], dirAngle + side * (1.0 + sway), handLen * (0.2 + 0.07 * hashN(k * 5.1)))
    const midPoint = alongPath(spine, (k - 0.5) / (spine.length - 1))
    leaf(ctx, midPoint, dirAngle - side * (0.85 + sway), handLen * 0.12)
    if (k % 2 === 1) {
      curl(ctx, spine[k], dirAngle, handLen * 0.17, now * 0.35 * (k % 3 === 0 ? -1 : 1))
    }
  }

  blossom(ctx, alongPath(spine, 0.3), handLen * 0.06, now * 0.5)
  blossom(ctx, alongPath(spine, 0.72), handLen * 0.05, -now * 0.4)

  const knucklePts = KNUCKLES.map((index) => points[index])
  ctx.save()
  ctx.lineWidth = 1.1
  smoothLine(ctx, [points[2], ...knucklePts])
  ctx.restore()
  for (const knuckle of knucklePts) {
    leaf(ctx, knuckle, dirAngle - Math.PI / 2 + Math.sin(now * 1.6) * 0.2, handLen * 0.09)
  }

  for (const chain of FINGER_CHAINS) {
    const chainPts = chain.map((index) => points[index])
    smoothLine(ctx, chainPts)
    const tip = chainPts[chainPts.length - 1]
    const prev = chainPts[chainPts.length - 2]
    const tipAngle = Math.atan2(tip.y - prev.y, tip.x - prev.x)
    leaf(ctx, tip, tipAngle + Math.sin(now * 1.4) * 0.3, handLen * 0.15)
    ctx.fillStyle = "rgba(220, 255, 220, 0.6)"
    ctx.beginPath()
    ctx.arc(chainPts[1].x, chainPts[1].y, 1.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "rgba(90, 210, 110, 0.3)"
  }

  ctx.fillStyle = "rgba(190, 255, 190, 0.45)"
  for (let i = 0; i < 26; i++) {
    const spot = add(
      add(wrist, dir, hashN(i * 1.7) * armLen * 0.95),
      perp,
      (hashN(i + 9.3) - 0.5) * handLen * 0.9,
    )
    ctx.beginPath()
    ctx.arc(spot.x, spot.y, 1 + hashN(i * 4.1), 0, Math.PI * 2)
    ctx.fill()
  }

  const galaxy = alongPath(spine, 0.52)
  ctx.shadowColor = "rgba(200, 170, 255, 0.9)"
  for (let i = 0; i < 60; i++) {
    const t = i / 60
    const armOffset = i % 2 === 0 ? 0 : Math.PI
    const angle = t * 4.4 + armOffset + now * 0.22
    const radius = handLen * 0.42 * Math.sqrt(t)
    const px = galaxy.x + Math.cos(angle) * radius
    const py = galaxy.y + Math.sin(angle) * radius * 0.55
    const twinkle = 0.6 + 0.4 * Math.sin(now * 2.1 + i * 1.7)
    ctx.fillStyle =
      i % 6 === 0
        ? `rgba(255, 255, 255, ${((0.95 - t * 0.6) * twinkle).toFixed(3)})`
        : `rgba(215, 195, 255, ${((0.8 - t * 0.55) * twinkle).toFixed(3)})`
    ctx.beginPath()
    ctx.arc(px, py, i % 6 === 0 ? 1.7 : 1.2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.shadowBlur = 14
  ctx.fillStyle = "rgba(255, 252, 255, 0.95)"
  ctx.beginPath()
  ctx.arc(galaxy.x, galaxy.y, 2.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 8

  ctx.shadowColor = "rgba(255, 215, 120, 0.9)"
  for (let i = 0; i < 12; i++) {
    const base = add(
      add(wrist, dir, (0.2 + 0.75 * hashN(i + 40.2)) * armLen),
      perp,
      (hashN(i + 50.7) - 0.5) * handLen * 1.6,
    )
    const wobX = Math.sin(now * (0.7 + hashN(i) * 0.8) + i * 2.1) * handLen * 0.14
    const wobY = Math.cos(now * (0.6 + hashN(i + 3) * 0.7) + i * 1.3) * handLen * 0.1
    const alpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(now * 2.3 + i * 2.4))
    ctx.fillStyle = `rgba(255, 225, 140, ${alpha.toFixed(3)})`
    ctx.beginPath()
    ctx.arc(base.x + wobX, base.y + wobY, 2, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.fillStyle = "rgba(235, 255, 225, 0.4)"
  for (let i = 0; i < 8; i++) {
    const frac = (now * (0.05 + 0.05 * hashN(i + 60)) + hashN(i * 2.9)) % 1
    const base = add(
      add(wrist, dir, hashN(i + 70.3) * armLen * 0.8),
      perp,
      (hashN(i + 80.1) - 0.5) * handLen * 1.8,
    )
    ctx.beginPath()
    ctx.arc(base.x + Math.sin(now + i) * 8, base.y - frac * handLen * 1.5, 1.1, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}
