import type { WebGLRenderer } from "three"
import type { HandReading } from "./hands"
import type { Hud } from "./hud"

export type SceneContext = {
  renderer: WebGLRenderer
  video: HTMLVideoElement
  overlay: HTMLCanvasElement
  hud: Hud
}

export type Scene = {
  frame: (readings: HandReading[], dt: number, nowSeconds: number, fps: number) => void
  resize: () => void
  dispose: () => void
}

export type SceneEntry = {
  id: string
  title: string
  subtitle: string
  create: (context: SceneContext) => Scene
}
