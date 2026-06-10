import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision"

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
const PALM_LANDMARKS = [0, 5, 9, 13, 17]
const FINGER_JOINTS = {
  index: { pip: 6, tip: 8 },
  middle: { pip: 10, tip: 12 },
  ring: { pip: 14, tip: 16 },
  pinky: { pip: 18, tip: 20 },
} as const
const KNOB_CHANNELS = ["index", "middle", "ring", "pinky"] as const
const KNOB_ENGAGE_RATIO = 0.45

export type KnobFinger = (typeof KNOB_CHANNELS)[number]
export type HandPose = "neutral" | "point" | "peace" | "fist"

export type HandReading = {
  palm: { x: number; y: number }
  points: { x: number; y: number }[]
  tilt: number
  pose: HandPose
  knob: { finger: KnobFinger; tightness: number } | null
  pinchMass: number
  jetDir: { x: number; y: number }
}

export type HandReader = (timestampMs: number) => HandReading[]

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function distance(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function handScale(landmarks: NormalizedLandmark[]): number {
  return Math.max(distance(landmarks[0], landmarks[9]), 1e-5)
}

function palmCenter(landmarks: NormalizedLandmark[]): { x: number; y: number } {
  let x = 0
  let y = 0
  for (const index of PALM_LANDMARKS) {
    const point = landmarks[index]
    x += point.x
    y += point.y
  }
  return { x: 1 - x / PALM_LANDMARKS.length, y: 1 - y / PALM_LANDMARKS.length }
}

function rollTilt(landmarks: NormalizedLandmark[]): number {
  const wrist = landmarks[0]
  const middleBase = landmarks[9]
  const angle = Math.atan2(wrist.y - middleBase.y, wrist.x - middleBase.x)
  const tilt = angle - Math.PI / 2
  return tilt < -Math.PI ? tilt + Math.PI * 2 : tilt
}

function isExtended(landmarks: NormalizedLandmark[], finger: KnobFinger): boolean {
  const wrist = landmarks[0]
  const joints = FINGER_JOINTS[finger]
  return distance(landmarks[joints.tip], wrist) > distance(landmarks[joints.pip], wrist) * 1.1
}

function detectPose(landmarks: NormalizedLandmark[]): HandPose {
  const index = isExtended(landmarks, "index")
  const middle = isExtended(landmarks, "middle")
  const ring = isExtended(landmarks, "ring")
  const pinky = isExtended(landmarks, "pinky")
  if (!index && !middle && !ring && !pinky) return "fist"
  if (index && !middle && !ring && !pinky) return "point"
  if (index && middle && !ring && !pinky) return "peace"
  return "neutral"
}

function detectKnob(
  landmarks: NormalizedLandmark[],
  scale: number,
): { finger: KnobFinger; tightness: number } | null {
  const thumbTip = landmarks[4]
  const extended = {
    index: isExtended(landmarks, "index"),
    middle: isExtended(landmarks, "middle"),
    ring: isExtended(landmarks, "ring"),
    pinky: isExtended(landmarks, "pinky"),
  }
  let bestFinger: KnobFinger | null = null
  let bestRatio = KNOB_ENGAGE_RATIO
  for (const finger of KNOB_CHANNELS) {
    const extendedOthers = KNOB_CHANNELS.filter(
      (other) => other !== finger && extended[other],
    ).length
    if (extendedOthers < 2) continue
    const ratio = distance(thumbTip, landmarks[FINGER_JOINTS[finger].tip]) / scale
    if (ratio < bestRatio) {
      bestRatio = ratio
      bestFinger = finger
    }
  }
  if (!bestFinger) return null
  return { finger: bestFinger, tightness: 1 - smoothstep(0.12, KNOB_ENGAGE_RATIO, bestRatio) }
}

function pinchMass(landmarks: NormalizedLandmark[], scale: number): number {
  const spread = distance(landmarks[4], landmarks[8]) / scale
  return 1 - smoothstep(0.15, 0.85, spread)
}

function jetDirection(landmarks: NormalizedLandmark[]): { x: number; y: number } {
  const base = landmarks[5]
  const tip = landmarks[8]
  const dx = base.x - tip.x
  const dy = base.y - tip.y
  const length = Math.max(Math.hypot(dx, dy), 1e-5)
  return { x: dx / length, y: dy / length }
}

function toReading(landmarks: NormalizedLandmark[]): HandReading {
  const scale = handScale(landmarks)
  return {
    palm: palmCenter(landmarks),
    points: landmarks.map((point) => ({ x: 1 - point.x, y: point.y })),
    tilt: rollTilt(landmarks),
    pose: detectPose(landmarks),
    knob: detectKnob(landmarks, scale),
    pinchMass: pinchMass(landmarks, scale),
    jetDir: jetDirection(landmarks),
  }
}

export async function createHandTracker(video: HTMLVideoElement): Promise<HandReader> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
  const landmarker = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    runningMode: "VIDEO",
    numHands: 2,
  })
  let lastTimestamp = -1
  let lastReadings: HandReading[] = []
  return (timestampMs) => {
    if (video.readyState < 2 || timestampMs <= lastTimestamp) return lastReadings
    lastTimestamp = timestampMs
    const result = landmarker.detectForVideo(video, timestampMs)
    lastReadings = result.landmarks.map(toReading)
    return lastReadings
  }
}
