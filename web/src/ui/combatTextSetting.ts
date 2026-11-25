// "Số nổi: Bật/Tắt" — one preference shared by the HUD (#btn-combat-text), the pause menu
// (#btn-pause-combat-text) and the lobby settings page (#btn-settings-combat-text).
import { isFloatingTextEnabled, onFloatingTextChange, setFloatingTextEnabled } from "../render3d/floatingText";

const bound = new Set<HTMLButtonElement>();
let listening = false;

function paint(btn: HTMLButtonElement): void {
  const on = isFloatingTextEnabled();
  const value = on ? "Bật" : "Tắt";
  if (btn.classList.contains("dote-btn")) {
    btn.innerHTML = `<span>Số nổi</span><span style="color:var(--dote-gold-light)">${value}</span>`;
  } else {
    btn.textContent = `Số nổi: ${value}`;
  }
  btn.setAttribute("aria-pressed", String(on));
}

export function bindCombatTextButton(btn: HTMLButtonElement | null): void {
  if (!btn || bound.has(btn)) return;
  bound.add(btn);
  paint(btn);
  btn.addEventListener("click", () => {
    try { setFloatingTextEnabled(!isFloatingTextEnabled()); } catch { /* ignore */ }
  });
  if (!listening) {
    listening = true;
    onFloatingTextChange(() => bound.forEach(paint));
  }
}

/** Lobby settings page button (separate ID, same preference). */
export function createLobbyCombatTextButton(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "btn-settings-combat-text";
  btn.className = "dote-btn dote-btn--ghost";
  bindCombatTextButton(btn);
  return btn;
}

export function initCombatTextSetting(): void {
  bindCombatTextButton(document.getElementById("btn-combat-text") as HTMLButtonElement | null);
  bindCombatTextButton(document.getElementById("btn-pause-combat-text") as HTMLButtonElement | null);
}
