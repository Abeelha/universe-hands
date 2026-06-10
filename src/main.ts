import { startCamera } from "./camera"
import { createBlackholeView, type HoleState } from "./blackhole"
import { createHandTracker, type HandReading } from "./hands"
import { createHud } from "./hud"

const SMOOTHING = 0.15
const VELOCITY_SMOOTHING = 0.3
const DRIFT_DAMPING = 2.5
const FREE_MASS_DECAY = 2.5
const SCHWARZSCHILD_SCALE = 0.09
const FIST_MIN_MASS = 0.12
const BURST_COOLDOWN_SECONDS = 1

type HoleSlot = HoleState & {
  vx: number
  vy: number
  bound: boolean
  armed: boolean
  lastBurstAt: number
}

const createSlot = (): HoleSlot => ({
  x: 0.5,
  y: 0.5,
  mass: 0,
  tilt: 0,
  vx: 0,
  vy: 0,
  bound: false,
  armed: true,
  lastBurstAt: -1e9,
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
  const burst = { x: 0.5, y: 0.5, firedAt: -1e9, strength: 0 }
  let contactArmed = true
  let fps = 60
  let previous = performance.now()

  const fireBurst = (x: number, y: number, strength: number, nowSeconds: number): void => {
    burst.x = x
    burst.y = y
    burst.strength = Math.min(strength, 1.3)
    burst.firedAt = nowSeconds
  }

  const driveSlot = (
    slot: HoleSlot,
    reading: HandReading | undefined,
    dt: number,
    nowSeconds: number,
  ): void => {
    if (!reading) {
      slot.bound = false
      slot.x = clamp(slot.x + slot.vx * dt, -0.2, 1.2)
      slot.y = clamp(slot.y + slot.vy * dt, -0.2, 1.2)
      const damping = Math.exp(-DRIFT_DAMPING * dt)
      slot.vx *= damping
      slot.vy *= damping
      slot.mass *= Math.exp(-FREE_MASS_DECAY * dt)
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
    if (reading.fist && slot.armed && slot.mass > FIST_MIN_MASS) {
      fireBurst(slot.x, slot.y, Math.max(slot.mass, 0.5), nowSeconds)
      slot.armed = false
      slot.lastBurstAt = nowSeconds
      slot.mass = 0
    } else {
      const targetMass = reading.fist ? 0 : reading.mass
      slot.mass += (targetMass - slot.mass) * SMOOTHING
    }
    if (!reading.fist && nowSeconds - slot.lastBurstAt > BURST_COOLDOWN_SECONDS) {
      slot.armed = true
    }
  }

  const checkBinaryContact = (nowSeconds: number): void => {
    const [a, b] = slots
    if (a.mass < 0.15 || b.mass < 0.15) return
    const aspect = window.innerWidth / window.innerHeight
    const distance = Math.hypot((a.x - b.x) * aspect, a.y - b.y)
    const contactRadius = (a.mass + b.mass) * SCHWARZSCHILD_SCALE
    if (contactArmed && distance < contactRadius * 0.9) {
      fireBurst((a.x + b.x) / 2, (a.y + b.y) / 2, a.mass + b.mass, nowSeconds)
      contactArmed = false
    } else if (distance > contactRadius * 1.6) {
      contactArmed = true
    }
  }

  const frame = (now: number): void => {
    const dt = Math.min(Math.max((now - previous) / 1000, 1e-4), 0.1)
    previous = now
    fps += (1 / dt - fps) * 0.05
    const nowSeconds = now / 1000

    const readings = readHands(now)
    const assigned = assignReadings(readings, slots)
    driveSlot(slots[0], assigned[0], dt, nowSeconds)
    driveSlot(slots[1], assigned[1], dt, nowSeconds)
    checkBinaryContact(nowSeconds)

    view.update(
      slots,
      { x: burst.x, y: burst.y, age: nowSeconds - burst.firedAt, strength: burst.strength },
      nowSeconds,
    )
    view.render()
    hud.update(fps, slots[0].mass + slots[1].mass, readings.length)
    requestAnimationFrame(frame)
  }

  window.addEventListener("resize", view.resize)
  requestAnimationFrame(frame)
}

boot().catch((error: unknown) => {
  const hudRoot = document.querySelector<HTMLDivElement>("#hud")
  if (hudRoot) hudRoot.textContent = error instanceof Error ? error.message.toUpperCase() : String(error)
})
