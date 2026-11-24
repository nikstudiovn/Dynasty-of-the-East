import * as THREE from "three";

export type Surface = "tile" | "glaze" | "lacquer" | "teak" | "plaster" | "stone" | "thatch" | "silk" | "lattice" | "scale";

interface SurfaceMaps {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

const MASK_SIZE = 128;
let surfaceSize = 128;
const bindings = new Map<THREE.MeshStandardMaterial, Surface>();

export function bindSurface(material: THREE.MeshStandardMaterial, kind: Surface): void {
  const maps = surfaceMaps(kind);
  material.map = maps.map;
  material.bumpMap = maps.bumpMap;
  material.roughnessMap = maps.roughnessMap;
  if (kind === "lattice") material.emissiveMap = maps.map;
  if (!bindings.has(material)) material.addEventListener("dispose", () => { bindings.delete(material); });
  bindings.set(material, kind);
}

export function setSurfaceDetail(high: boolean): void {
  const size = high ? 256 : 128;
  if (size === surfaceSize) return;
  surfaceSize = size;
  clearSurfaceTextures();
  for (const [material, kind] of bindings) bindSurface(material, kind);
}
const surfaces = new Map<Surface, SurfaceMaps>();
let glow: THREE.CanvasTexture | undefined;

function canvasTexture(paint: (ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D) => void, color = false, size = MASK_SIZE) {
  const offscreen = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(size, size) : undefined;
  const offscreenContext = offscreen?.getContext("2d");
  let canvas: OffscreenCanvas | HTMLCanvasElement;
  if (offscreen && offscreenContext) {
    paint(offscreenContext);
    canvas = offscreen;
  } else {
    const htmlCanvas = document.createElement("canvas");
    htmlCanvas.width = htmlCanvas.height = size;
    const context = htmlCanvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D unavailable for procedural textures");
    paint(context);
    canvas = htmlCanvas;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function grain(x: number, y: number): number {
  const h = Math.imul(x + 31, 374761393) ^ Math.imul(y + 71, 668265263);
  return ((Math.imul(h ^ (h >>> 13), 1274126177) >>> 24) / 255) - 0.5;
}

export function surfaceMaps(kind: Surface): SurfaceMaps {
  const cached = surfaces.get(kind);
  if (cached) return cached;
  const size = surfaceSize;
  const relief = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const noise = grain(x, y);
    const wave = (cycles: number, phase: number) => Math.sin((cycles + phase) * Math.PI * 2);
    let h = noise * 0.18;
    switch (kind) {
      case "tile": case "glaze": {
        const channel = Math.abs(wave(u * 5, 0));
        const seam = Math.pow(Math.max(0, wave(v * 8, 0.02 * channel)), 22);
        h = 0.72 * channel - seam * 0.15 + noise * 0.05;
        break;
      }
      case "lacquer": case "teak":
        h = 0.43 + 0.13 * wave(u * 22, 0.23 * wave(v * 2, 0)) + 0.05 * wave(u * 37, 0.13 * wave(v, 0)) + noise * 0.08;
        break;
      case "plaster":
        h = 0.52 + noise * 0.16 + 0.10 * wave(u * 5 + v * 3, 0) * wave(v * 4 - u * 2, 0);
        break;
      case "stone": {
        const row = Math.floor(v * 4);
        const bx = (u * 4 + row * 0.5) % 1, by = v * 4 % 1;
        h = (Math.min(bx, 1 - bx, by, 1 - by) < 0.045 ? 0.15 : 0.67) + noise * 0.16;
        break;
      }
      case "thatch":
        h = 0.48 + 0.12 * wave(u * 37, 0.08 * wave(v * 2, 0)) + 0.14 * wave(v * 6, 0.03 * noise) + noise * 0.12;
        break;
      case "silk": {
        const diamond = Math.abs(u - 0.5) + Math.abs(v - 0.5);
        h = (diamond > 0.25 && diamond < 0.31 || v < 0.10 || v > 0.90 ? 0.89 : 0.44) + wave(u * 32, 0) * 0.035;
        break;
      }
      case "scale": {
        const row = Math.floor(v * 10), px = (u * 8 + row * 0.5) % 1 - 0.5;
        const py = v * 10 % 1;
        h = 0.25 + 0.68 * Math.max(0, 1 - px * px * 2.6 - (py - 0.43) ** 2 * 1.6);
        if (py > 0.89 - 0.38 * px * px) h *= 0.48;
        break;
      }
      case "lattice":
        h = (u * 4 % 1 < 0.125 || v * 4 % 1 < 0.125) ? 0.2 : 0.92 - Math.hypot(u - 0.5, v - 0.5) * 0.36;
        break;
    }
    if (size > MASK_SIZE && kind !== "lattice" && kind !== "silk") {
      h += noise * 0.036 + wave(u * 61 + v * 37, 0.16 * noise) * 0.028;
    }
    relief[y * size + x] = THREE.MathUtils.clamp(h, 0, 1);
  }
  const paint = (channel: "color" | "height" | "roughness") => (ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D) => {
    const image = ctx.createImageData(size, size);
    for (let i = 0; i < relief.length; i++) {
      const h = relief[i];
      const v = channel === "height" ? h : channel === "roughness" ? 0.98 - h * 0.37 :
        kind === "lattice" ? h : 0.77 + h * 0.23;
      const offset = i * 4;
      image.data[offset] = v * 255;
      image.data[offset + 1] = v * (kind === "silk" && channel === "color" ? 246 : 255);
      image.data[offset + 2] = v * (kind === "silk" && channel === "color" ? 224 : 255);
      image.data[offset + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
  };
  const maps = {
    map: canvasTexture(paint("color"), true, size),
    bumpMap: canvasTexture(paint("height"), false, size),
    roughnessMap: canvasTexture(paint("roughness"), false, size)
  };
  surfaces.set(kind, maps);
  return maps;
}

export function softMask(): THREE.CanvasTexture {
  return glow ??= canvasTexture(ctx => {
    const size = MASK_SIZE;
    const half = size / 2;
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, "rgba(255,255,255,0.95)");
    gradient.addColorStop(0.4, "rgba(255,255,255,0.46)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  });
}

function clearSurfaceTextures(): void {
  for (const maps of surfaces.values()) for (const texture of Object.values(maps)) texture.dispose();
  surfaces.clear();
}

export function disposeSurfaceMaps(): void {
  clearSurfaceTextures();
  bindings.clear();
  glow?.dispose();
  glow = undefined;
}
