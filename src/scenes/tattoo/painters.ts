import type { Canvas2d } from "../../core/canvas2d"

type Pt = { x: number; y: number }

const FINGER_CHAINS = [
  [1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
]

const hashN = (n: number): number => {
  const s = Math.sin(n * 127.1) * 43758.5453
  return s - Math.floor(s)
}

const rotate = (v: Pt, angle: number): Pt => ({
  x: v.x * Math.cos(angle) - v.y * Math.sin(angle),
  y: v.x * Math.sin(angle) + v.y * Math.cos(angle),
})

const add = (a: Pt, b: Pt, scale: number): Pt => ({ x: a.x + b.x * scale, y: a.y + b.y * scale })

type Frame = { wrist: Pt; handLen: number; dir: Pt; perp: Pt }

function armFrame(points: Pt[]): Frame | null {
  const wrist = points[0]
  const mcp = points[9]
  const handLen = Math.hypot(wrist.x - mcp.x, wrist.y - mcp.y)
  if (handLen < 12) return null
  const dir = { x: (wrist.x - mcp.x) / handLen, y: (wrist.y - mcp.y) / handLen }
  return { wrist, handLen, dir, perp: { x: -dir.y, y: dir.x } }
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

export function drawTech(c2d: Canvas2d, points: Pt[], now: number): void {
  const frame = armFrame(points)
  if (!frame) return
  const { wrist, handLen, dir, perp } = frame
  const ctx = c2d.ctx

  ctx.save()
  ctx.lineJoin = "miter"
  ctx.shadowColor = "rgba(0, 230, 255, 0.75)"
  ctx.shadowBlur = 8
  ctx.strokeStyle = "rgba(0, 240, 230, 0.55)"
  ctx.fillStyle = "rgba(0, 240, 230, 0.55)"
  ctx.lineWidth = 1.6

  const nodes: Pt[] = [wrist]
  for (let k = 1; k <= 6; k++) {
    const along = add(wrist, dir, k * handLen * 0.5)
    nodes.push(add(along, perp, (hashN(k * 3.7) - 0.5) * handLen * 0.55))
  }
  polyline(ctx, nodes)

  for (let k = 1; k < nodes.length; k++) {
    const node = nodes[k]
    if (k % 2 === 0) {
      ctx.fillRect(node.x - 2.5, node.y - 2.5, 5, 5)
    } else {
      ctx.beginPath()
      ctx.arc(node.x, node.y, 3, 0, Math.PI * 2)
      ctx.stroke()
    }
    if (hashN(k + 11) > 0.4) {
      const branchDir = rotate(dir, (hashN(k + 23) - 0.5) * 1.7)
      const end = add(node, branchDir, handLen * (0.35 + 0.45 * hashN(k + 31)))
      polyline(ctx, [node, end])
      ctx.beginPath()
      ctx.arc(end.x, end.y, 2.4, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  const cpu = nodes[3]
  ctx.beginPath()
  ctx.arc(cpu.x, cpu.y, handLen * 0.3, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cpu.x, cpu.y, handLen * 0.17, 0, Math.PI * 2)
  ctx.stroke()
  polyline(ctx, [add(cpu, perp, -handLen * 0.3), add(cpu, perp, handLen * 0.3)])
  polyline(ctx, [add(cpu, dir, -handLen * 0.3), add(cpu, dir, handLen * 0.3)])

  ctx.setLineDash([5, 7])
  ctx.lineDashOffset = -now * 26
  ctx.beginPath()
  ctx.arc(wrist.x, wrist.y, handLen * 0.5, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])

  for (const chain of FINGER_CHAINS) {
    const chainPts = chain.map((index) => points[index])
    polyline(ctx, chainPts)
    const tip = chainPts[chainPts.length - 1]
    ctx.fillRect(tip.x - 2, tip.y - 2, 4, 4)
    const mid = chainPts[1]
    ctx.beginPath()
    ctx.arc(mid.x, mid.y, 2.2, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.shadowColor = "rgba(255, 60, 220, 0.9)"
  for (let i = 0; i < 4; i++) {
    const t = (now * 0.35 + i * 0.29) % 1
    const seg = t * (nodes.length - 1)
    const a = Math.min(Math.floor(seg), nodes.length - 2)
    const f = seg - a
    const px = nodes[a].x + (nodes[a + 1].x - nodes[a].x) * f
    const py = nodes[a].y + (nodes[a + 1].y - nodes[a].y) * f
    ctx.fillStyle = "rgba(255, 90, 230, 0.9)"
    ctx.beginPath()
    ctx.arc(px, py, 2.4, 0, Math.PI * 2)
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

export function drawNature(c2d: Canvas2d, points: Pt[], now: number): void {
  const frame = armFrame(points)
  if (!frame) return
  const { wrist, handLen, dir, perp } = frame
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
  for (let k = 0; k <= 4; k++) {
    const along = add(wrist, dir, k * handLen * 0.55)
    spine.push(add(along, perp, Math.sin(now * 0.8 + k * 1.9) * handLen * 0.15))
  }
  smoothLine(ctx, spine)

  for (let k = 1; k < spine.length; k++) {
    const sway = Math.sin(now * 1.1 + k * 2.3) * 0.25
    const side = k % 2 === 0 ? 1 : -1
    leaf(ctx, spine[k], dirAngle + side * (1.0 + sway), handLen * (0.22 + 0.05 * hashN(k * 5.1)))
    if (k % 2 === 1) {
      const curlBase = spine[k]
      ctx.beginPath()
      for (let s = 0; s <= 14; s++) {
        const a = (s / 14) * 4.4
        const radius = handLen * 0.17 * (1 - s / 16)
        const angle = dirAngle + a + now * 0.35 * (k % 3 === 0 ? -1 : 1)
        const px = curlBase.x + Math.cos(angle) * radius
        const py = curlBase.y + Math.sin(angle) * radius
        if (s === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()
    }
  }

  for (const chain of FINGER_CHAINS) {
    const chainPts = chain.map((index) => points[index])
    smoothLine(ctx, chainPts)
    const tip = chainPts[chainPts.length - 1]
    const prev = chainPts[chainPts.length - 2]
    const tipAngle = Math.atan2(tip.y - prev.y, tip.x - prev.x)
    leaf(ctx, tip, tipAngle + Math.sin(now * 1.4) * 0.3, handLen * 0.16)
  }

  ctx.fillStyle = "rgba(190, 255, 190, 0.45)"
  for (let i = 0; i < 14; i++) {
    const spot = add(add(wrist, dir, hashN(i * 1.7) * handLen * 2.4), perp, (hashN(i + 9.3) - 0.5) * handLen * 0.95)
    ctx.beginPath()
    ctx.arc(spot.x, spot.y, 1.3, 0, Math.PI * 2)
    ctx.fill()
  }

  const galaxy = spine[2]
  ctx.shadowColor = "rgba(200, 170, 255, 0.9)"
  for (let i = 0; i < 36; i++) {
    const t = i / 36
    const angle = i * 0.55 + now * 0.25
    const radius = handLen * 0.3 * Math.sqrt(t)
    const px = galaxy.x + Math.cos(angle) * radius
    const py = galaxy.y + Math.sin(angle) * radius * 0.6
    ctx.fillStyle = i % 5 === 0 ? `rgba(255, 255, 255, ${0.9 - t * 0.6})` : `rgba(215, 195, 255, ${0.75 - t * 0.55})`
    ctx.beginPath()
    ctx.arc(px, py, 1.4, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.shadowColor = "rgba(255, 215, 120, 0.9)"
  for (let i = 0; i < 8; i++) {
    const base = add(
      add(wrist, dir, (0.4 + 1.6 * hashN(i + 40.2)) * handLen),
      perp,
      (hashN(i + 50.7) - 0.5) * handLen * 1.5,
    )
    const wobX = Math.sin(now * (0.7 + hashN(i) * 0.8) + i * 2.1) * handLen * 0.14
    const wobY = Math.cos(now * (0.6 + hashN(i + 3) * 0.7) + i * 1.3) * handLen * 0.1
    const alpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(now * 2.3 + i * 2.4))
    ctx.fillStyle = `rgba(255, 225, 140, ${alpha.toFixed(3)})`
    ctx.beginPath()
    ctx.arc(base.x + wobX, base.y + wobY, 2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}
