export type Hud = {
  update: (fps: number, mass: number, handVisible: boolean) => void
  message: (text: string) => void
}

export function createHud(root: HTMLElement): Hud {
  let lastMarkup = ""
  const render = (markup: string): void => {
    if (markup === lastMarkup) return
    lastMarkup = markup
    root.innerHTML = markup
  }
  return {
    update: (fps, mass, handVisible) => {
      const lines = [
        `FPS  ${String(Math.round(fps)).padStart(3, " ")}`,
        `MASS ${mass.toFixed(2)}`,
      ]
      if (!handVisible) lines.push(`<span class="hint">SHOW HAND TO CAMERA</span>`)
      render(lines.join("\n"))
    },
    message: (text) => render(`<span class="hint">${text}</span>`),
  }
}
