import { createVideoPipeline } from "../../core/post"
import { createCanvas2d } from "../../core/canvas2d"
import { fpsLine } from "../../core/hud"
import type { Scene, SceneContext } from "../../core/scene"
import type { HandReading } from "../../core/hands"
import { drawTech, drawNature } from "./painters"
import gradeFragment from "./grade.frag.glsl?raw"

export function createTattooScene(context: SceneContext): Scene {
  const pipeline = createVideoPipeline({
    renderer: context.renderer,
    video: context.video,
    fragmentShader: gradeFragment,
    uniforms: {},
  })
  const c2d = createCanvas2d(context.overlay)
  let swapped = false

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "t" || event.key === "T") swapped = !swapped
  }
  window.addEventListener("keydown", onKey)

  const isTech = (reading: HandReading): boolean => {
    const side =
      reading.handedness === "unknown" ? (reading.palm.x < 0.5 ? "left" : "right") : reading.handedness
    return (side === "left") !== swapped
  }

  return {
    frame: (readings, _dt, nowSeconds, fps) => {
      pipeline.render()
      c2d.clear()
      const px = (p: { x: number; y: number }): { x: number; y: number } => ({
        x: p.x * c2d.width(),
        y: p.y * c2d.height(),
      })
      for (const reading of readings) {
        const points = reading.points.map(px)
        if (isTech(reading)) drawTech(c2d, points, nowSeconds)
        else drawNature(c2d, points, nowSeconds)
      }

      const techSide = swapped ? "RIGHT" : "LEFT"
      const natureSide = swapped ? "LEFT" : "RIGHT"
      const lines = [fpsLine(fps), `TECH ${techSide} / NATURE ${natureSide}`]
      if (readings.length === 0) lines.push(`<span class="hint">SHOW HANDS TO CAMERA</span>`)
      lines.push(`<span class="dim">T SWAP ARMS / ESC HUB</span>`)
      context.hud.set(lines)
    },
    resize: () => {
      pipeline.resize()
      c2d.resize()
    },
    dispose: () => {
      window.removeEventListener("keydown", onKey)
      pipeline.dispose()
      c2d.clear()
    },
  }
}
