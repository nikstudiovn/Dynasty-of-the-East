import { audioSettings } from "./settings";

type Note = readonly [frequency: number, duration: number, waveform?: OscillatorType, offset?: number, endFrequency?: number];
const cues = {
  click: [[630, .055]], select: [[470, .08], [620, .09, "triangle", .04]],
  move: [[360, .12, "triangle", 0, 520]], attack: [[260, .15, "triangle", 0, 120]],
  foundation: [[145, .15, "triangle", 0, 60]], complete: [[330, .2], [495, .28, "triangle", .09]],
  train: [[392, .1], [523, .18, "triangle", .08]], forge: [[660, .10, "square"]],
  age: [[294, .2], [392, .2, "triangle", .1], [587, .42, "triangle", .2]],
  hit: [[185, .09, "sawtooth", 0, 90], [1450, .045, "sine"]],
  bow: [[970, .09, "triangle", 0, 380]], navalBow: [[710, .12, "triangle", 0, 260]],
  volley: [[900, .11, "triangle"], [1200, .13, "triangle", .06]],
  charge: [[110, .24, "triangle", 0, 47], [78, .22, "triangle", .11]],
  gallop: [[172, .11, "triangle", 0, 55], [210, .12, "triangle", .09, 60]],
  siege: [[94, .48, "sawtooth", 0, 32]], fireShip: [[140, .35, "sawtooth", 0, 42]],
  heal: [[810, .3, "sine"], [1215, .35, "sine", .06]],
  launch: [[280, .23, "sine", 0, 155], [420, .17, "triangle", .11]],
  shrine: [[105, .48, "triangle", 0, 54], [165, .48, "triangle", .16]],
  relic: [[125, .55, "triangle"], [185, .55, "triangle", .22]],
  alarm: [[146.83, .74, "sine"], [220, .55, "triangle", .08]],
  victory: [[392, .25], [523, .32, "triangle", .13], [659, .6, "sine", .29]],
  defeat: [[262, .37], [196, .58, "sine", .22]],
  work: [[1200, .06, "triangle", 0, 400]],
} satisfies Record<string, readonly Note[]>;
export type Cue = keyof typeof cues;

export class SfxEngine {
  context?: AudioContext;
  private output?: GainNode;
  private active = 0;
  private last = new Map<Cue, number>();
  private ambience?: { source: AudioBufferSourceNode; rain: GainNode; water: GainNode };
  private rainLevel = 0;
  private waterLevel = 0;

  unlock(): void {
    try {
      const Context = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return;
      if (!this.context) {
        this.context = new Context();
        this.output = this.context.createGain();
        this.output.connect(this.context.destination);
      }
      if (this.context.state !== "running") void this.context.resume().catch(() => {});
      this.refresh();
    } catch {}
  }

  refresh(hidden = document.hidden): void {
    const c = this.context;
    if (!c || !this.output) return;
    this.output.gain.setTargetAtTime(!hidden && audioSettings.sound ? audioSettings.soundVolume : 0, c.currentTime, .035);
    if (hidden) void c.suspend().catch(() => {});
  }

  play(key: Cue): void {
    const c = this.context;
    if (!c || c.state !== "running" || !this.output || !audioSettings.sound || document.hidden) return;
    const now = c.currentTime;
    const cooldown = key === "alarm" ? 8 : key === "heal" || key === "work" ? .5 : .11;
    if (now - (this.last.get(key) ?? -Infinity) < cooldown || this.active + cues[key].length > 16) return;
    this.last.set(key, now);
    const notes: readonly Note[] = cues[key];
    try {
      for (const [frequency, duration, wave = "triangle", offset = 0, end = frequency] of notes) {
        const osc = c.createOscillator(), gain = c.createGain();
        const start = now + offset;
        osc.type = wave;
        osc.frequency.setValueAtTime(frequency, start);
        osc.frequency.exponentialRampToValueAtTime(end, start + duration);
        gain.gain.setValueAtTime(.001, start);
        gain.gain.linearRampToValueAtTime(wave === "sawtooth" ? .046 : .115, start + .009);
        gain.gain.exponentialRampToValueAtTime(.001, start + duration);
        osc.connect(gain); gain.connect(this.output);
        osc.onended = () => { this.active--; osc.disconnect(); gain.disconnect(); };
        osc.start(start); osc.stop(start + duration);
        this.active++;
      }
    } catch {}
  }

  setAmbience(rain: number, water: number): void {
    const c = this.context;
    if (!c || !this.output || c.state !== "running") return;
    if (!audioSettings.sound) rain = water = 0;
    if (!this.ambience && (rain || water)) {
      const source = c.createBufferSource();
      const buffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      source.buffer = buffer; source.loop = true;
      const band = (frequency: number, type: BiquadFilterType) => {
        const filter = c.createBiquadFilter(), gain = c.createGain();
        filter.type = type; filter.frequency.value = frequency;
        gain.gain.value = 0;
        source.connect(filter); filter.connect(gain); gain.connect(this.output!);
        return gain;
      };
      this.ambience = { source, rain: band(2200, "bandpass"), water: band(490, "lowpass") };
      source.start();
    }
    if (this.ambience && (rain !== this.rainLevel || water !== this.waterLevel)) {
      this.ambience.rain.gain.setTargetAtTime(rain * .11, c.currentTime, .25);
      this.ambience.water.gain.setTargetAtTime(water * .085, c.currentTime, .3);
      this.rainLevel = rain; this.waterLevel = water;
    }
  }
}
