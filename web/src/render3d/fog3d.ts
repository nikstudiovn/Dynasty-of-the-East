// Pixel Dynasty 3D — smooth 3-state fog of war: a terrain-hugging veil driven by a MAP_N×MAP_N (48×48) DataTexture
// sampled with LinearFilter for soft edges.
import * as THREE from "three";
import { MAP_N, terrainHeight, bridgeDeckAt } from "./common";

const ALPHA = [0.92, 0.48, 0]; // unexplored / explored / visible
const SEG = MAP_N * 2; // 96×96 quads keeps the veil smooth and cheap on mobile GPUs

export class Fog3D {
  readonly mesh: THREE.Mesh;
  private readonly data = new Uint8Array(MAP_N * MAP_N * 4);
  private readonly cur = new Float32Array(MAP_N * MAP_N * 2); // [ink, alpha] animated
  private readonly tex: THREE.DataTexture;
  private readonly mat: THREE.ShaderMaterial;
  private heightsFor: any = null;
  private first = true;

  constructor() {
    this.tex = new THREE.DataTexture(this.data, MAP_N, MAP_N, THREE.RGBAFormat);
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    this.tex.needsUpdate = true;

    // own grid so uv (0..1) maps exactly to tile space x/z (0..MAP_N); texel centres sit on tile centres
    const g = new THREE.BufferGeometry();
    const n = SEG + 1, pos = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2), idx: number[] = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i, x = (i / SEG) * MAP_N, z = (j / SEG) * MAP_N;
      pos[k * 3] = x; pos[k * 3 + 1] = 0.08; pos[k * 3 + 2] = z;
      uv[k * 2] = x / MAP_N; uv[k * 2 + 1] = z / MAP_N;
    }
    for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    g.setIndex(idx);
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));

    this.mat = new THREE.ShaderMaterial({
      uniforms: { uFog: { value: this.tex }, uTime: { value: 0 }, uN: { value: MAP_N } },
      transparent: true,
      depthWrite: false,
      fog: false,
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform sampler2D uFog; uniform float uTime; uniform float uN; varying vec2 vUv;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
        void main() {
          vec4 f = texture2D(uFog, vUv);
          vec2 p = vUv * uN;
          float cloud = n2(p * 0.7 + vec2(uTime * 0.05, uTime * 0.03)) * 0.6 + n2(p * 1.7 - vec2(uTime * 0.04, 0.0)) * 0.4;
          float a = f.g * (0.86 + 0.22 * cloud);
          vec3 ink = vec3(0.035, 0.04, 0.035) + cloud * 0.05;
          vec3 sepia = vec3(0.16, 0.12, 0.08) + cloud * 0.04;
          gl_FragColor = vec4(mix(sepia, ink, f.r), clamp(a, 0.0, 1.0));
        }`
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.renderOrder = 8;
    this.mesh.frustumCulled = false;
  }

  /** Lift the veil so it hugs the sculpted hills (re-run when a new map is loaded). */
  private conform(grid: any[][]): void {
    const p = this.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      let y = Math.max(terrainHeight(x, z), -0.1) + 0.08;
      // lift over arched bridges so unexplored decks stay hidden under the veil
      for (const [dx, dz] of [[0, 0], [-0.4, 0], [0.4, 0], [0, -0.4], [0, 0.4]]) {
        if (grid[Math.floor(z + dz)]?.[Math.floor(x + dx)]?.terrain === "bridge") y = Math.max(y, bridgeDeckAt(x + dx, z + dz) + 0.42);
      }
      p.setY(i, y);
    }
    p.needsUpdate = true;
  }

  /** Track state.fog every frame (recomputeFog() mutates it) and ease alpha toward the target. */
  update(state: any, t: number, dt: number): void {
    if (state.grid !== this.heightsFor) { this.heightsFor = state.grid; this.conform(state.grid); this.first = true; }
    this.mat.uniforms.uTime.value = t;
    const fog = state.fog;
    const k = this.first ? 1 : 1 - Math.exp(-dt * 6);
    let dirty = false;
    for (let y = 0; y < MAP_N; y++) for (let x = 0; x < MAP_N; x++) {
      const f = fog[y]?.[x] ?? 0;
      const i = y * MAP_N + x;
      const tInk = f === 0 ? 1 : 0, tA = ALPHA[f] ?? 0.92;
      let ink = this.cur[i * 2], a = this.cur[i * 2 + 1];
      if (Math.abs(ink - tInk) > 0.002 || Math.abs(a - tA) > 0.002 || this.first) {
        ink += (tInk - ink) * k; a += (tA - a) * k;
        this.cur[i * 2] = ink; this.cur[i * 2 + 1] = a;
        const r = Math.round(ink * 255), g = Math.round(a * 255);
        if (this.data[i * 4] !== r || this.data[i * 4 + 1] !== g) { this.data[i * 4] = r; this.data[i * 4 + 1] = g; this.data[i * 4 + 3] = 255; dirty = true; }
      }
    }
    this.first = false;
    if (dirty) this.tex.needsUpdate = true;
  }
}
