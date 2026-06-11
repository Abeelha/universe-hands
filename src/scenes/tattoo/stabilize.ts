import type { Forearm } from "./painters"

type Pt = { x: number; y: number }

const HOLD_SECONDS = 0.35
const FOREARM_HOLD_SECONDS = 0.6
const POINT_RATE = 22
const FOREARM_RATE = 9

export type ArmKey = "tech" | "nature"

export type StableHand = {
  points: Pt[]
  forearm: Forearm
  fade: number
}

export type StabilizeTarget = {
  points: Pt[]
  forearm: Forearm
}

export type Stabilizer = {
  update: (key: ArmKey, target: StabilizeTarget | null, dt: number) => StableHand | null
}

type Slot = {
  points: Pt[] | null
  dir: Pt
  length: number
  hasForearm: boolean
  forearmUnseenFor: number
  unseenFor: number
}

const createSlot = (): Slot => ({
  points: null,
  dir: { x: 0, y: 1 },
  length: 0,
  hasForearm: false,
  forearmUnseenFor: 1e9,
  unseenFor: 1e9,
})

export function createStabilizer(): Stabilizer {
  const slots: Record<ArmKey, Slot> = { tech: createSlot(), nature: createSlot() }

  return {
    update: (key, target, dt) => {
      const slot = slots[key]
      if (!target) {
        slot.unseenFor += dt
        slot.forearmUnseenFor += dt
        if (slot.unseenFor > HOLD_SECONDS || !slot.points) {
          slot.points = null
          slot.hasForearm = false
          return null
        }
        return {
          points: slot.points,
          forearm: slot.hasForearm ? { dir: slot.dir, length: slot.length } : null,
          fade: 1 - slot.unseenFor / HOLD_SECONDS,
        }
      }

      const k = 1 - Math.exp(-POINT_RATE * dt)
      if (!slot.points) {
        slot.points = target.points.map((point) => ({ x: point.x, y: point.y }))
      } else {
        for (let i = 0; i < slot.points.length; i++) {
          slot.points[i].x += (target.points[i].x - slot.points[i].x) * k
          slot.points[i].y += (target.points[i].y - slot.points[i].y) * k
        }
      }
      slot.unseenFor = 0

      if (target.forearm) {
        if (!slot.hasForearm) {
          slot.dir = { x: target.forearm.dir.x, y: target.forearm.dir.y }
          slot.length = target.forearm.length
        } else {
          const fk = 1 - Math.exp(-FOREARM_RATE * dt)
          slot.dir.x += (target.forearm.dir.x - slot.dir.x) * fk
          slot.dir.y += (target.forearm.dir.y - slot.dir.y) * fk
          const norm = Math.max(Math.hypot(slot.dir.x, slot.dir.y), 1e-5)
          slot.dir.x /= norm
          slot.dir.y /= norm
          slot.length += (target.forearm.length - slot.length) * fk
        }
        slot.hasForearm = true
        slot.forearmUnseenFor = 0
      } else {
        slot.forearmUnseenFor += dt
        if (slot.forearmUnseenFor > FOREARM_HOLD_SECONDS) slot.hasForearm = false
      }

      return {
        points: slot.points,
        forearm: slot.hasForearm ? { dir: slot.dir, length: slot.length } : null,
        fade: 1,
      }
    },
  }
}
