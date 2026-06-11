import * as THREE from "three"
import { createVideoPipeline } from "../../core/post"
import { createCanvas2d } from "../../core/canvas2d"
import { fpsLine } from "../../core/hud"
import type { Scene, SceneContext } from "../../core/scene"
import type { HandReading } from "../../core/hands"
import fireFragment from "./fire.frag.glsl?raw"

const POSITION_SMOOTHING = 0.25
const POWER_SMOOTHING = 0.18
const BEND_SMOOTHING = 0.2
const VELOCITY_SMOOTHING = 0.3
const SPARKS_PER_HAND = 32

type FireSource = {
  x: number
  y: number
  vx: number
  power: number
  bend: number
  unseenFor: number
}

const createSource = (): FireSource => ({
  x: 0.5,
  y: 0.4,
  vx: 0,
  power: 0,
  bend: 0,
  unseenFor: 1e9,
})

const hashN = (n: number): number => {
  const s = Math.sin(n * 127.1) * 43758.5453
  return s - Math.floor(s)
}

const sourceDistance = (reading: HandReading, source: FireSource): number =>
  Math.hypot(reading.palm.x - source.x, reading.palm.y - source.y)

function assignReadings(
  readings: HandReading[],
  sources: readonly [FireSource, FireSource],
): [HandReading | undefined, HandReading | undefined] {
  if (readings.length >= 2) {
    const first = readings[0]
    const second = readings[1]
    const direct = sourceDistance(first, sources[0]) + sourceDistance(second, sources[1])
    const swapped = sourceDistance(first, sources[1]) + sourceDistance(second, sources[0])
    return direct <= swapped ? [first, second] : [second, first]
  }
  if (readings.length === 1) {
    const only = readings[0]
    const closerToSecond = sourceDistance(only, sources[1]) < sourceDistance(only, sources[0])
    const secondLive = sources[1].unseenFor < 0.6
    return closerToSecond && secondLive ? [undefined, only] : [only, undefined]
  }
  return [undefined, undefined]
}

export function createFireScene(context: SceneContext): Scene {
  const uHands = { value: [new THREE.Vector2(0.5, 0.4), new THREE.Vector2(0.5, 0.4)] }
  const uPowers = { value: [0, 0] }
  const uBends = { value: [0, 0] }
  const uTime = { value: 0 }

  const pipeline = createVideoPipeline({
    renderer: context.renderer,
    video: context.video,
    fragmentShader: fireFragment,
    uniforms: { uHands, uPowers, uBends, uTime },
    bloom: { strength: 0.5, radius: 0.6, threshold: 1.0 },
  })
  const c2d = createCanvas2d(context.overlay)
  const sources: [FireSource, FireSource] = [createSource(), createSource()]

  const driveSource = (source: FireSource, reading: HandReading | undefined, dt: number): void => {
    if (!reading) {
      source.unseenFor += dt
      source.power += (0 - source.power) * POWER_SMOOTHING
      source.bend += (0 - source.bend) * BEND_SMOOTHING
      return
    }
    source.unseenFor = 0
    const previousX = source.x
    source.x += (reading.palm.x - source.x) * POSITION_SMOOTHING
    source.y += (reading.palm.y - source.y) * POSITION_SMOOTHING
    source.vx += ((source.x - previousX) / dt - source.vx) * VELOCITY_SMOOTHING
    const bendTarget = Math.min(0.45, Math.max(-0.45, -source.vx * 0.22))
    source.bend += (bendTarget - source.bend) * BEND_SMOOTHING
    source.power += (reading.openness - source.power) * POWER_SMOOTHING
  }

  const drawSparks = (source: FireSource, sourceIndex: number, now: number): void => {
    if (source.power < 0.05) return
    const ctx = c2d.ctx
    const width = c2d.width()
    const height = c2d.height()
    const baseX = source.x * width
    const baseY = (1 - source.y) * height
    const rise = (0.12 + 0.3 * source.power) * height

    ctx.save()
    ctx.globalCompositeOperation = "lighter"
    ctx.shadowColor = "rgba(255, 140, 30, 0.9)"
    ctx.shadowBlur = 6
    ctx.lineCap = "round"
    for (let i = 0; i < SPARKS_PER_HAND; i++) {
      const seed = sourceIndex * 100 + i
      const speed = 0.35 + 0.55 * hashN(seed + 7.1)
      const frac = (now * speed + hashN(seed * 2.3)) % 1
      const spread = (hashN(seed * 3.7) - 0.5) * (0.04 + 0.08 * frac) * width * source.power
      const px = baseX + spread + Math.sin(now * 2.5 + i * 1.7) * 9 * frac
      const py = baseY - frac * rise
      const alpha = (1 - frac) * source.power * (0.4 + 0.6 * hashN(seed + 13.9))
      ctx.strokeStyle =
        i % 3 === 0 ? `rgba(255, 230, 140, ${alpha.toFixed(3)})` : `rgba(255, 140, 40, ${alpha.toFixed(3)})`
      ctx.lineWidth = 1 + 1.6 * hashN(seed + 21.4)
      ctx.beginPath()
      ctx.moveTo(px, py + 4 + 9 * frac)
      ctx.lineTo(px, py)
      ctx.stroke()
    }
    ctx.restore()
  }

  return {
    frame: (readings, dt, nowSeconds, fps) => {
      const assigned = assignReadings(readings, sources)
      driveSource(sources[0], assigned[0], dt)
      driveSource(sources[1], assigned[1], dt)

      for (let index = 0; index < 2; index++) {
        const source = sources[index]
        uHands.value[index].set(source.x, source.y)
        uPowers.value[index] = source.power
        uBends.value[index] = source.bend
      }
      uTime.value = nowSeconds

      pipeline.render()
      c2d.clear()
      drawSparks(sources[0], 0, nowSeconds)
      drawSparks(sources[1], 1, nowSeconds)

      const totalPower = sources[0].power + sources[1].power
      const lines = [fpsLine(fps), `POWER ${totalPower.toFixed(2)}`]
      if (readings.length === 0) lines.push(`<span class="hint">SHOW HAND TO CAMERA</span>`)
      lines.push(`<span class="dim">OPEN HAND BURN / FIST SNUFF / ESC HUB</span>`)
      context.hud.set(lines)
    },
    resize: () => {
      pipeline.resize()
      c2d.resize()
    },
    dispose: () => {
      pipeline.dispose()
      c2d.clear()
    },
  }
}
