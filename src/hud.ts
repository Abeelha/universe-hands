export type Hud = {
  update: (fps: number, mass: number, handsCount: number, status: string) => void
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
    update: (fps, mass, handsCount, status) => {
      const lines = [
        `FPS  ${String(Math.round(fps)).padStart(3, " ")}`,
        `MASS ${mass.toFixed(2)}`,
      ]
      if (status) lines.push(`<span class="active">${status}</span>`)
      if (handsCount === 0) {
        lines.push(`<span class="hint">SHOW HAND TO CAMERA</span>`)
      } else if (handsCount === 1) {
        lines.push(`<span class="dim">RAISE SECOND HAND = CONTROL DECK</span>`)
      } else {
        lines.push(
          `<span class="dim">IDX DISK / MID LENS / RING HUE / PNK TIME / POINT JET / FIST EAT / V RESET</span>`,
        )
      }
      render(lines.join("\n"))
    },
    message: (text) => render(`<span class="hint">${text}</span>`),
  }
}
