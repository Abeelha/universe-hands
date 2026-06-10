export type Hud = {
  update: (fps: number, mass: number, handsCount: number) => void
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
    update: (fps, mass, handsCount) => {
      const lines = [
        `FPS  ${String(Math.round(fps)).padStart(3, " ")}`,
        `MASS ${mass.toFixed(2)}`,
      ]
      lines.push(
        handsCount === 0
          ? `<span class="hint">SHOW HAND TO CAMERA</span>`
          : `<span class="dim">PINCH GROW / FIST NOVA / ROLL TILT / 2 HANDS BINARY</span>`,
      )
      render(lines.join("\n"))
    },
    message: (text) => render(`<span class="hint">${text}</span>`),
  }
}
