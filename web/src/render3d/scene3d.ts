// Pixel Dynasty 3D — WebGL2 renderer, golden-hour lighting and the 45° perspective RTS camera.
import * as THREE from "three";
import { MAP_N, isoToTile, tileToIso, clamp } from "./common";

export interface Cam { x: number; y: number; zoom: number; shake?: number; }

export const MIN_ZOOM = 0.45;
export const MAX_ZOOM = 2.5;
const PITCH = THREE.MathUtils.degToRad(45);
const DEFAULT_YAW = Math.PI / 4; // matches the classic isometric orientation (screen-right = +x / -z)

/** cam.zoom [0.45, 2.5] -> camera distance (zooming in brings the camera down toward the roofs). */
export function distForZoom(z: number): number {
  return 16 / clamp(z, MIN_ZOOM, MAX_ZOOM);
}

export class Scene3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly target = new THREE.Vector3(MAP_N / 2, 0, MAP_N / 2);
  yaw = DEFAULT_YAW;
  yawTarget = DEFAULT_YAW;
  dist = distForZoom(1);
  width = 1;
  height = 1;
  private readonly ray = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly probe: THREE.PerspectiveCamera;
  private readonly tmpV = new THREE.Vector3();
  private readonly ndc = new THREE.Vector2();

  constructor(readonly canvas: HTMLCanvasElement) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.12;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.setClearColor(0x1a1511, 1);
    this.renderer = r;

    this.scene.background = new THREE.Color(0x1a1511);
    this.scene.fog = new THREE.FogExp2(0x1a1511, 0.009);

    this.camera = new THREE.PerspectiveCamera(36, 1, 0.3, 220);
    this.probe = new THREE.PerspectiveCamera(36, 1, 0.01, 50);

    // Warm sky + lush ground bounce keeps shadowed faces rich and readable.
    this.hemi = new THREE.HemisphereLight(0xffe8c2, 0x2e4a22, 0.95);
    this.scene.add(this.hemi);

    // Golden-hour sun from the top-left of the screen, crisp 2048² soft shadows over the whole valley.
    const sun = new THREE.DirectionalLight(0xffc98a, 2.6);
    sun.position.set(MAP_N / 2 - 15, 19, MAP_N / 2 - 3);
    sun.target.position.set(MAP_N / 2, 0, MAP_N / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -21; sc.right = 21; sc.top = 21; sc.bottom = -21; sc.near = 1; sc.far = 70;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.025;
    sun.shadow.radius = 3;
    this.sun = sun;
    this.scene.add(sun, sun.target);

    // faint cool rim light from behind so silhouettes pop against the meadow
    const rim = new THREE.DirectionalLight(0x9fb8ff, 0.35);
    rim.position.set(MAP_N / 2 + 14, 10, MAP_N / 2 + 12);
    this.scene.add(rim);
  }

  resize(w: number, h: number): void {
    this.width = Math.max(1, w); this.height = Math.max(1, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.probe.aspect = this.camera.aspect;
    this.probe.updateProjectionMatrix();
  }

  rotate(dir: number): void { this.yawTarget += dir * (Math.PI / 4); }

  private offsetDir(yaw: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.sin(yaw) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(yaw) * Math.cos(PITCH));
  }

  /** Pull the camera from the classic cam (iso pixel space) every frame. */
  update(cam: Cam, dt: number): void {
    const t = isoToTile(cam.x, cam.y);
    this.target.set(clamp(t.x, -2, MAP_N + 2), 0, clamp(t.z, -2, MAP_N + 2));
    const k = 1 - Math.exp(-dt * 12);
    this.dist += (distForZoom(cam.zoom) - this.dist) * k;
    this.yaw += (this.yawTarget - this.yaw) * (1 - Math.exp(-dt * 8));
    this.offsetDir(this.yaw, this.tmpV).multiplyScalar(this.dist);
    this.camera.position.copy(this.target).add(this.tmpV);
    if (cam.shake) {
      const s = cam.shake * 0.12;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  private setNdc(clientX: number, clientY: number): void {
    const r = this.canvas.getBoundingClientRect();
    const w = r.width || this.width, h = r.height || this.height;
    this.ndc.set(((clientX - r.left) / w) * 2 - 1, -((clientY - r.top) / h) * 2 + 1);
  }

  /** Raycast a client point onto the ground plane y = 0. */
  groundAt(clientX: number, clientY: number): THREE.Vector3 | null {
    this.setNdc(clientX, clientY);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hit = new THREE.Vector3();
    return this.ray.ray.intersectPlane(this.ground, hit) ? hit : null;
  }

  /** Ground point (per unit of camera distance, relative to the target) under a local screen point. */
  groundOffset(sx: number, sy: number): { x: number; z: number } | null {
    this.offsetDir(this.yaw, this.probe.position);
    this.probe.lookAt(0, 0, 0);
    this.probe.updateMatrixWorld();
    this.ndc.set((sx / this.width) * 2 - 1, -(sy / this.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.probe);
    const hit = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.ground, hit)) return null;
    return { x: hit.x, z: hit.z };
  }

  /** Move the classic cam so `anchor` (tile space) sits under local screen point (sx, sy) at zoom z. */
  placeAnchor(cam: Cam, anchor: { x: number; z: number }, sx: number, sy: number, z: number): void {
    const g = this.groundOffset(sx, sy);
    if (!g) return;
    const d = distForZoom(z);
    this.dist = d; // snap so the anchor stays glued under the fingers
    const iso = tileToIso(anchor.x - g.x * d, anchor.z - g.z * d);
    cam.x = iso.x; cam.y = iso.y;
  }

  /** Tile-space ground point under a local screen point using the current camera distance. */
  anchorAt(sx: number, sy: number): { x: number; z: number } {
    const g = this.groundOffset(sx, sy) || { x: 0, z: 0 };
    return { x: this.target.x + g.x * this.dist, z: this.target.z + g.z * this.dist };
  }

  /** Project a world point to local CSS-pixel screen coordinates. */
  project(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    this.tmpV.set(x, y, z).project(this.camera);
    return { x: (this.tmpV.x + 1) * 0.5 * this.width, y: (1 - this.tmpV.y) * 0.5 * this.height, visible: this.tmpV.z < 1 && this.tmpV.z > -1 };
  }

  render(): void { this.renderer.render(this.scene, this.camera); }
}
