import { startCamera } from "./core/camera"
import { createHandTracker } from "./core/hands"
import { createHud } from "./core/hud"
import { createRenderer } from "./core/post"
import type { Scene, SceneContext, SceneEntry } from "./core/scene"
import { createHub } from "./hub"
import { createBlackholeScene } from "./scenes/blackhole/scene"
import { createTattooScene } from "./scenes/tattoo/scene"
import { createFireScene } from "./scenes/fire/scene"

const SCENES: SceneEntry[] = [
  {
    id: "blackhole",
    title: "EVENT HORIZON",
    subtitle: "gravitational lensing black hole",
    create: createBlackholeScene,
  },
  {
    id: "tattoo",
    title: "LIVING INK",
    subtitle: "circuit + flora tattoo overlays",
    create: createTattooScene,
  },
  {
    id: "fire",
    title: "PYROKINESIS",
    subtitle: "fire from your palms",
    create: createFireScene,
  },
]

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("#view")
  const overlayCanvas = document.querySelector<HTMLCanvasElement>("#overlay")
  const hudRoot = document.querySelector<HTMLDivElement>("#hud")
  const hubRoot = document.querySelector<HTMLDivElement>("#hub")
  if (!canvas || !overlayCanvas || !hudRoot || !hubRoot) {
    throw new Error("missing #view, #overlay, #hud or #hub")
  }
  const hud = createHud(hudRoot)

  hud.message("REQUESTING CAMERA ACCESS...")
  const video = await startCamera()
  hud.message("LOADING HAND TRACKER...")
  const renderer = createRenderer(canvas)
  const readHands = await createHandTracker(video)

  const context: SceneContext = { renderer, video, overlay: overlayCanvas, hud }
  let active: Scene | null = null

  const clearOverlay = (): void => {
    const ctx = overlayCanvas.getContext("2d")
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
  }

  const closeScene = (): void => {
    if (!active) return
    active.dispose()
    active = null
    clearOverlay()
    renderer.clear(true, true, true)
    hud.message("SELECT A VISUAL")
    hub.show()
  }

  const select = (id: string): void => {
    const entry = SCENES.find((candidate) => candidate.id === id)
    if (!entry) return
    active?.dispose()
    clearOverlay()
    hub.hide()
    active = entry.create(context)
  }

  const hub = createHub(hubRoot, SCENES, select)
  hud.message("SELECT A VISUAL")

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeScene()
  })
  window.addEventListener("resize", () => active?.resize())

  let fps = 60
  let previous = performance.now()
  const frame = (now: number): void => {
    const dt = Math.min(Math.max((now - previous) / 1000, 1e-4), 0.1)
    previous = now
    fps += (1 / dt - fps) * 0.05
    const readings = readHands(now)
    if (active) active.frame(readings, dt, now / 1000, fps)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

boot().catch((error: unknown) => {
  const hudRoot = document.querySelector<HTMLDivElement>("#hud")
  if (hudRoot) hudRoot.textContent = error instanceof Error ? error.message.toUpperCase() : String(error)
})
