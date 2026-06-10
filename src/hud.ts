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
      lines.push(
        handsCount === 0
          ? `<span class="hint">SHOW HAND TO CAMERA</span>`
          : `<span class="dim">IDX MASS / MID DISK / RING LENS / PNK HUE / POINT JET / V SLOWMO / FIST EAT</span>`,
      )
      render(lines.join("\n"))
    },
    message: (text) => render(`<span class="hint">${text}</span>`),
  }
}
