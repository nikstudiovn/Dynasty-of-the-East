import * as THREE from "three";

export type Surface = "tile" | "glaze" | "lacquer" | "teak" | "plaster" | "stone" | "thatch" | "silk" | "lattice";

interface SurfaceMaps {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

const size = 128;
const surfaces = new Map<Surface, SurfaceMaps>();
let glow: THREE.CanvasTexture | undefined;

function canvasTexture(paint: (ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D) => void, color = false) {
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
      case "lattice":
        h = (x % 32 < 4 || y % 32 < 4) ? 0.2 : 0.92 - Math.hypot(u - 0.5, v - 0.5) * 0.36;
        break;
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
    map: canvasTexture(paint("color"), true),
    bumpMap: canvasTexture(paint("height")),
    roughnessMap: canvasTexture(paint("roughness"))
  };
  surfaces.set(kind, maps);
  return maps;
}

export function softMask(): THREE.CanvasTexture {
  return glow ??= canvasTexture(ctx => {
    const half = size / 2;
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, "rgba(255,255,255,0.95)");
    gradient.addColorStop(0.4, "rgba(255,255,255,0.46)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  });
}

export function disposeSurfaceMaps(): void {
  for (const maps of surfaces.values()) for (const texture of Object.values(maps)) texture.dispose();
  surfaces.clear();
  glow?.dispose();
  glow = undefined;
}
