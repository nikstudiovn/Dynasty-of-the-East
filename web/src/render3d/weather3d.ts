import * as THREE from "three";
import { wind } from "./wind3d";

export type AtmosphereMode = "auto" | "golden" | "night";
export type WeatherKind = "clear" | "mist" | "rain";

interface LightPreset {
  sunColor: THREE.Color;
  sunIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  fogColor: THREE.Color;
  lanternBoost: number;
}

const DAY_PRESET: LightPreset = {
  sunColor: new THREE.Color(0xffd5a0),
  sunIntensity: 2.45,
  hemiSky: new THREE.Color(0x9eafc7),
  hemiGround: new THREE.Color(0x777269),
  hemiIntensity: 0.95,
  fogColor: new THREE.Color(0x6e7d87),
  lanternBoost: 0.0,
};

const GOLDEN_PRESET: LightPreset = {
  sunColor: new THREE.Color(0xffae73),
  sunIntensity: 1.78,
  hemiSky: new THREE.Color(0x8999bf),
  hemiGround: new THREE.Color(0x685a56),
  hemiIntensity: 0.85,
  fogColor: new THREE.Color(0x836f74),
  lanternBoost: 0.65,
};

const NIGHT_PRESET: LightPreset = {
  sunColor: new THREE.Color(0x94b5ee),
  sunIntensity: 0.75,
  hemiSky: new THREE.Color(0x647ca6),
  hemiGround: new THREE.Color(0x1b2233),
  hemiIntensity: 0.76,
  fogColor: new THREE.Color(0x283852),
  lanternBoost: 1.0,
};

const CYCLE_DURATION = 360;
const WEATHER_DURATION = 240;
const RAIN_COUNT = 220;
const RAIN_AREA = 48;
const RAIN_HEIGHT = 22;

export class Weather3D {
  private mode: AtmosphereMode = "auto";
  private cycleTime = 0;
  private weatherTime = 0;
  private rainLines: THREE.LineSegments | null = null;
  private rainGeo: THREE.BufferGeometry | null = null;
  private rainMat: THREE.LineBasicMaterial | null = null;
  private rainSeeds: Float32Array;
  private readonly rainGray = new THREE.Color("#748695");
  private readonly stormFog = new THREE.Color("#56636e");
  private tmpColor = new THREE.Color();
  lanternBoost = 0;
  rain = 0;
  particleFraction = 1;
  readonly horizon = new THREE.Color();
  readonly zenith = new THREE.Color();
  private readonly daySky = new THREE.Color("#597387");
  private readonly duskSky = new THREE.Color("#4b5c80");
  private readonly nightSky = new THREE.Color("#171f37");
  readonly fogTint = new THREE.Color(0xd8e0e8);
  riverMistOpacity = 0;
  private readonly sunsetFogTint = new THREE.Color(0xcfa79a);
  private readonly nightFogTint = new THREE.Color(0x6b7fa8);
  constructor() {
    this.rainSeeds = new Float32Array(RAIN_COUNT * 3);
    for (let i = 0; i < RAIN_COUNT; i++) {
      this.rainSeeds[i * 3] = (Math.random() - 0.5) * RAIN_AREA;
      this.rainSeeds[i * 3 + 1] = Math.random() * RAIN_HEIGHT;
      this.rainSeeds[i * 3 + 2] = (Math.random() - 0.5) * RAIN_AREA;
    }
  }

  setMode(mode: AtmosphereMode): void {
    this.mode = mode;
  }

  getMode(): AtmosphereMode {
    return this.mode;
  }

  cycleMode(): AtmosphereMode {
    if (this.mode === "auto") {
      this.mode = "golden";
    } else if (this.mode === "golden") {
      this.mode = "night";
    } else {
      this.mode = "auto";
    }
    return this.mode;
  }

  private ensureRain(scene: THREE.Scene): void {
    if (this.rainLines) return;
    const positions = new Float32Array(RAIN_COUNT * 6);
    this.rainGeo = new THREE.BufferGeometry();
    this.rainGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.rainMat = new THREE.LineBasicMaterial({
      color: 0xc8dcf0,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });
    this.rainLines = new THREE.LineSegments(this.rainGeo, this.rainMat);
    this.rainLines.frustumCulled = false;
    this.rainLines.visible = false;
    scene.add(this.rainLines);
  }

  private sampleCycle(): { a: LightPreset; b: LightPreset; t: number } {
    if (this.mode === "golden") return { a: GOLDEN_PRESET, b: GOLDEN_PRESET, t: 0 };
    if (this.mode === "night") return { a: NIGHT_PRESET, b: NIGHT_PRESET, t: 0 };

    const p = (this.cycleTime % CYCLE_DURATION) / CYCLE_DURATION;
    if (p < 0.36) {
      return { a: DAY_PRESET, b: DAY_PRESET, t: 0 };
    } else if (p < 0.48) {
      return { a: DAY_PRESET, b: GOLDEN_PRESET, t: (p - 0.36) / 0.12 };
    } else if (p < 0.62) {
      return { a: GOLDEN_PRESET, b: GOLDEN_PRESET, t: 0 };
    } else if (p < 0.72) {
      return { a: GOLDEN_PRESET, b: NIGHT_PRESET, t: (p - 0.62) / 0.10 };
    } else if (p < 0.90) {
      return { a: NIGHT_PRESET, b: NIGHT_PRESET, t: 0 };
    } else {
      return { a: NIGHT_PRESET, b: DAY_PRESET, t: (p - 0.90) / 0.10 };
    }
  }

  private sampleWeather(): { mistWeight: number; rainWeight: number } {
    const wp = (this.weatherTime % WEATHER_DURATION) / WEATHER_DURATION;
    let mistWeight = 0;
    let rainWeight = 0;
    if (wp >= 0.25 && wp < 0.55) {
      const local = (wp - 0.25) / 0.30;
      mistWeight = Math.sin(local * Math.PI);
    } else if (wp >= 0.55 && wp < 0.90) {
      const local = (wp - 0.55) / 0.35;
      rainWeight = Math.sin(local * Math.PI);
      mistWeight = rainWeight * 0.45;
    }
    return { mistWeight, rainWeight };
  }

  update(
    dt: number,
    scene: THREE.Scene,
    sunLight: THREE.DirectionalLight,
    hemiLight: THREE.HemisphereLight,
    camTargetX: number,
    camTargetZ: number
  ): void {
    const safeDt = Math.min(Math.max(dt, 0), 0.1);
    this.cycleTime = (this.cycleTime + safeDt) % CYCLE_DURATION;
    this.weatherTime = (this.weatherTime + safeDt) % WEATHER_DURATION;

    const { a, b, t } = this.sampleCycle();
    sunLight.color.copy(a.sunColor).lerp(b.sunColor, t);
    sunLight.intensity = a.sunIntensity + (b.sunIntensity - a.sunIntensity) * t;
    hemiLight.color.copy(a.hemiSky).lerp(b.hemiSky, t);
    hemiLight.groundColor.copy(a.hemiGround).lerp(b.hemiGround, t);
    hemiLight.intensity = a.hemiIntensity + (b.hemiIntensity - a.hemiIntensity) * t;

    const lanternBoost = a.lanternBoost + (b.lanternBoost - a.lanternBoost) * t;
    const { mistWeight, rainWeight } = this.sampleWeather();

    const night = Math.max(0, (lanternBoost - 0.65) / 0.35);
    sunLight.color.lerp(this.rainGray, rainWeight * 0.4);
    sunLight.intensity *= 1 - rainWeight * 0.39;
    hemiLight.color.lerp(this.rainGray, rainWeight * 0.27);
    this.tmpColor.copy(a.fogColor).lerp(b.fogColor, t).lerp(this.stormFog, rainWeight * (0.56 - night * 0.32));
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.copy(this.tmpColor);
      scene.fog.density = 0.0105 + mistWeight * 0.005 + rainWeight * 0.004 + night * 0.001;
    }

    this.lanternBoost += (lanternBoost - this.lanternBoost) * (1 - Math.exp(-safeDt * 2));
    this.rain = rainWeight;
    this.horizon.copy(this.tmpColor);
    this.zenith.copy(this.daySky).lerp(this.duskSky, Math.min(1, this.lanternBoost / 0.65))
      .lerp(this.nightSky, Math.max(0, (this.lanternBoost - 0.65) / 0.35));
    scene.environmentIntensity = 0.70 - this.lanternBoost * 0.38 - mistWeight * 0.09 + rainWeight * 0.07;
    const goldenWeight = Math.max(0, Math.min(1, this.lanternBoost / 0.65) * (1 - night));
  const angle = (1 - goldenWeight * 0.72) * 1.15;
  const az = 0.55 + this.lanternBoost * 2.1;
  (scene as THREE.Scene & { setSunArc?: (x: number, y: number, z: number) => void }).setSunArc?.(Math.cos(az) * Math.cos(angle) * 38, Math.max(10, Math.sin(angle) * 38), Math.sin(az) * Math.cos(angle) * 38);
    this.fogTint.setHex(0xd8e0e8).lerp(this.sunsetFogTint, Math.min(1, this.lanternBoost / 0.65)).lerp(this.nightFogTint, night);
    this.riverMistOpacity = Math.min(0.42, mistWeight * 0.34 + goldenWeight * 0.16 + rainWeight * 0.08);
    this.ensureRain(scene);
    if (this.rainLines && this.rainGeo && this.rainMat) {
      if (rainWeight > 0.02) {
        this.rainLines.visible = true;
         this.rainMat.opacity = 0.36 * rainWeight;       
        const attr = this.rainGeo.getAttribute("position") as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        const half = RAIN_AREA * 0.5;
        const count = Math.round(RAIN_COUNT * this.particleFraction);
        this.rainGeo.setDrawRange(0, count * 2);
        const dx = wind.uWindDir.value.x * (2.6 + rainWeight * 2);
        const dz = wind.uWindDir.value.y * (2.6 + rainWeight * 2);
        for (let i = 0; i < count; i++) {
          const idx = i * 3;
          let ox = this.rainSeeds[idx] + dx * safeDt;
          let oy = this.rainSeeds[idx + 1] - 17.5 * safeDt;
          let oz = this.rainSeeds[idx + 2] + dz * safeDt;
          if (oy < 0) oy += RAIN_HEIGHT;
          if (ox < -half) ox += RAIN_AREA;
          if (ox > half) ox -= RAIN_AREA;
          if (oz < -half) oz += RAIN_AREA;
          if (oz > half) oz -= RAIN_AREA;
          this.rainSeeds[idx] = ox;
          this.rainSeeds[idx + 1] = oy;
          this.rainSeeds[idx + 2] = oz;

          const px = camTargetX + ox;
          const py = oy;
          const pz = camTargetZ + oz;
          const v = i * 6;
          arr[v] = px;
          arr[v + 1] = py;
          arr[v + 2] = pz;
          arr[v + 3] = px + dx * 0.053;
          arr[v + 4] = py - 0.92;
          arr[v + 5] = pz + dz * 0.053;
        }
        attr.needsUpdate = true;
      } else {
        this.rainLines.visible = false;
      }
    }
  }

  dispose(): void {
    if (this.rainLines && this.rainLines.parent) {
      this.rainLines.parent.remove(this.rainLines);
    }
    if (this.rainGeo) {
      this.rainGeo.dispose();
      this.rainGeo = null;
    }
    if (this.rainMat) {
      this.rainMat.dispose();
      this.rainMat = null;
    }
    this.rainLines = null;
  }
}
