import * as THREE from "three"
import { createVideoPipeline } from "../../core/post"
import { fpsLine } from "../../core/hud"
import type { Scene, SceneContext } from "../../core/scene"
import type { HandPose, HandReading, KnobFinger } from "../../core/hands"
import { createOverlay, type ControlViz } from "./overlay"
import lensingFragment from "./lensing.frag.glsl?raw"

const SMOOTHING = 0.15
const KNOB_SMOOTHING = 0.2
const JET_SMOOTHING = 0.12
const JET_DIR_SMOOTHING = 0.25
const VELOCITY_SMOOTHING = 0.3
const DRIFT_DAMPING = 2.5
const FREE_MASS_DECAY = 2.5
const COLLAPSE_RATE = 6
const POSE_STABLE_SECONDS = 0.08
const TIME_SCALE_SMOOTHING = 0.08
const RESET_HOLD_SECONDS = 0.5
const TRACKER_STALE_SECONDS = 0.6

const KNOB_TIPS: Record<KnobFinger, number> = { index: 8, middle: 12, ring: 16, pinky: 20 }

type Tracked = {
  palmX: number
  palmY: number
  unseenFor: number
  pose: HandPose
  poseCandidate: HandPose
  poseTimer: number
  resetHold: number
}

const createTracked = (): Tracked => ({
  palmX: 0.5,
  palmY: 0.5,
  unseenFor: 1e9,
  pose: "neutral",
  poseCandidate: "neutral",
  poseTimer: 0,
  resetHold: 0,
})

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const angleLerp = (current: number, target: number, factor: number): number =>
  current + Math.atan2(Math.sin(target - current), Math.cos(target - current)) * factor

const trackerDistance = (reading: HandReading, tracker: Tracked): number =>
  Math.hypot(reading.palm.x - tracker.palmX, reading.palm.y - tracker.palmY)

function assignReadings(
  readings: HandReading[],
  trackers: readonly [Tracked, Tracked],
): [HandReading | undefined, HandReading | undefined] {
  if (readings.length >= 2) {
    const first = readings[0]
    const second = readings[1]
    const direct = trackerDistance(first, trackers[0]) + trackerDistance(second, trackers[1])
    const swapped = trackerDistance(first, trackers[1]) + trackerDistance(second, trackers[0])
    return direct <= swapped ? [first, second] : [second, first]
  }
  if (readings.length === 1) {
    const only = readings[0]
    const holeFresh = trackers[0].unseenFor < TRACKER_STALE_SECONDS
    const controlFresh = trackers[1].unseenFor < TRACKER_STALE_SECONDS
    const controlCloser = trackerDistance(only, trackers[1]) < trackerDistance(only, trackers[0])
    if (controlFresh && (!holeFresh || controlCloser)) return [undefined, only]
    return [only, undefined]
  }
  return [undefined, undefined]
}

function touchTracker(tracker: Tracked, reading: HandReading | undefined, dt: number): void {
  if (!reading) {
    tracker.unseenFor += dt
    tracker.poseTimer = 0
    tracker.resetHold = 0
    return
  }
  tracker.unseenFor = 0
  tracker.palmX = reading.palm.x
  tracker.palmY = reading.palm.y
  if (reading.pose === tracker.pose) {
    tracker.poseTimer = 0
  } else if (reading.pose !== tracker.poseCandidate) {
    tracker.poseCandidate = reading.pose
    tracker.poseTimer = 0
  } else {
    tracker.poseTimer += dt
    if (tracker.poseTimer > POSE_STABLE_SECONDS) {
      tracker.pose = reading.pose
      tracker.poseTimer = 0
    }
  }
}

export function createBlackholeScene(context: SceneContext): Scene {
  const uHole = { value: new THREE.Vector2(0.5, 0.5) }
  const uMass = { value: 0 }
  const uTilt = { value: 0 }
  const uDiskGain = { value: 0.5 }
  const uLensPower = { value: 0.35 }
  const uSpectral = { value: 0 }
  const uJet = { value: 0 }
  const uJetDir = { value: new THREE.Vector2(0, 1) }
  const uTime = { value: 0 }

  const pipeline = createVideoPipeline({
    renderer: context.renderer,
    video: context.video,
    fragmentShader: lensingFragment,
    uniforms: { uHole, uMass, uTilt, uDiskGain, uLensPower, uSpectral, uJet, uJetDir, uTime },
    bloom: { strength: 0.45, radius: 0.55, threshold: 1.0 },
  })
  const overlay = createOverlay(context.overlay)

  const hole = {
    x: 0.5,
    y: 0.5,
    mass: 0,
    tilt: 0,
    diskGain: 0.5,
    lensPower: 0.35,
    spectral: 0,
    jet: 0,
    jetX: 0,
    jetY: 1,
    vx: 0,
    vy: 0,
  }
  const trackers: [Tracked, Tracked] = [createTracked(), createTracked()]
  let timeDial = 0
  let timeScale = 1
  let warpedTime = 0

  const channelValue = (finger: KnobFinger): number => {
    if (finger === "index") return hole.diskGain
    if (finger === "middle") return hole.lensPower
    if (finger === "ring") return hole.spectral
    return timeDial
  }

  const applyKnob = (finger: KnobFinger, tightness: number): string => {
    if (finger === "index") {
      hole.diskGain += (tightness - hole.diskGain) * KNOB_SMOOTHING
      return `DISK ${hole.diskGain.toFixed(2)}`
    }
    if (finger === "middle") {
      hole.lensPower += (tightness - hole.lensPower) * KNOB_SMOOTHING
      return `LENS ${hole.lensPower.toFixed(2)}`
    }
    if (finger === "ring") {
      hole.spectral += (tightness - hole.spectral) * KNOB_SMOOTHING
      return `HUE ${hole.spectral.toFixed(2)}`
    }
    timeDial += (tightness - timeDial) * KNOB_SMOOTHING
    return `TIME ${(1 - timeDial * 0.95).toFixed(2)}X`
  }

  const driveHole = (reading: HandReading | undefined, dt: number, massLocked: boolean): void => {
    if (!reading) {
      hole.x = clamp(hole.x + hole.vx * dt, -0.2, 1.2)
      hole.y = clamp(hole.y + hole.vy * dt, -0.2, 1.2)
      const damping = Math.exp(-DRIFT_DAMPING * dt)
      hole.vx *= damping
      hole.vy *= damping
      hole.mass *= Math.exp(-FREE_MASS_DECAY * dt)
      return
    }
    const previousX = hole.x
    const previousY = hole.y
    hole.x += (reading.palm.x - hole.x) * SMOOTHING
    hole.y += (reading.palm.y - hole.y) * SMOOTHING
    hole.vx += ((hole.x - previousX) / dt - hole.vx) * VELOCITY_SMOOTHING
    hole.vy += ((hole.y - previousY) / dt - hole.vy) * VELOCITY_SMOOTHING
    hole.tilt = angleLerp(hole.tilt, reading.tilt, SMOOTHING)
    if (!massLocked) hole.mass += (reading.pinchMass - hole.mass) * SMOOTHING
  }

  const driveControl = (
    tracker: Tracked,
    reading: HandReading | undefined,
    dt: number,
  ): { status: string; viz: ControlViz | null } => {
    if (!reading) {
      hole.jet += (0 - hole.jet) * JET_SMOOTHING
      return { status: "", viz: null }
    }
    let jetTarget = 0
    let status = ""
    let mode: ControlViz["mode"] = "idle"
    let knobTip = 8
    let value = 0

    if (reading.knob && tracker.pose === "neutral") {
      status = applyKnob(reading.knob.finger, reading.knob.tightness)
      mode = "knob"
      knobTip = KNOB_TIPS[reading.knob.finger]
      value = channelValue(reading.knob.finger)
      tracker.resetHold = 0
    } else if (tracker.pose === "point") {
      jetTarget = 1
      hole.jetX += (reading.jetDir.x - hole.jetX) * JET_DIR_SMOOTHING
      hole.jetY += (reading.jetDir.y - hole.jetY) * JET_DIR_SMOOTHING
      status = "JET"
      mode = "jet"
      tracker.resetHold = 0
    } else if (tracker.pose === "fist") {
      hole.mass *= Math.exp(-COLLAPSE_RATE * dt)
      status = "COLLAPSE"
      mode = "fist"
      tracker.resetHold = 0
    } else if (tracker.pose === "peace") {
      tracker.resetHold += dt
      value = Math.min(tracker.resetHold / RESET_HOLD_SECONDS, 1)
      status = value >= 1 ? "RESET DONE" : "RESET"
      mode = "reset"
      if (tracker.resetHold >= RESET_HOLD_SECONDS) {
        hole.diskGain = 0.5
        hole.lensPower = 0.35
        hole.spectral = 0
        timeDial = 0
      }
    } else {
      tracker.resetHold = 0
    }

    hole.jet += (jetTarget - hole.jet) * JET_SMOOTHING
    return { status, viz: { points: reading.points, mode, knobTip, value, label: status } }
  }

  return {
    frame: (readings, dt, nowSeconds, fps) => {
      const assigned = assignReadings(readings, trackers)
      touchTracker(trackers[0], assigned[0], dt)
      touchTracker(trackers[1], assigned[1], dt)
      const collapsing = assigned[1] !== undefined && trackers[1].pose === "fist"
      driveHole(assigned[0], dt, collapsing)
      const control = driveControl(trackers[1], assigned[1], dt)

      timeScale += (1 - timeDial * 0.95 - timeScale) * TIME_SCALE_SMOOTHING
      warpedTime += dt * timeScale

      uHole.value.set(hole.x, hole.y)
      uMass.value = hole.mass
      uTilt.value = hole.tilt
      uDiskGain.value = hole.diskGain
      uLensPower.value = hole.lensPower
      uSpectral.value = hole.spectral
      uJet.value = hole.jet
      uJetDir.value.set(hole.jetX, hole.jetY)
      uTime.value = warpedTime

      pipeline.render()
      overlay.draw(control.viz, nowSeconds)

      const lines = [fpsLine(fps), `MASS ${hole.mass.toFixed(2)}`]
      if (control.status) lines.push(`<span class="active">${control.status}</span>`)
      if (readings.length === 0) {
        lines.push(`<span class="hint">SHOW HAND TO CAMERA</span>`)
      } else if (readings.length === 1) {
        lines.push(`<span class="dim">RAISE SECOND HAND = CONTROL DECK</span>`)
      } else {
        lines.push(
          `<span class="dim">IDX DISK / MID LENS / RING HUE / PNK TIME / POINT JET / FIST EAT / V RESET</span>`,
        )
      }
      lines.push(`<span class="dim">ESC = HUB</span>`)
      context.hud.set(lines)
    },
    resize: () => {
      pipeline.resize()
      overlay.resize()
    },
    dispose: () => {
      pipeline.dispose()
      overlay.draw(null, 0)
    },
  }
}
