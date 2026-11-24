import { isoToTile, tileToIso } from "../render3d/common";
import type { Renderer3D } from "../render3d";
import type { Cam } from "../render3d/scene3d";

interface Building {
  id: number;
  type: string;
  team: string;
  aiIndex: number;
  tx: number;
  ty: number;
  size: number;
  hp: number;
}

interface Match {
  mapSize: number;
  running: boolean;
  gameOver: boolean;
  stats?: { elapsedSec?: number };
  buildings: Building[];
  aiStates: { idx: number; age: number }[];
}

const ALERT_LIFETIME = 7000;
const JUMP_DURATION = 480;
const CRITICAL_BUILDINGS = new Map([
  ["town_center", "Đình Làng"],
  ["watch_tower", "Vọng Lâu"]
]);

function drawViewport(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  mapSize: number,
  cam: Cam,
  renderer: Renderer3D | null
): void {
  const width = canvas.width;
  const height = canvas.height;
  const scaleX = ctx.canvas.width / mapSize;
  const scaleY = ctx.canvas.height / mapSize;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const x = i === 1 || i === 2 ? width : 0;
    const y = i >= 2 ? height : 0;
    // Project the four screen corners. Rotation and perspective skew the footprint in map space.
    const point = renderer ? renderer.anchorAt(x, y) : isoToTile(
      cam.x + (x - width / 2) / cam.zoom,
      cam.y + (y - height / 2) / cam.zoom
    );
    if (i === 0) ctx.moveTo(point.x * scaleX, point.z * scaleY);
    else ctx.lineTo(point.x * scaleX, point.z * scaleY);
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(255, 224, 150, 0.10)";
  ctx.fill();
  ctx.strokeStyle = "#69461f";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = "#fffcdf";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

export function initBattleHud() {
  const wrap = document.querySelector<HTMLElement>("#game-wrap")!;
  const canvas = wrap.querySelector<HTMLCanvasElement>("#gameCanvas")!;
  const top = wrap.querySelector<HTMLElement>(".top-hud")!;
  const dock = wrap.querySelector<HTMLElement>(".cmd-dock")!;
  const minimap = wrap.querySelector<HTMLCanvasElement>("#minimapCanvas")!;
  const ctx = minimap.getContext("2d")!;
  const modal = wrap.querySelector<HTMLElement>("#modal")!;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

  const timer = document.createElement("time");
  timer.className = "battle-timer";
  timer.textContent = "00:00";
  timer.dateTime = "PT0S";
  timer.setAttribute("aria-label", "Thời gian trận đấu");
  top.querySelector(".hud-pill")!.append(timer);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "battle-dock-toggle";
  toggle.setAttribute("aria-controls", "battle-dock-header cmd-buttons");
  dock.querySelector(".cmd-header")!.id = "battle-dock-header";
  function setCollapsed(collapsed: boolean) {
    dock.classList.toggle("battle-dock-collapsed", collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.textContent = collapsed ? "▴ Mở lệnh" : "▾ Thu gọn";
  }
  setCollapsed(false);
  toggle.addEventListener("click", () => setCollapsed(toggle.getAttribute("aria-expanded") === "true"));
  dock.prepend(toggle);

  const compass = document.createElement("div");
  compass.className = "battle-compass";
  compass.setAttribute("aria-hidden", "true");
  for (const direction of ["B", "Đ", "N", "T"]) {
    const marker = document.createElement("span");
    marker.textContent = direction;
    compass.append(marker);
  }
  minimap.before(compass);

  const feed = document.createElement("div");
  feed.className = "battle-alerts";
  feed.setAttribute("role", "log");
  feed.setAttribute("aria-label", "Cảnh báo trận đấu");
  top.append(feed);

  const alerts = new Map<HTMLButtonElement, number>();
  const buildings = new Map<number, { building: Building; hp: number; alertAfter: number }>();
  const aiAges = new Map<number, number>();
  let match: Match | undefined;
  let active = false;
  let seconds = 0;
  let jump: { cam: Cam; from: Cam; to: { x: number; y: number }; start: number; x: number; y: number } | undefined;

  canvas.addEventListener("pointerdown", () => { jump = undefined; });
  minimap.addEventListener("pointerdown", () => { jump = undefined; });

  function removeAlert(button: HTMLButtonElement) {
    window.clearTimeout(alerts.get(button));
    alerts.delete(button);
    button.remove();
  }

  function alertAt(text: string, building: Building, cam: Cam) {
    if (alerts.size === 3) removeAlert(alerts.keys().next().value!);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "battle-alert";
    button.textContent = text;
    button.title = "Chạm để chuyển camera đến vị trí";
    button.addEventListener("click", () => {
      const to = tileToIso(building.tx + building.size / 2, building.ty + building.size / 2);
      if (reducedMotion.matches) {
        jump = undefined;
        cam.x = to.x;
        cam.y = to.y;
      } else {
        jump = { cam, from: { ...cam }, to, start: performance.now(), x: cam.x, y: cam.y };
      }
    });
    feed.prepend(button);
    alerts.set(button, window.setTimeout(() => removeAlert(button), ALERT_LIFETIME));
  }

  function trackEvents(state: Match, cam: Cam, now: number) {
    // In the game loop, destroyed buildings are filtered out after their HP is reduced to zero.
    // Keep their original object so a final hit can still be observed on the frame they disappear.
    for (const building of state.buildings) {
      if (building.team === "player" && CRITICAL_BUILDINGS.has(building.type) && !buildings.has(building.id)) {
        buildings.set(building.id, { building, hp: building.hp, alertAfter: 0 });
      }
    }
    for (const [id, record] of buildings) {
      const { building } = record;
      if (building.hp < record.hp && now >= record.alertAfter) {
        alertAt(`${CRITICAL_BUILDINGS.get(building.type)} bị tấn công!`, building, cam);
        record.alertAfter = now + ALERT_LIFETIME;
      }
      record.hp = building.hp;
      if (building.hp <= 0) buildings.delete(id);
    }
    for (const ai of state.aiStates) {
      if (ai.age > (aiAges.get(ai.idx) ?? ai.age)) {
        const base = state.buildings.find(b => b.team === "enemy" && b.type === "town_center" && b.aiIndex === ai.idx - 1);
        if (base) alertAt(`Phe AI ${ai.idx} lên Đời ${ai.age}!`, base, cam);
      }
      aiAges.set(ai.idx, ai.age);
    }
  }

  return (state: Match, cam: Cam, renderer: Renderer3D | null) => {
    const inBattle = state.running && !state.gameOver && modal.classList.contains("hidden");
    if (inBattle !== active || state !== match) {
      active = inBattle;
      if (state !== match) setCollapsed(false);
      match = state;
      wrap.classList.toggle("battle-hud-active", active);
      buildings.clear();
      aiAges.clear();
      for (const button of alerts.keys()) removeAlert(button);
      jump = undefined;
    }

    drawViewport(ctx, canvas, state.mapSize, cam, renderer);
    if (!active) return;

    const elapsed = Math.floor(state.stats?.elapsedSec ?? 0);
    if (elapsed !== seconds) {
      seconds = elapsed;
      const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
      timer.textContent = `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
      timer.dateTime = `PT${seconds}S`;
    }

    const now = performance.now();
    trackEvents(state, cam, now);
    // The game has drawn this frame. Update the target for the next frame, unless a game control moved it.
    if (!jump) return;
    if (jump.cam.x !== jump.x || jump.cam.y !== jump.y) {
      jump = undefined;
      return;
    }
    const progress = Math.min((now - jump.start) / JUMP_DURATION, 1);
    const eased = progress * progress * (3 - 2 * progress);
    jump.cam.x = jump.x = jump.from.x + (jump.to.x - jump.from.x) * eased;
    jump.cam.y = jump.y = jump.from.y + (jump.to.y - jump.from.y) * eased;
    if (progress === 1) jump = undefined;
  };
}
