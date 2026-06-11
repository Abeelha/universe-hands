import { createVideoPipeline } from "../../core/post"
import { createCanvas2d } from "../../core/canvas2d"
import { fpsLine } from "../../core/hud"
import { createArmTracker, type ArmTracker, type ArmReading } from "../../core/pose"
import type { Scene, SceneContext } from "../../core/scene"
import type { HandReading } from "../../core/hands"
import { drawTech, drawNature, type Forearm } from "./painters"
import { createStabilizer, type StabilizeTarget, type ArmKey } from "./stabilize"
import gradeFragment from "./grade.frag.glsl?raw"

const ARM_MATCH_RADIUS = 0.28
const SNAP_CONTACT_GAP = 0.3
const SNAP_RELEASE_GAP = 0.6
const SNAP_WINDOW = 0.3
const SNAP_COOLDOWN = 0.8
const SNAP_FX_SECONDS = 0.45

type SnapState = { contactAt: number; lastSnapAt: number }
type SnapFx = { x: number; y: number; at: number; key: ArmKey; on: boolean }

export function createTattooScene(context: SceneContext): Scene {
  const pipeline = createVideoPipeline({
    renderer: context.renderer,
    video: context.video,
    fragmentShader: gradeFragment,
    uniforms: {},
  })
  const c2d = createCanvas2d(context.overlay)
  const stabilizer = createStabilizer()
  const snapStates: Record<ArmKey, SnapState> = {
    tech: { contactAt: -1e9, lastSnapAt: -1e9 },
    nature: { contactAt: -1e9, lastSnapAt: -1e9 },
  }
  const inkOn: Record<ArmKey, boolean> = { tech: true, nature: true }
  let snapFx: SnapFx[] = []
  let swapped = false
  let armTracker: ArmTracker | null = null
  let disposed = false

  void createArmTracker(context.video).then((tracker) => {
    if (disposed) tracker.close()
    else armTracker = tracker
  })

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "t" || event.key === "T") swapped = !swapped
  }
  window.addEventListener("keydown", onKey)

  const isTech = (reading: HandReading): boolean => {
    const side =
      reading.handedness === "unknown" ? (reading.palm.x < 0.5 ? "left" : "right") : reading.handedness
    return (side === "left") !== swapped
  }

  const forearmFor = (reading: HandReading, arms: ArmReading[]): Forearm => {
    const wrist = reading.points[0]
    let best: ArmReading | null = null
    let bestDistance = ARM_MATCH_RADIUS
    for (const arm of arms) {
      const dist = Math.hypot(arm.wrist.x - wrist.x, arm.wrist.y - wrist.y)
      if (dist < bestDistance) {
        bestDistance = dist
        best = arm
      }
    }
    if (!best) return null
    const dx = (best.elbow.x - wrist.x) * c2d.width()
    const dy = (best.elbow.y - wrist.y) * c2d.height()
    const length = Math.hypot(dx, dy)
    if (length < 20) return null
    return { dir: { x: dx / length, y: dy / length }, length }
  }

  const detectSnap = (key: ArmKey, reading: HandReading | undefined, now: number): void => {
    if (!reading) return
    const points = reading.points
    const scale = Math.max(Math.hypot(points[0].x - points[9].x, points[0].y - points[9].y), 1e-5)
    const gap = Math.hypot(points[4].x - points[12].x, points[4].y - points[12].y) / scale
    const state = snapStates[key]
    if (gap < SNAP_CONTACT_GAP) state.contactAt = now
    const middleFolded =
      Math.hypot(points[12].x - points[0].x, points[12].y - points[0].y) <
      Math.hypot(points[10].x - points[0].x, points[10].y - points[0].y) * 1.05
    if (
      gap > SNAP_RELEASE_GAP &&
      middleFolded &&
      now - state.contactAt < SNAP_WINDOW &&
      now - state.lastSnapAt > SNAP_COOLDOWN
    ) {
      state.lastSnapAt = now
      inkOn[key] = !inkOn[key]
      snapFx.push({ x: reading.palm.x, y: reading.palm.y, at: now, key, on: inkOn[key] })
    }
  }

  const drawSnapFx = (now: number): void => {
    snapFx = snapFx.filter((fx) => now - fx.at < SNAP_FX_SECONDS)
    if (snapFx.length === 0) return
    const ctx = c2d.ctx
    ctx.save()
    for (const fx of snapFx) {
      const t = (now - fx.at) / SNAP_FX_SECONDS
      const radius = 20 + t * 150
      const alpha = (1 - t) * 0.85
      ctx.strokeStyle =
        fx.key === "tech"
          ? `rgba(90, 240, 255, ${alpha.toFixed(3)})`
          : `rgba(160, 255, 170, ${alpha.toFixed(3)})`
      ctx.lineWidth = fx.on ? 4.5 : 2.5
      ctx.setLineDash(fx.on ? [] : [9, 9])
      ctx.beginPath()
      ctx.arc(fx.x * c2d.width(), fx.y * c2d.height(), radius, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.restore()
  }

  return {
    frame: (readings, dt, nowSeconds, fps) => {
      pipeline.render()
      c2d.clear()
      const arms = armTracker ? armTracker.read(nowSeconds * 1000) : []
      const px = (p: { x: number; y: number }): { x: number; y: number } => ({
        x: p.x * c2d.width(),
        y: p.y * c2d.height(),
      })
      const targetFor = (reading: HandReading | undefined): StabilizeTarget | null =>
        reading ? { points: reading.points.map(px), forearm: forearmFor(reading, arms) } : null
      const techReading = readings.find(isTech)
      const natureReading = readings.find((reading) => !isTech(reading))
      detectSnap("tech", techReading, nowSeconds)
      detectSnap("nature", natureReading, nowSeconds)
      const tech = stabilizer.update("tech", targetFor(techReading), dt)
      const nature = stabilizer.update("nature", targetFor(natureReading), dt)
      if (tech && inkOn.tech) {
        c2d.ctx.globalAlpha = tech.fade
        drawTech(c2d, tech.points, tech.forearm, nowSeconds)
      }
      if (nature && inkOn.nature) {
        c2d.ctx.globalAlpha = nature.fade
        drawNature(c2d, nature.points, nature.forearm, nowSeconds)
      }
      c2d.ctx.globalAlpha = 1
      drawSnapFx(nowSeconds)

      const techSide = swapped ? "RIGHT" : "LEFT"
      const natureSide = swapped ? "LEFT" : "RIGHT"
      const lines = [
        fpsLine(fps),
        `TECH ${techSide} ${inkOn.tech ? "ON" : "OFF"} / NATURE ${natureSide} ${inkOn.nature ? "ON" : "OFF"}`,
      ]
      if (!armTracker) lines.push(`<span class="dim">LOADING ARM TRACKER...</span>`)
      if (readings.length === 0) lines.push(`<span class="hint">SHOW HANDS TO CAMERA</span>`)
      lines.push(`<span class="dim">SNAP TOGGLE INK / T SWAP ARMS / ESC HUB</span>`)
      context.hud.set(lines)
    },
    resize: () => {
      pipeline.resize()
      c2d.resize()
    },
    dispose: () => {
      disposed = true
      window.removeEventListener("keydown", onKey)
      armTracker?.close()
      armTracker = null
      pipeline.dispose()
      c2d.clear()
    },
  }
}
