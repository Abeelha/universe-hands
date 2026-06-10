import { startCamera } from "./camera"
import { createBlackholeView, type HoleState } from "./blackhole"
import { createHandTracker, type HandPose, type HandReading } from "./hands"
import { createHud } from "./hud"

const SMOOTHING = 0.15
const KNOB_SMOOTHING = 0.2
const JET_SMOOTHING = 0.12
const JET_DIR_SMOOTHING = 0.25
const VELOCITY_SMOOTHING = 0.3
const DRIFT_DAMPING = 2.5
const FREE_MASS_DECAY = 2.5
const COLLAPSE_RATE = 6
const POSE_STABLE_SECONDS = 0.08
const PEACE_TIME_SCALE = 0.12
const TIME_SCALE_SMOOTHING = 0.08

type HoleSlot = HoleState & {
  vx: number
  vy: number
  bound: boolean
  pose: HandPose
  poseCandidate: HandPose
  poseTimer: number
}

const createSlot = (): HoleSlot => ({
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
  bound: false,
  pose: "neutral",
  poseCandidate: "neutral",
  poseTimer: 0,
})

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const angleLerp = (current: number, target: number, factor: number): number =>
  current + Math.atan2(Math.sin(target - current), Math.cos(target - current)) * factor

const readingDistance = (reading: HandReading, slot: HoleSlot): number =>
  Math.hypot(reading.palm.x - slot.x, reading.palm.y - slot.y)

function assignReadings(
  readings: HandReading[],
  slots: readonly [HoleSlot, HoleSlot],
): [HandReading | undefined, HandReading | undefined] {
  if (readings.length >= 2) {
    const first = readings[0]
    const second = readings[1]
    const direct = readingDistance(first, slots[0]) + readingDistance(second, slots[1])
    const swapped = readingDistance(first, slots[1]) + readingDistance(second, slots[0])
    return direct <= swapped ? [first, second] : [second, first]
  }
  if (readings.length === 1) {
    const only = readings[0]
    const slot1Closer = readingDistance(only, slots[1]) < readingDistance(only, slots[0])
    const slot1Live = slots[1].bound || slots[1].mass > 0.02
    return slot1Closer && slot1Live ? [undefined, only] : [only, undefined]
  }
  return [undefined, undefined]
}

function stabilizePose(slot: HoleSlot, instant: HandPose, dt: number): HandPose {
  if (instant === slot.pose) {
    slot.poseTimer = 0
    return slot.pose
  }
  if (instant !== slot.poseCandidate) {
    slot.poseCandidate = instant
    slot.poseTimer = 0
    return slot.pose
  }
  slot.poseTimer += dt
  if (slot.poseTimer > POSE_STABLE_SECONDS) {
    slot.pose = instant
    slot.poseTimer = 0
  }
  return slot.pose
}

function driveSlot(slot: HoleSlot, reading: HandReading | undefined, dt: number): void {
  if (!reading) {
    slot.bound = false
    slot.pose = "neutral"
    slot.poseCandidate = "neutral"
    slot.x = clamp(slot.x + slot.vx * dt, -0.2, 1.2)
    slot.y = clamp(slot.y + slot.vy * dt, -0.2, 1.2)
    const damping = Math.exp(-DRIFT_DAMPING * dt)
    slot.vx *= damping
    slot.vy *= damping
    slot.mass *= Math.exp(-FREE_MASS_DECAY * dt)
    slot.jet += (0 - slot.jet) * JET_SMOOTHING
    return
  }
  slot.bound = true
  const previousX = slot.x
  const previousY = slot.y
  slot.x += (reading.palm.x - slot.x) * SMOOTHING
  slot.y += (reading.palm.y - slot.y) * SMOOTHING
  slot.vx += ((slot.x - previousX) / dt - slot.vx) * VELOCITY_SMOOTHING
  slot.vy += ((slot.y - previousY) / dt - slot.vy) * VELOCITY_SMOOTHING
  slot.tilt = angleLerp(slot.tilt, reading.tilt, SMOOTHING)

  const pose = stabilizePose(slot, reading.pose, dt)
  let jetTarget = 0

  if (reading.knob) {
    const tightness = reading.knob.tightness
    if (reading.knob.finger === "middle") {
      slot.diskGain += (tightness - slot.diskGain) * KNOB_SMOOTHING
    } else if (reading.knob.finger === "ring") {
      slot.lensPower += (tightness - slot.lensPower) * KNOB_SMOOTHING
    } else {
      slot.spectral += (tightness - slot.spectral) * KNOB_SMOOTHING
    }
  } else if (pose === "fist") {
    slot.mass *= Math.exp(-COLLAPSE_RATE * dt)
  } else if (pose === "point") {
    jetTarget = 1
    slot.jetX += (reading.jetDir.x - slot.jetX) * JET_DIR_SMOOTHING
    slot.jetY += (reading.jetDir.y - slot.jetY) * JET_DIR_SMOOTHING
  } else if (pose === "neutral") {
    slot.mass += (reading.pinchMass - slot.mass) * SMOOTHING
  }

  slot.jet += (jetTarget - slot.jet) * JET_SMOOTHING
}

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("#view")
  const hudRoot = document.querySelector<HTMLDivElement>("#hud")
  if (!canvas || !hudRoot) throw new Error("missing #view or #hud element")
  const hud = createHud(hudRoot)

  hud.message("REQUESTING CAMERA ACCESS...")
  const video = await startCamera()
  hud.message("LOADING HAND TRACKER...")
  const view = createBlackholeView(canvas, video)
  const readHands = await createHandTracker(video)

  const slots: [HoleSlot, HoleSlot] = [createSlot(), createSlot()]
  let timeScale = 1
  let warpedTime = 0
  let fps = 60
  let previous = performance.now()

  const statusFor = (slot: HoleSlot, reading: HandReading | undefined): string => {
    if (!reading) return ""
    if (reading.knob) {
      if (reading.knob.finger === "middle") return `DISK ${slot.diskGain.toFixed(2)}`
      if (reading.knob.finger === "ring") return `LENS ${slot.lensPower.toFixed(2)}`
      return `HUE ${slot.spectral.toFixed(2)}`
    }
    if (slot.pose === "point") return "JET"
    if (slot.pose === "peace") return `TIME ${timeScale.toFixed(2)}X`
    if (slot.pose === "fist") return "COLLAPSE"
    return ""
  }

  const frame = (now: number): void => {
    const dt = Math.min(Math.max((now - previous) / 1000, 1e-4), 0.1)
    previous = now
    fps += (1 / dt - fps) * 0.05

    const readings = readHands(now)
    const assigned = assignReadings(readings, slots)
    driveSlot(slots[0], assigned[0], dt)
    driveSlot(slots[1], assigned[1], dt)

    const anyPeace = slots.some((slot) => slot.bound && slot.pose === "peace")
    timeScale += ((anyPeace ? PEACE_TIME_SCALE : 1) - timeScale) * TIME_SCALE_SMOOTHING
    warpedTime += dt * timeScale

    view.update(slots, warpedTime)
    view.render()
    const status = statusFor(slots[0], assigned[0]) || statusFor(slots[1], assigned[1])
    hud.update(fps, slots[0].mass + slots[1].mass, readings.length, status)
    requestAnimationFrame(frame)
  }

  window.addEventListener("resize", view.resize)
  requestAnimationFrame(frame)
}

boot().catch((error: unknown) => {
  const hudRoot = document.querySelector<HTMLDivElement>("#hud")
  if (hudRoot) hudRoot.textContent = error instanceof Error ? error.message.toUpperCase() : String(error)
})
