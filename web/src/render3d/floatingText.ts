// Dynasty of the East 3D — floating combat / resource numbers drawn with Canvas 2D on #overlayCanvas.
// A fixed pool of 40 labels is reused (one label per gameplay event); world positions are projected every
// frame. The on/off preference lives here so the HUD, pause menu and lobby buttons share one source of truth.

export const FLOATING_TEXT_KEY = "dote_floating_text";
const LEGACY_FLOATING_TEXT_KEY = "pixel_dynasty_floating_text";
const EVENT = "dote-floating-text-change";

let enabled = true;
try {
  const raw = window.localStorage.getItem(FLOATING_TEXT_KEY);
  const legacy = raw === null ? window.localStorage.getItem(LEGACY_FLOATING_TEXT_KEY) : null;
  enabled = (raw ?? legacy) !== "0";
  if (raw === null && (legacy === "0" || legacy === "1")) {
    window.localStorage.setItem(FLOATING_TEXT_KEY, legacy);
  }
} catch {
  /* storage blocked: keep the in-memory default for this session */
}

export function isFloatingTextEnabled(): boolean { return enabled; }

export function setFloatingTextEnabled(on: boolean): void {
  enabled = on;
  try { window.localStorage.setItem(FLOATING_TEXT_KEY, on ? "1" : "0"); } catch { /* session only */ }
  try { window.dispatchEvent(new CustomEvent(EVENT, { detail: on })); } catch { /* ignore */ }
}

export function onFloatingTextChange(fn: (on: boolean) => void): void {
  window.addEventListener(EVENT, e => fn(Boolean((e as CustomEvent).detail)));
}

// ---------------------------------------------------------------------------
export const FLOAT_COLORS = {
  ivory: "#F3EAD3",      // damage dealt to enemies
  ember: "#F0643C",      // damage taken by the player
  bronze: "#D9A441",     // gold / stone delivered
  jade: "#6FC2A4"        // food / wood delivered
} as const;

interface Label { active: boolean; x: number; z: number; text: string; color: string; life: number; max: number; drift: number; }
const POOL = 40;
const LIFE = 1.15;

type Project = (x: number, y: number, z: number) => { x: number; y: number; visible: boolean };

export class FloatingText {
  private readonly labels: Label[] = Array.from({ length: POOL }, () => ({ active: false, x: 0, z: 0, text: "", color: "", life: 0, max: LIFE, drift: 0 }));
  private head = 0;

  /** Adds one label; the oldest is recycled when all 40 are busy. */
  add(x: number, z: number, text: string, color: string): void {
    if (!enabled) return;
    let slot = this.labels.find(l => !l.active);
    if (!slot) { slot = this.labels[this.head]; this.head = (this.head + 1) % POOL; }
    slot.active = true;
    slot.x = x; slot.z = z; slot.text = text; slot.color = color;
    slot.life = slot.max = LIFE;
    slot.drift = (Math.random() - 0.5) * 10;
  }

  clear(): void { for (const l of this.labels) l.active = false; }

  stats(): { active: number; texts: string[] } {
    const live = this.labels.filter(l => l.active);
    return { active: live.length, texts: live.map(l => l.text) };
  }

  update(dt: number): void {
    for (const l of this.labels) if (l.active && (l.life -= dt) <= 0) l.active = false;
  }

  draw(ctx: CanvasRenderingContext2D, project: Project, height: (x: number, z: number) => number, visible: (x: number, z: number) => boolean): void {
    // hidden (not paused) while a menu is open or the option is off — older labels included
    if (!enabled || document.body.classList.contains("dote-menu-open")) return;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "800 13px -apple-system, 'SF Pro Rounded', system-ui, sans-serif";
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(20, 12, 8, 0.9)";
    for (const l of this.labels) {
      if (!l.active || !visible(l.x, l.z)) continue;
      const k = 1 - l.life / l.max;
      const p = project(l.x, height(l.x, l.z) + 0.75 + k * 0.55, l.z);
      if (!p.visible) continue;
      ctx.globalAlpha = Math.min(1, (l.life / l.max) * 2.4);
      const x = p.x + l.drift * k;
      ctx.strokeText(l.text, x, p.y);
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, x, p.y);
    }
    ctx.globalAlpha = 1;
  }
}
