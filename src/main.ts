import { startCamera } from "./camera"
import { createHandTracker } from "./hands"
import { createBlackholeView } from "./blackhole"
import { createHud } from "./hud"

const SMOOTHING = 0.15
const MASS_DECAY_RATE = 8

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("#view")
  const hudRoot = document.querySelector<HTMLDivElement>("#hud")
  if (!canvas || !hudRoot) throw new Error("missing #view or #hud element")
  const hud = createHud(hudRoot)

  hud.message("REQUESTING CAMERA ACCESS...")
  const video = await startCamera()
  hud.message("LOADING HAND TRACKER...")
  const view = createBlackholeView(canvas, video)
  const readHand = await createHandTracker(video)

  const hole = { x: 0.5, y: 0.5 }
  let mass = 0
  let fps = 60
  let previous = performance.now()

  const frame = (now: number): void => {
    const dt = Math.min(Math.max((now - previous) / 1000, 1e-4), 0.1)
    previous = now
    fps += (1 / dt - fps) * 0.05

    const reading = readHand(now)
    if (reading.present) {
      hole.x += (reading.palm.x - hole.x) * SMOOTHING
      hole.y += (reading.palm.y - hole.y) * SMOOTHING
      mass += (reading.mass - mass) * SMOOTHING
    } else {
      mass *= Math.exp(-MASS_DECAY_RATE * dt)
    }

    view.update(hole, mass, now / 1000)
    view.render()
    hud.update(fps, mass, reading.present)
    requestAnimationFrame(frame)
  }

  window.addEventListener("resize", view.resize)
  requestAnimationFrame(frame)
}

boot().catch((error: unknown) => {
  const hudRoot = document.querySelector<HTMLDivElement>("#hud")
  if (hudRoot) hudRoot.textContent = error instanceof Error ? error.message.toUpperCase() : String(error)
})
