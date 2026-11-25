import { haptic } from "./haptics";
import { MusicEngine } from "./musicEngine";
import { onAudioSettings } from "./settings";
import { SfxEngine, type Cue } from "./sfxEngine";
import type { HapticStyle } from "../bridge/nativeBridge";

const music = new MusicEngine();
const sfx = new SfxEngine();
let unlocked = false;
let pageHidden = false;
let match: object | null = null;
let result: "victory" | "defeat" | undefined;
let lastHit = -Infinity;
let lastSiege = -Infinity;
let hits: number[] = [];
let lastFrame = -Infinity;
let mode = "auto";
let weatherClock = 0;
const shrineOwners = new Map<object, string | null>();
let relicOwner: string | null = null;

export function unlockAudio(): void {
  if (pageHidden || document.hidden) return;
  unlocked = true;
  try { sfx.unlock(); music.unlock(sfx.context); } catch {}
}

export function cue(key: Cue, feedback?: HapticStyle): void {
  sfx.play(key);
  if (feedback) haptic(feedback);
}

export function resetAudioMatch(next: object | null): void {
  if (next === match) return;
  match = next;
  result = undefined;
  lastHit = lastSiege = lastAlarm = -Infinity;
  hits = [];
  shrineOwners.clear();
  relicOwner = null;
}

export function battleAudio(siege: boolean, alarm: boolean): void {
  const now = performance.now();
  lastHit = now;
  hits.push(now);
  if (hits.length > 16) hits.shift();
  if (siege) lastSiege = now;
  if (alarm && now - lastAlarm >= 8000) {
    lastAlarm = now;
    cue("alarm", "warning");
  }
}
let lastAlarm = -Infinity;

export function setAudioAtmosphere(value: string): void { mode = value; }

export function endAudioMatch(victory: boolean): void {
  result = victory ? "victory" : "defeat";
  cue(result, victory ? "success" : "warning");
}

interface MatchAudio {
  running?: boolean;
  mapType?: string;
  biome?: string;
  shrines?: { owner: string | null }[];
  relic?: { owner: string } | null;
  hasDeepWater?: boolean;
}

export function updateGameAudio(state: MatchAudio | null, menu: boolean, paused: boolean, dt: number): void {
  try {
    const reset = state !== match;
    resetAudioMatch(state);
    // Tracks the existing renderer weather clock, including visual updates while paused.
    if (state) weatherClock += dt;
    const now = performance.now();
    if (now - lastFrame < 45 && !reset) return;
    lastFrame = now;
    const active = Boolean(state?.running && !menu && !paused && !result);
    if (active && state) {
      for (const shrine of state.shrines ?? []) {
        const previous = shrineOwners.get(shrine);
        if (previous !== undefined && shrine.owner && previous !== shrine.owner) cue("shrine", "medium");
        shrineOwners.set(shrine, shrine.owner);
      }
      const owner = state.relic?.owner ?? null;
      if (owner && owner !== relicOwner) cue("relic", "warning");
      relicOwner = owner;
    }
    const cycle = (weatherClock % 360) / 360;
    const night = mode === "night" || mode === "auto" && cycle >= .67 && cycle < .95;
    const weather = (weatherClock % 240) / 240;
    const rain = weather >= .55 && weather < .9 ? Math.sin(Math.PI * (weather - .55) / .35) : 0;
    const river = state?.biome === "river_delta" || state?.biome === "river_valley" ||
      state?.mapType === "river_delta" || state?.mapType === "river_valley";
    const siege = Boolean(state?.relic) || now - lastSiege < 14_000 ||
      (now - lastHit < 14_000 && hits.filter(time => time >= now - 4500).length >= 12);
    const scene = result ?? (!state?.running || menu ? "menu" : siege ? "siege" :
      now - lastHit < 14_000 ? "skirmish" : night ? "night" : "day");
    music.update(scene, now, reset);
    sfx.setAmbience(active ? rain : 0, active && river ? .75 : 0);
  } catch {}
}

for (const event of ["pointerdown", "touchstart", "keydown", "click"]) {
  document.addEventListener(event, unlockAudio, { capture: true, passive: true });
}
document.addEventListener("click", event => {
  if (event.target instanceof Element && event.target.closest("button")) cue("click");
});
function visibility(hidden: boolean): void {
  try {
    pageHidden = hidden;
    music.setHidden(hidden);
    if (!hidden && unlocked) sfx.unlock();
    else sfx.refresh(hidden);
  } catch {}
}
document.addEventListener("visibilitychange", () => visibility(document.hidden));
window.addEventListener("pagehide", () => visibility(true));
window.addEventListener("pageshow", () => visibility(document.hidden));
onAudioSettings(() => {
  try { music.refresh(true); sfx.refresh(pageHidden || document.hidden); } catch {}
});
