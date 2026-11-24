import * as THREE from "three";

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
  sunColor: new THREE.Color(0xfff1d2),
  sunIntensity: 1.75,
  hemiSky: new THREE.Color(0xf6eedb),
  hemiGround: new THREE.Color(0x7b7561),
  hemiIntensity: 1.0,
  fogColor: new THREE.Color(0xcbb998),
  lanternBoost: 0.0,
};

const GOLDEN_PRESET: LightPreset = {
  sunColor: new THREE.Color(0xff9c52),
  sunIntensity: 1.35,
  hemiSky: new THREE.Color(0xffcea0),
  hemiGround: new THREE.Color(0x6c5144),
  hemiIntensity: 0.85,
  fogColor: new THREE.Color(0xd69a68),
  lanternBoost: 0.65,
};

const NIGHT_PRESET: LightPreset = {
  sunColor: new THREE.Color(0x7c97cc),
  sunIntensity: 0.45,
  hemiSky: new THREE.Color(0x36496e),
  hemiGround: new THREE.Color(0x1b2233),
  hemiIntensity: 0.58,
  fogColor: new THREE.Color(0x1c253b),
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
  private tmpColor = new THREE.Color();
  private lanternTimer = 0;
  private lanternMats: Array<{ mat: THREE.MeshStandardMaterial; base: number }> = [];
  private lanternLights: Array<{ light: THREE.PointLight; base: number }> = [];

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

  private collectLanterns(scene: THREE.Scene): void {
    this.lanternMats.length = 0;
    this.lanternLights.length = 0;
    scene.traverse((obj) => {
      if (obj instanceof THREE.PointLight) {
        if (obj.userData._baseIntensity === undefined) {
          obj.userData._baseIntensity = obj.intensity;
        }
        this.lanternLights.push({ light: obj, base: obj.userData._baseIntensity as number });
      } else if (obj instanceof THREE.Mesh) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m instanceof THREE.MeshStandardMaterial && m.emissive && m.emissive.getHex() !== 0) {
            const isWarm = m.emissive.r > 0.55 && m.emissive.g > 0.15 && m.emissive.b < 0.45;
            if (isWarm || obj.userData.isLantern || obj.name.toLowerCase().includes("lantern")) {
              if (m.userData._baseEmissive === undefined) {
                m.userData._baseEmissive = m.emissiveIntensity;
              }
              this.lanternMats.push({ mat: m, base: m.userData._baseEmissive as number });
            }
          }
        }
      }
    });
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

    if (scene.fog instanceof THREE.FogExp2) {
      this.tmpColor.copy(a.fogColor).lerp(b.fogColor, t);
      scene.fog.color.copy(this.tmpColor);
      scene.fog.density = 0.0085 + mistWeight * 0.009 + rainWeight * 0.003;
    }

    this.lanternTimer -= safeDt;
    if (this.lanternTimer <= 0) {
      this.collectLanterns(scene);
      this.lanternTimer = 2.0;
    }
    const emissiveScale = 1.0 + lanternBoost * 2.2;
    for (const item of this.lanternMats) {
      item.mat.emissiveIntensity = item.base * emissiveScale;
    }
    const lightScale = 0.35 + lanternBoost * 1.65;
    for (const item of this.lanternLights) {
      item.light.intensity = item.base * lightScale;
    }

    this.ensureRain(scene);
    if (this.rainLines && this.rainGeo && this.rainMat) {
      if (rainWeight > 0.02) {
        this.rainLines.visible = true;
        this.rainMat.opacity = 0.36 * rainWeight;
        const attr = this.rainGeo.getAttribute("position") as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        const half = RAIN_AREA * 0.5;
        for (let i = 0; i < RAIN_COUNT; i++) {
          const idx = i * 3;
          let ox = this.rainSeeds[idx] - 2.6 * safeDt;
          let oy = this.rainSeeds[idx + 1] - 17.5 * safeDt;
          let oz = this.rainSeeds[idx + 2] - 1.1 * safeDt;
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
          arr[v + 3] = px - 0.16;
          arr[v + 4] = py - 0.92;
          arr[v + 5] = pz - 0.07;
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
    this.lanternMats.length = 0;
    this.lanternLights.length = 0;
  }
}
