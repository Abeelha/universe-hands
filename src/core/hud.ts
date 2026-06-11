export type Hud = {
  set: (lines: string[]) => void
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
    set: (lines) => render(lines.join("\n")),
    message: (text) => render(`<span class="hint">${text}</span>`),
  }
}

export const fpsLine = (fps: number): string => `FPS  ${String(Math.round(fps)).padStart(3, " ")}`
