import type { SceneEntry } from "./core/scene"

export type Hub = {
  show: () => void
  hide: () => void
  visible: () => boolean
}

export function createHub(
  root: HTMLElement,
  entries: SceneEntry[],
  onSelect: (id: string) => void,
): Hub {
  const items = entries
    .map(
      (entry, index) => `
      <button class="hub-item" data-id="${entry.id}">
        <span class="hub-num">0${index + 1}</span>
        <span class="hub-title">${entry.title}</span>
        <span class="hub-desc">${entry.subtitle}</span>
      </button>`,
    )
    .join("")
  root.innerHTML = `
    <div class="hub-inner">
      <h1>UNIVERSE HANDS</h1>
      <p class="hub-sub">HAND-DRIVEN VISUAL INSTRUMENTS</p>
      <div class="hub-list">${items}</div>
      <p class="hub-foot">CLICK OR PRESS 1-${entries.length} / ESC RETURNS HERE</p>
    </div>`

  let isVisible = true

  root.addEventListener("click", (event) => {
    const target = event.target as HTMLElement
    const button = target.closest<HTMLButtonElement>(".hub-item")
    if (button?.dataset.id) onSelect(button.dataset.id)
  })

  window.addEventListener("keydown", (event) => {
    if (!isVisible) return
    const slot = Number.parseInt(event.key, 10)
    if (slot >= 1 && slot <= entries.length) onSelect(entries[slot - 1].id)
  })

  return {
    show: () => {
      isVisible = true
      root.classList.remove("hidden")
    },
    hide: () => {
      isVisible = false
      root.classList.add("hidden")
    },
    visible: () => isVisible,
  }
}
