import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision"

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
const PALM_LANDMARKS = [0, 5, 9, 13, 17]
const FINGERTIP_LANDMARKS = [8, 12, 16, 20]

export type HandReading = {
  palm: { x: number; y: number }
  mass: number
  tilt: number
  fist: boolean
}

export type HandReader = (timestampMs: number) => HandReading[]

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function handScale(landmarks: NormalizedLandmark[]): number {
  const wrist = landmarks[0]
  const middleBase = landmarks[9]
  return Math.max(Math.hypot(wrist.x - middleBase.x, wrist.y - middleBase.y), 1e-5)
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

function pinchMass(landmarks: NormalizedLandmark[], scale: number): number {
  const thumbTip = landmarks[4]
  const indexTip = landmarks[8]
  const spread = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y) / scale
  return 1 - smoothstep(0.15, 0.85, spread)
}

function rollTilt(landmarks: NormalizedLandmark[]): number {
  const wrist = landmarks[0]
  const middleBase = landmarks[9]
  const angle = Math.atan2(wrist.y - middleBase.y, wrist.x - middleBase.x)
  const tilt = angle - Math.PI / 2
  return tilt < -Math.PI ? tilt + Math.PI * 2 : tilt
}

function isFist(landmarks: NormalizedLandmark[], scale: number): boolean {
  const wrist = landmarks[0]
  let total = 0
  for (const index of FINGERTIP_LANDMARKS) {
    const tip = landmarks[index]
    total += Math.hypot(tip.x - wrist.x, tip.y - wrist.y)
  }
  return total / FINGERTIP_LANDMARKS.length / scale < 1.2
}

function toReading(landmarks: NormalizedLandmark[]): HandReading {
  const scale = handScale(landmarks)
  return {
    palm: palmCenter(landmarks),
    mass: pinchMass(landmarks, scale),
    tilt: rollTilt(landmarks),
    fist: isFist(landmarks, scale),
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
