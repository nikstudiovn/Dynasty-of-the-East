import { nativeBridge } from "../bridge/nativeBridge";
import { audioSettings } from "./settings";

type Track = "menu" | "peace_day_1" | "peace_day_2" | "night_lantern" | "battle_skirmish" | "battle_siege" | "victory" | "defeat";
type Scene = "menu" | "day" | "night" | "skirmish" | "siege" | "victory" | "defeat";
const tracks = { menu: "menu", night: "night_lantern", skirmish: "battle_skirmish",
  siege: "battle_siege", victory: "victory", defeat: "defeat" } as const;
const fadeMs = 2100;
const dayLengths = { peace_day_1: 203_072, peace_day_2: 187_626 } as const;

export class MusicEngine {
  private decks = [new Audio(), new Audio()];
  private loaded: (Track | undefined)[] = [undefined, undefined];
  private levels = [0, 0];
  private nodes: GainNode[] = [];
  private current = 0;
  private scene: Scene = "menu";
  private appliedScene?: Scene;
  private dayTrack: Track = "peace_day_2";
  private nextDayAt = Infinity;
  private interrupted = false;
  private unlocked = false;
  private primedSpare = false;
  private started = false;
  private pausedAt?: number;
  private fade?: { start: number; from: number[] };

  constructor() {
    for (const deck of this.decks) deck.preload = "none";
    this.decks.forEach((deck, i) => deck.addEventListener("error", () => {
      if (i === this.current) this.started = false;
    }));
  }

  unlock(context?: AudioContext): void {
    if (!nativeBridge.isIOSApp() && context && this.nodes.length === 0) {
      try {
        for (const deck of this.decks) {
          const gain = context.createGain();
          gain.gain.value = 0;
          context.createMediaElementSource(deck).connect(gain);
          gain.connect(context.destination);
          this.nodes.push(gain);
        }
      } catch {}
    }
    this.unlocked = true;
    this.refresh(true);
    if (!this.primedSpare && audioSettings.music && !nativeBridge.isIOSApp()) this.primeSpare();
  }

  private primeSpare(): void {
    const i = 1 - this.current;
    if (this.loaded[i]) return;
    this.primedSpare = true;
    const deck = this.decks[i];
    // WebKit grants autoplay permission per element. Prime the spare on the same
    // gesture with a silent, in-memory WAV so the first battle crossfade can play.
    const silent = "data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQIAAICAgA==";
    const release = () => {
      if (deck.getAttribute("src") !== silent) return;
      deck.pause();
      deck.removeAttribute("src");
      deck.load();
    };
    try {
      this.applyVolume(i);
      deck.src = silent;
      void deck.play().then(release, release);
    } catch { release(); }
  }

  setHidden(hidden: boolean): void {
    this.interrupted = hidden;
    this.refresh(!hidden);
  }

  private play(i: number): void {
    if (!this.loaded[i]) return;
    if (nativeBridge.isIOSApp()) {
      nativeBridge.musicDeck("resume", i);
      return;
    }
    if (!this.decks[i].loop && this.decks[i].ended) return;
    try {
      void this.decks[i].play().catch(() => { if (i === this.current) this.started = false; });
    } catch { if (i === this.current) this.started = false; }
  }

  private pause(i: number): void {
    if (nativeBridge.isIOSApp()) nativeBridge.musicDeck("pause", i);
    else this.decks[i].pause();
  }

  private clear(i: number): void {
    if (!this.loaded[i]) return;
    this.loaded[i] = undefined;
    if (nativeBridge.isIOSApp()) nativeBridge.musicDeck("clear", i);
    else {
      const deck = this.decks[i];
      deck.pause();
      deck.removeAttribute("src");
      deck.load();
    }
  }

  private applyVolume(i: number): void {
    const volume = this.levels[i] * audioSettings.musicVolume;
    if (nativeBridge.isIOSApp()) nativeBridge.musicDeck("volume", i, { volume });
    else if (this.nodes[i]) this.nodes[i].gain.value = volume;
    else this.decks[i].volume = volume;
  }

  refresh(allowRetry = false): void {
    if (!this.unlocked) return;
    if (this.interrupted || !audioSettings.music || document.hidden) {
      this.decks.forEach((_, i) => this.pause(i));
      if (this.started) {
        this.pausedAt = performance.now();
      }
      this.started = false;
      return;
    }
    if (this.pausedAt !== undefined) {
      const elapsed = performance.now() - this.pausedAt;
      this.nextDayAt += elapsed;
      if (this.fade) this.fade.start += elapsed;
      this.pausedAt = undefined;
    }
    this.decks.forEach((_, i) => this.applyVolume(i));
    if (allowRetry && !this.started) {
      if (!this.loaded[this.current] || this.appliedScene !== this.scene) this.change(this.pickTrack(), performance.now());
      else {
        this.started = true;
        this.decks.forEach((_, i) => {
          if (i === this.current || this.fade) this.play(i);
        });
      }
    }
  }

  private pickTrack(): Track {
    if (this.scene !== "day") return tracks[this.scene];
    this.dayTrack = this.dayTrack === "peace_day_1" ? "peace_day_2" : "peace_day_1";
    return this.dayTrack;
  }

  private change(track: Track, now: number): void {
    if (this.loaded[this.current] === track || !this.unlocked || !audioSettings.music || this.interrupted || document.hidden) return;
    const next = this.loaded[this.current] ? 1 - this.current : this.current;
    this.clear(next);
    this.levels[next] = 0;
    this.current = next;
    const loop = track !== "victory" && track !== "defeat";
    this.loaded[next] = track;
    this.appliedScene = this.scene;
    if (nativeBridge.isIOSApp()) nativeBridge.musicDeck("load", next, { track, loop });
    else {
      const deck = this.decks[next];
      deck.loop = loop;
      deck.src = "./audio/bgm_" + track + ".m4a";
    }
    this.applyVolume(next);
    this.fade = { start: now, from: [...this.levels] };
    this.started = true;
    this.play(next);
    this.nextDayAt = track === "peace_day_1" || track === "peace_day_2"
      ? now + dayLengths[track] - fadeMs : Infinity;
  }

  update(scene: Scene, now: number, reset: boolean): void {
    if (reset && (this.loaded[this.current] === "victory" || this.loaded[this.current] === "defeat")) {
      this.clear(this.current);
      this.appliedScene = undefined;
    }
    this.scene = scene;
    if (!this.unlocked || this.interrupted || document.hidden || !audioSettings.music) return;
    if (scene !== this.appliedScene || !this.loaded[this.current] || scene === "day" && now >= this.nextDayAt) {
      this.change(this.pickTrack(), now);
    }
    if (!this.started || !this.fade) return;
    const p = Math.min(1, (now - this.fade.start) / fadeMs);
    for (let i = 0; i < 2; i++) {
      this.levels[i] = this.fade.from[i] + ((i === this.current ? 1 : 0) - this.fade.from[i]) * p;
      this.applyVolume(i);
    }
    if (p === 1) {
      this.clear(1 - this.current);
      this.fade = undefined;
    }
  }
}
