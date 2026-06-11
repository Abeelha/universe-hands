export type Canvas2d = {
  ctx: CanvasRenderingContext2D
  width: () => number
  height: () => number
  resize: () => void
  clear: () => void
}

export function createCanvas2d(canvas: HTMLCanvasElement): Canvas2d {
  const context = canvas.getContext("2d")
  if (!context) throw new Error("2d context unavailable")
  const ctx = context
  let width = 0
  let height = 0

  const resize = (): void => {
    const ratio = Math.min(window.devicePixelRatio, 2)
    width = window.innerWidth
    height = window.innerHeight
    canvas.width = width * ratio
    canvas.height = height * ratio
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  }
  resize()

  return {
    ctx,
    width: () => width,
    height: () => height,
    resize,
    clear: () => ctx.clearRect(0, 0, width, height),
  }
}
