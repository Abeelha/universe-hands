import { FilesetResolver, PoseLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision"

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
const DETECT_INTERVAL_MS = 66
const LEFT_ELBOW = 13
const RIGHT_ELBOW = 14
const LEFT_WRIST = 15
const RIGHT_WRIST = 16

export type ArmReading = {
  wrist: { x: number; y: number }
  elbow: { x: number; y: number }
}

export type ArmTracker = {
  read: (timestampMs: number) => ArmReading[]
  close: () => void
}

const mirror = (point: NormalizedLandmark): { x: number; y: number } => ({
  x: 1 - point.x,
  y: point.y,
})

const visible = (point: NormalizedLandmark): boolean => (point.visibility ?? 1) > 0.5

export async function createArmTracker(video: HTMLVideoElement): Promise<ArmTracker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
  const landmarker = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    runningMode: "VIDEO",
    numPoses: 1,
  })
  let lastTimestamp = -1
  let lastArms: ArmReading[] = []
  return {
    read: (timestampMs) => {
      if (video.readyState < 2 || timestampMs - lastTimestamp < DETECT_INTERVAL_MS) return lastArms
      lastTimestamp = timestampMs
      const result = landmarker.detectForVideo(video, timestampMs)
      const pose = result.landmarks.length > 0 ? result.landmarks[0] : undefined
      lastArms = []
      if (pose) {
        if (visible(pose[LEFT_WRIST]) && visible(pose[LEFT_ELBOW])) {
          lastArms.push({ wrist: mirror(pose[LEFT_WRIST]), elbow: mirror(pose[LEFT_ELBOW]) })
        }
        if (visible(pose[RIGHT_WRIST]) && visible(pose[RIGHT_ELBOW])) {
          lastArms.push({ wrist: mirror(pose[RIGHT_WRIST]), elbow: mirror(pose[RIGHT_ELBOW]) })
        }
      }
      return lastArms
    },
    close: () => landmarker.close(),
  }
}
