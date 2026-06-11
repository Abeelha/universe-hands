import { createVideoPipeline } from "../../core/post"
import { createCanvas2d } from "../../core/canvas2d"
import { fpsLine } from "../../core/hud"
import { createArmTracker, type ArmTracker, type ArmReading } from "../../core/pose"
import type { Scene, SceneContext } from "../../core/scene"
import type { HandReading } from "../../core/hands"
import { drawTech, drawNature, type Forearm } from "./painters"
import { createStabilizer, type StabilizeTarget } from "./stabilize"
import gradeFragment from "./grade.frag.glsl?raw"

const ARM_MATCH_RADIUS = 0.28

export function createTattooScene(context: SceneContext): Scene {
  const pipeline = createVideoPipeline({
    renderer: context.renderer,
    video: context.video,
    fragmentShader: gradeFragment,
    uniforms: {},
  })
  const c2d = createCanvas2d(context.overlay)
  const stabilizer = createStabilizer()
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
      const tech = stabilizer.update("tech", targetFor(readings.find(isTech)), dt)
      const nature = stabilizer.update(
        "nature",
        targetFor(readings.find((reading) => !isTech(reading))),
        dt,
      )
      if (tech) {
        c2d.ctx.globalAlpha = tech.fade
        drawTech(c2d, tech.points, tech.forearm, nowSeconds)
      }
      if (nature) {
        c2d.ctx.globalAlpha = nature.fade
        drawNature(c2d, nature.points, nature.forearm, nowSeconds)
      }
      c2d.ctx.globalAlpha = 1

      const techSide = swapped ? "RIGHT" : "LEFT"
      const natureSide = swapped ? "LEFT" : "RIGHT"
      const lines = [fpsLine(fps), `TECH ${techSide} / NATURE ${natureSide}`]
      if (!armTracker) lines.push(`<span class="dim">LOADING ARM TRACKER...</span>`)
      if (readings.length === 0) lines.push(`<span class="hint">SHOW HANDS TO CAMERA</span>`)
      lines.push(`<span class="dim">T SWAP ARMS / ESC HUB</span>`)
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
