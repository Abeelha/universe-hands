import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision"

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
const PALM_LANDMARKS = [0, 5, 9, 13, 17]

export type HandReading = {
  present: boolean
  palm: { x: number; y: number }
  mass: number
}

export type HandReader = (timestampMs: number) => HandReading

const ABSENT: HandReading = { present: false, palm: { x: 0.5, y: 0.5 }, mass: 0 }

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
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

function pinchMass(landmarks: NormalizedLandmark[]): number {
  const thumbTip = landmarks[4]
  const indexTip = landmarks[8]
  const wrist = landmarks[0]
  const middleBase = landmarks[9]
  const pinchSpan = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y)
  const handScale = Math.hypot(wrist.x - middleBase.x, wrist.y - middleBase.y)
  const spread = pinchSpan / Math.max(handScale, 1e-5)
  return 1 - smoothstep(0.18, 1.05, spread)
}

export async function createHandTracker(video: HTMLVideoElement): Promise<HandReader> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
  const landmarker = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    runningMode: "VIDEO",
    numHands: 1,
  })
  let lastTimestamp = -1
  let lastReading = ABSENT
  return (timestampMs) => {
    if (video.readyState < 2 || timestampMs <= lastTimestamp) return lastReading
    lastTimestamp = timestampMs
    const result = landmarker.detectForVideo(video, timestampMs)
    const landmarks = result.landmarks.length > 0 ? result.landmarks[0] : undefined
    lastReading = landmarks
      ? { present: true, palm: palmCenter(landmarks), mass: pinchMass(landmarks) }
      : ABSENT
    return lastReading
  }
}
