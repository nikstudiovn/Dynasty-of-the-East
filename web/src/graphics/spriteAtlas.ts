// Pixel Dynasty — baked 16-bit sprite atlas.
// Every unit/building sprite is drawn ONCE (procedurally, 3-tone shading + 1px #1A120E outline) into
// a single offscreen sheet. The render loop only calls ctx.drawImage on sheet rectangles, so there
// are no canvas allocations while the game runs. Cache key: type + colour + age + frame.

const OUT = "#1A120E";
const SHEET_W = 2048;
const SHEET_H = 1024;
const SKIN = "#E8B98A";
const GOLD = "#F6C453";
const STEEL = "#8A94A3";
const WOOD = "#8A5A2B";

export interface Sprite { sx: number; sy: number; w: number; h: number; ax: number; ay: number; }

export const UNIT_TYPES = ["villager", "swordsman", "spearman", "archer", "chuko_nu", "cavalry", "horse_archer", "war_elephant", "catapult"];
export const BUILDING_TYPES = ["town_center", "house", "depot", "farm", "barracks", "archery_range", "watch_tower", "blacksmith", "stable", "siege_workshop", "imperial_citadel"];
const AGED = { town_center: 1, house: 1 } as Record<string, number>;
const UNIT_SIZE: Record<string, number> = { villager: 32, swordsman: 32, spearman: 32, archer: 32, chuko_nu: 32, cavalry: 48, horse_archer: 48, war_elephant: 48, catapult: 48 };
const BLDG_DIM: Record<string, [number, number]> = {
  town_center: [88, 96], house: [64, 64], depot: [64, 64], farm: [64, 40], barracks: [88, 80], archery_range: [88, 80],
  watch_tower: [64, 88], blacksmith: [88, 76], stable: [88, 80], siege_workshop: [88, 84], imperial_citadel: [88, 100]
};
export const UNIT_FRAMES = 3; // 0 idle, 1 walk-A, 2 walk-B

// ------------------------------------------------------------------ colour helpers
const toneCache = new Map<string, [string, string, string]>();
function hex2rgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mixTo(rgb: [number, number, number], to: [number, number, number], t: number) {
  const c = (i: number) => Math.round(rgb[i] + (to[i] - rgb[i]) * t);
  return `rgb(${c(0)},${c(1)},${c(2)})`;
}
function tones(base: string): [string, string, string] {
  let t = toneCache.get(base);
  if (!t) {
    const rgb = hex2rgb(base);
    t = [mixTo(rgb, [26, 18, 14], 0.42), base, mixTo(rgb, [255, 244, 214], 0.32)];
    toneCache.set(base, t);
  }
  return t;
}

// ------------------------------------------------------------------ scratch drawing
let sheet: HTMLCanvasElement;
let sctx: CanvasRenderingContext2D;
let scratch: HTMLCanvasElement;
let g: CanvasRenderingContext2D;
let curX = 0, curY = 0, rowH = 0;
const map = new Map<string, Sprite>();
export let ready = false;

function R(x: number, y: number, w: number, h: number, c: string) {
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
/** 3-tone box: light top/left, mid body, dark right/bottom. */
function T3(x: number, y: number, w: number, h: number, base: string) {
  const [d, m, l] = tones(base);
  R(x, y, w, h, m);
  R(x, y, w, Math.max(1, Math.floor(h / 4)), l);
  R(x, y, 1, h, l);
  R(x + w - Math.max(1, Math.floor(w / 4)), y + 1, Math.max(1, Math.floor(w / 4)), h - 1, d);
  R(x, y + h - 1, w, 1, d);
}
function poly(pts: number[], c: string) {
  g.fillStyle = c;
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  g.fill();
}
function disc(cx: number, cy: number, r: number, c: string) {
  g.fillStyle = c;
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
}
function block(x: number, y: number, w: number, h: number, base: string, d = 6) {
  T3(x, y, w, h, base);
  if (d > 0) poly([x + w, y, x + w + d, y - d / 2, x + w + d, y + h - d / 2, x + w, y + h], tones(base)[0]);
}

// ------------------------------------------------------------------ units
interface Hum { cloth: string; pants: string; hat: string; weapon: string; shield?: boolean; armor?: boolean; legs?: boolean; hatCol?: string; }

function humanoid(o: Hum, f: number, ox: number, oy: number) {
  const b = f === 1 ? -1 : 0;
  if (o.legs !== false) {
    if (f === 0) { T3(ox + 12, oy + 22, 4, 6, o.pants); T3(ox + 17, oy + 22, 4, 6, o.pants); }
    else if (f === 1) { T3(ox + 10, oy + 22, 4, 6, o.pants); T3(ox + 18, oy + 22, 4, 5, o.pants); }
    else { T3(ox + 13, oy + 22, 4, 5, o.pants); T3(ox + 19, oy + 22, 4, 6, o.pants); }
    R(ox + (f === 1 ? 10 : f === 2 ? 13 : 12), oy + 27, 4, 1, "#2B1D14");
    R(ox + (f === 1 ? 18 : f === 2 ? 19 : 17), oy + (f === 1 ? 26 : 27), 4, 1, "#2B1D14");
  }
  if (o.shield) { T3(ox + 5, oy + 14 + b, 6, 9, "#7C2D12"); R(ox + 7, oy + 17 + b, 2, 2, GOLD); }
  T3(ox + 11, oy + 12 + b, 10, 11, o.cloth);
  R(ox + 11, oy + 19 + b, 10, 2, "#C9A227");
  if (o.armor) T3(ox + 12, oy + 13 + b, 8, 6, STEEL);
  T3(ox + 8, oy + 14 + b, 3, 7, o.cloth);
  T3(ox + 21, oy + 14 + b + (f === 2 ? -1 : 0), 3, 7, o.cloth);
  R(ox + 8, oy + 20 + b, 3, 2, SKIN);
  R(ox + 21, oy + 20 + b + (f === 2 ? -1 : 0), 3, 2, SKIN);
  T3(ox + 12, oy + 5 + b, 8, 8, SKIN);
  R(ox + 17, oy + 8 + b, 1, 2, OUT);
  // hats
  const hy = oy + b;
  if (o.hat === "straw") {
    poly([ox + 5, hy + 10, ox + 16, hy + 1, ox + 27, hy + 10], "#8F6D2A");
    poly([ox + 7, hy + 9, ox + 16, hy + 2, ox + 25, hy + 9], "#C9A04A");
    poly([ox + 8, hy + 8, ox + 15, hy + 3, ox + 17, hy + 8], "#E8CB78");
  } else if (o.hat === "kettle") {
    T3(ox + 11, hy + 2, 10, 6, STEEL);
    R(ox + 10, hy + 7, 12, 2, tones(STEEL)[0]);
    R(ox + 15, hy, 2, 3, "#DC2626");
  } else if (o.hat === "cap") {
    T3(ox + 11, hy + 3, 10, 4, o.hatCol || "#374151");
    R(ox + 12, hy + 6, 8, 1, GOLD);
    R(ox + 14, hy + 1, 4, 3, o.hatCol || "#374151");
  } else if (o.hat === "hood") {
    T3(ox + 11, hy + 3, 10, 7, o.hatCol || "#3F6B3A");
    R(ox + 12, hy + 6, 7, 4, SKIN);
    R(ox + 17, hy + 8, 1, 2, OUT);
  }
  // weapons
  const w = o.weapon;
  if (w === "hoe") {
    R(ox + 24, oy + 8 + b, 2, 15, WOOD); R(ox + 24, oy + 7 + b, 6, 2, STEEL); R(ox + 24, oy + 7 + b, 6, 1, "#E5E7EB");
  } else if (w === "sword") {
    R(ox + 24, oy + 8 + b, 2, 11, "#E5E7EB"); R(ox + 24, oy + 8 + b, 1, 11, "#FFFFFF");
    R(ox + 23, oy + 19 + b, 4, 1, GOLD); R(ox + 24, oy + 20 + b, 2, 2, "#5C3A1A");
  } else if (w === "spear") {
    R(ox + 25, oy + 4, 2, 24, WOOD); R(ox + 25, oy + 1, 2, 4, "#E5E7EB"); R(ox + 24, oy + 6, 4, 2, "#DC2626");
  } else if (w === "bow") {
    R(ox + 24, oy + 8 + b, 1, 2, "#6B4423"); R(ox + 25, oy + 10 + b, 1, 6, "#8A5A2B"); R(ox + 24, oy + 16 + b, 1, 2, "#6B4423");
    R(ox + 23, oy + 9 + b, 1, 9, "#E5E7EB");
  } else if (w === "crossbow") {
    R(ox + 21, oy + 15 + b, 9, 2, "#6B4423"); R(ox + 26, oy + 11 + b, 2, 10, WOOD); R(ox + 25, oy + 12 + b, 1, 8, "#E5E7EB"); R(ox + 22, oy + 14 + b, 2, 1, GOLD);
  } else if (w === "lance") {
    R(ox + 25, oy + 2, 2, 24, "#B45309"); R(ox + 25, oy, 2, 3, "#E5E7EB"); R(ox + 24, oy + 5, 4, 3, "#DC2626");
  }
}

function drawUnitSprite(type: string, color: string, f: number) {
  const tc = tones(color);
  if (type === "villager") humanoid({ cloth: color, pants: "#6B4F2A", hat: "straw", weapon: "hoe" }, f, 0, 1);
  else if (type === "swordsman") humanoid({ cloth: color, pants: "#3F3A36", hat: "kettle", weapon: "sword", shield: true, armor: true }, f, 0, 1);
  else if (type === "spearman") humanoid({ cloth: color, pants: "#4B3B2A", hat: "cap", hatCol: "#6B7280", weapon: "spear", armor: true }, f, 0, 1);
  else if (type === "archer") humanoid({ cloth: color, pants: "#3B4A2A", hat: "hood", weapon: "bow" }, f, 0, 1);
  else if (type === "chuko_nu") humanoid({ cloth: color, pants: "#2B3A4F", hat: "cap", hatCol: "#1F3D5C", weapon: "crossbow" }, f, 0, 1);
  else if (type === "cavalry" || type === "horse_archer") {
    const horse = type === "cavalry" ? "#7A4A22" : "#8A7A5A";
    const mane = "#2B1D14";
    const b = f === 1 ? -1 : 0;
    const gait = f === 0 ? [0, 0, 0, 0] : f === 1 ? [2, -2, -2, 2] : [-2, 2, 2, -2];
    // legs (far pair first)
    const lx = [9, 14, 25, 30];
    for (let i = 0; i < 4; i++) T3(lx[i] + gait[i], 34 + b, 3, 10 - (gait[i] < 0 ? 2 : 0), i % 2 ? tones(horse)[0] : horse);
    T3(8, 24 + b, 24, 10, horse);
    poly([30, 26 + b, 36, 16 + b, 41, 19 + b, 36, 31 + b], tones(horse)[1]);
    T3(36, 14 + b, 8, 6, horse);
    R(43, 17 + b, 3, 3, tones(horse)[2]);
    R(41, 16 + b, 1, 1, OUT);
    R(37, 11 + b, 2, 4, mane); R(30, 17 + b, 3, 10, mane);
    R(4, 25 + b + (f === 2 ? 1 : 0), 4, 8, mane);
    T3(15, 22 + b, 11, 5, color);
    humanoid({ cloth: color, pants: "#3F3A36", hat: type === "cavalry" ? "kettle" : "cap", hatCol: "#7C2D12", weapon: type === "cavalry" ? "lance" : "bow", armor: true, legs: false }, f === 1 ? 0 : 0, 6, 1 + b);
  } else if (type === "war_elephant") {
    const grey = "#6B7280";
    const gait = f === 0 ? [0, 0, 0, 0] : f === 1 ? [2, -2, -2, 2] : [-2, 2, 2, -2];
    const b = f === 1 ? -1 : 0;
    const lx = [8, 15, 27, 34];
    for (let i = 0; i < 4; i++) T3(lx[i] + gait[i], 34 + b, 6, 11 - (gait[i] < 0 ? 2 : 0), i % 2 ? "#4B5563" : "#5B6270");
    T3(6, 17 + b, 32, 20, grey);
    T3(32, 14 + b, 11, 15, grey);
    T3(30, 19 + b, 5, 11, "#59606D");
    R(41, 20 + b, 1, 2, OUT);
    R(39, 28 + b, 5, 9, grey); R(40, 28 + b, 2, 9, tones(grey)[2]);
    R(41, 36 + b + (f === 2 ? 1 : 0), 5, 3, grey);
    R(41, 27 + b, 5, 2, "#F5F0DC");
    T3(9, 21 + b, 24, 9, color); R(9, 29 + b, 24, 1, GOLD);
    T3(12, 11 + b, 19, 7, "#7C2D12");
    poly([10, 11 + b, 21, 2 + b, 33, 11 + b], tc[1]); poly([13, 10 + b, 21, 4 + b, 24, 10 + b], tc[2]);
    R(16, 8 + b, 4, 4, SKIN); R(24, 8 + b, 4, 4, SKIN);
    R(30, 0 + b + 1, 1, 12, WOOD); R(31, 1 + b, 6, 4, color);
  } else if (type === "catapult") {
    const wood = "#7A4A22";
    const b = 0;
    T3(8, 29, 32, 5, wood);
    T3(19, 15, 3, 15, "#8A5A2B"); T3(27, 15, 3, 15, "#8A5A2B");
    const swing = f === 0 ? 0 : f === 1 ? 2 : -2;
    poly([24, 17, 12 + swing, 4, 15 + swing, 2, 27, 16], tones("#A06A32")[1]);
    poly([24, 17, 12 + swing, 4, 13 + swing, 3, 25, 16], tones("#A06A32")[2]);
    T3(8 + swing, 1, 8, 5, "#6B4423");
    disc(12 + swing, 1, 0, wood);
    T3(28, 14, 8, 6, "#57534E");
    for (let i = 0; i < 2; i++) {
      const cx = i ? 33 : 15;
      disc(cx, 38, 6, OUT); disc(cx, 38, 5, "#8A5A2B"); disc(cx, 38, 3, "#B77A3C"); disc(cx, 38, 1, OUT);
      const a = f * 0.6;
      g.strokeStyle = OUT; g.lineWidth = 1;
      g.beginPath(); g.moveTo(cx - Math.cos(a) * 5, 38 - Math.sin(a) * 5); g.lineTo(cx + Math.cos(a) * 5, 38 + Math.sin(a) * 5);
      g.moveTo(cx + Math.sin(a) * 5, 38 - Math.cos(a) * 5); g.lineTo(cx - Math.sin(a) * 5, 38 + Math.cos(a) * 5); g.stroke();
    }
    R(24, 22, 6, 4, color); R(24, 22, 6, 1, tc[2]);
    void b;
  }
}

// ------------------------------------------------------------------ buildings
function gableRoof(cx: number, by: number, hw: number, rows: number, base: string, trim: string, thatch: boolean) {
  const [d, m, l] = tones(base);
  for (let i = 0; i < rows; i++) {
    const w = Math.max(6, Math.round(hw * 2 * (1 - (i / (rows + 1.6)) * 0.85)));
    const y = by - (i + 1) * 2;
    const x = cx - (w >> 1);
    R(x, y, w, 2, m);
    R(x, y, w, 1, l);
    R(x + w - 2, y, 2, 2, d);
    const off = (i % 2) * 2;
    for (let sx = x + 2 + off; sx < x + w - 2; sx += 4) R(sx, y + 1, 1, 1, d);
  }
  R(cx - hw - 2, by - 1, hw * 2 + 4, 2, d);
  if (!thatch) {
    R(cx - hw - 5, by - 3, 6, 2, m); R(cx - hw - 7, by - 5, 3, 2, trim);
    R(cx + hw - 1, by - 3, 6, 2, m); R(cx + hw + 4, by - 5, 3, 2, trim);
    R(cx - 4, by - rows * 2 - 2, 8, 2, trim);
  } else {
    R(cx - 2, by - rows * 2 - 1, 4, 2, tones("#B8923A")[0]);
  }
}

interface Pag { cx: number; y0: number; w: number; wallH: number; tiers: number; wall: string; roof: string; thatch: boolean; lanterns?: boolean; }
function pagoda(p: Pag) {
  let y = p.y0;
  block(p.cx - p.w / 2 - 3, y - 4, p.w + 6, 4, "#8B8780", 0);
  y -= 4;
  for (let t = 0; t < p.tiers; t++) {
    const tw = Math.round(p.w * (1 - 0.26 * t));
    const th = t === 0 ? p.wallH : Math.max(9, p.wallH - 9 - t);
    block(p.cx - tw / 2, y - th, tw, th, p.wall, 5);
    R(p.cx - tw / 2 + 1, y - th, 2, th, "#8C2B1F");
    R(p.cx + tw / 2 - 3, y - th, 2, th, "#8C2B1F");
    if (t === 0) {
      T3(p.cx - 4, y - 12, 8, 12, "#3B2412");
      R(p.cx - 5, y - 13, 10, 1, GOLD);
      R(p.cx - 12, y - th + 5, 4, 4, OUT); R(p.cx + 8, y - th + 5, 4, 4, OUT);
      if (p.lanterns) { R(p.cx - 9, y - 12, 3, 4, "#DC2626"); R(p.cx + 6, y - 12, 3, 4, "#DC2626"); R(p.cx - 8, y - 11, 1, 2, "#FEF08A"); R(p.cx + 7, y - 11, 1, 2, "#FEF08A"); }
    } else {
      R(p.cx - 3, y - th + 3, 6, 4, OUT); R(p.cx - 3, y - th + 3, 6, 1, GOLD);
    }
    y -= th;
    const rows = [5, 4, 3, 3][t];
    gableRoof(p.cx, y + 1, Math.round(tw / 2 + 5), rows, p.roof, GOLD, p.thatch);
    y -= rows * 2 - 2;
  }
}

function drawBuildingSprite(type: string, color: string, age: number, W: number, H: number) {
  const y0 = H - 5, cx = W >> 1;
  const thatchCol = "#D4B25A";
  const roofCol = age <= 1 ? thatchCol : color;
  switch (type) {
    case "town_center": {
      const tiers = age <= 2 ? 1 : age === 3 ? 2 : 3;
      pagoda({ cx, y0, w: 54, wallH: 22, tiers, wall: age <= 1 ? "#A9824A" : "#CDB98E", roof: roofCol, thatch: age <= 1, lanterns: age >= 3 });
      if (age >= 2) { for (let i = 0; i < 3; i++) R(cx - 8 + i * 0, y0 - 1 - i, 16 + i * 4, 1, "#A8A39A"); }
      break;
    }
    case "house": {
      pagoda({ cx, y0, w: 28, wallH: age >= 2 ? 15 : 12, tiers: age >= 3 ? 2 : 1, wall: age <= 1 ? "#A9824A" : "#CDB98E", roof: roofCol, thatch: age <= 1, lanterns: age >= 4 });
      break;
    }
    case "depot": {
      R(14, y0 - 10, 3, 10, "#5C3A1A"); R(46, y0 - 10, 3, 10, "#5C3A1A"); R(30, y0 - 10, 3, 10, "#5C3A1A");
      T3(11, y0 - 16, 42, 6, WOOD);
      block(13, y0 - 36, 36, 20, "#9C7A47", 5);
      T3(26, y0 - 28, 10, 12, "#3B2412");
      gableRoof(cx - 1, y0 - 34, 25, 8, thatchCol, GOLD, true);
      T3(44, y0 - 8, 9, 8, "#D9C7A0"); T3(36, y0 - 6, 8, 6, "#C7B48A");
      break;
    }
    case "farm": {
      const P = (u: number, v: number): [number, number] => [32 + (u - v) * 29, 6 + (u + v) * 14];
      const quadAt = (u0: number, v0: number, u1: number, v1: number, c: string) => {
        const a = P(u0, v0), b = P(u1, v0), c2 = P(u1, v1), d = P(u0, v1);
        poly([a[0], a[1], b[0], b[1], c2[0], c2[1], d[0], d[1]], c);
      };
      quadAt(0, 0, 1, 1, "#5C3A1A");
      for (let k = 0; k < 5; k++) {
        quadAt(0.07, 0.07 + k * 0.17, 0.93, 0.07 + k * 0.17 + 0.12, k % 2 ? "#9CCC65" : "#7CB342");
        quadAt(0.07, 0.07 + k * 0.17, 0.93, 0.07 + k * 0.17 + 0.03, "#D9E88A");
      }
      for (let k = 0; k < 6; k++) { const p = P(0.15 + k * 0.14, 0.2 + (k % 3) * 0.25); R(p[0], p[1], 2, 1, "#E6C65A"); }
      break;
    }
    case "barracks": {
      block(cx - 31, y0 - 26, 62, 26, "#B5A180", 6);
      R(cx - 30, y0 - 26, 2, 26, "#8C2B1F"); R(cx + 28, y0 - 26, 2, 26, "#8C2B1F");
      T3(cx - 8, y0 - 18, 16, 18, "#3B2412"); R(cx, y0 - 18, 1, 18, OUT); R(cx - 9, y0 - 19, 18, 1, GOLD);
      R(cx - 24, y0 - 20, 6, 5, OUT); R(cx + 18, y0 - 20, 6, 5, OUT);
      gableRoof(cx + 2, y0 - 25, 34, 8, color, GOLD, false);
      for (let i = 0; i < 3; i++) { R(cx + 31 + i * 3, y0 - 18, 1, 18, WOOD); R(cx + 30 + i * 3, y0 - 20, 3, 3, "#E5E7EB"); }
      break;
    }
    case "archery_range": {
      T3(cx - 28, y0 - 30, 56, 30, "#2B1D14");
      block(cx - 30, y0 - 6, 60, 6, "#8B8780", 0);
      for (const px of [-30, -12, 10, 28]) T3(cx + px, y0 - 30, 3, 28, "#8C2B1F");
      gableRoof(cx, y0 - 30, 33, 7, color, GOLD, false);
      for (const sx of [-20, 18]) {
        R(cx + sx, y0 - 9, 2, 9, "#5C3A1A"); disc(cx + sx + 1, y0 - 16, 8, OUT); disc(cx + sx + 1, y0 - 16, 7, "#F3E9CF");
        disc(cx + sx + 1, y0 - 16, 5, "#DC2626"); disc(cx + sx + 1, y0 - 16, 3, "#F3E9CF"); disc(cx + sx + 1, y0 - 16, 1, "#DC2626");
      }
      break;
    }
    case "watch_tower": {
      block(cx - 14, y0 - 32, 28, 32, "#8B7D6B", 5);
      R(cx - 3, y0 - 20, 6, 20, "#3B2412"); R(cx - 3, y0 - 22, 6, 3, OUT);
      R(cx - 8, y0 - 28, 2, 6, OUT);
      block(cx - 11, y0 - 50, 22, 18, "#A8895A", 4);
      R(cx - 3, y0 - 44, 6, 6, OUT); R(cx - 3, y0 - 44, 6, 1, GOLD);
      T3(cx - 15, y0 - 52, 30, 4, "#6B4423");
      for (const px of [-14, -6, 2, 10]) R(cx + px, y0 - 58, 2, 6, "#5C3A1A");
      gableRoof(cx, y0 - 58, 20, 6, color, GOLD, false);
      break;
    }
    case "blacksmith": {
      block(cx - 30, y0 - 24, 54, 24, "#7B7670", 6);
      block(cx + 12, y0 - 44, 10, 22, "#57524D", 3);
      R(cx + 11, y0 - 46, 12, 2, tones("#57524D")[0]);
      T3(cx - 24, y0 - 17, 18, 17, "#2A1A12");
      R(cx - 21, y0 - 12, 12, 10, "#DC2626"); R(cx - 19, y0 - 11, 8, 8, "#F97316"); R(cx - 17, y0 - 8, 4, 5, "#FEF08A");
      gableRoof(cx - 4, y0 - 23, 31, 6, "#5B544D", color, false);
      T3(cx + 28, y0 - 9, 11, 5, "#4B5563"); R(cx + 30, y0 - 12, 7, 3, "#9CA3AF"); R(cx + 33, y0 - 4, 3, 4, "#374151");
      break;
    }
    case "stable": {
      block(cx - 30, y0 - 26, 58, 26, "#9B7040", 6);
      T3(cx - 20, y0 - 20, 30, 20, "#2B1D14");
      R(cx - 18, y0 - 6, 26, 6, "#D4B25A"); R(cx - 16, y0 - 8, 12, 3, "#E6CC72");
      T3(cx - 6, y0 - 18, 9, 9, "#6B3F1D"); R(cx - 4, y0 - 20, 2, 3, "#6B3F1D"); R(cx + 1, y0 - 20, 2, 3, "#6B3F1D"); R(cx + 1, y0 - 14, 1, 1, OUT);
      gableRoof(cx, y0 - 25, 33, 7, color, GOLD, false);
      T3(cx + 26, y0 - 9, 10, 9, "#D4B25A"); T3(cx + 32, y0 - 6, 8, 6, "#C9A34A");
      break;
    }
    case "siege_workshop": {
      block(cx - 36, y0 - 26, 46, 26, "#8A6A3E", 6);
      T3(cx - 26, y0 - 18, 16, 18, "#2B1D14");
      disc(cx - 18, y0 - 9, 7, OUT); disc(cx - 18, y0 - 9, 6, "#6B4423"); disc(cx - 18, y0 - 9, 2, OUT);
      gableRoof(cx - 9, y0 - 25, 27, 7, color, GOLD, false);
      T3(cx + 18, y0 - 6, 22, 5, "#7A4A22");
      T3(cx + 24, y0 - 26, 3, 21, "#8A5A2B"); T3(cx + 33, y0 - 26, 3, 21, "#8A5A2B");
      poly([cx + 29, y0 - 22, cx + 20, y0 - 34, cx + 23, y0 - 36, cx + 32, y0 - 24], "#A06A32");
      T3(cx + 17, y0 - 38, 8, 5, "#6B4423");
      disc(cx + 22, y0 - 3, 4, OUT); disc(cx + 22, y0 - 3, 3, "#8A5A2B"); disc(cx + 36, y0 - 3, 4, OUT); disc(cx + 36, y0 - 3, 3, "#8A5A2B");
      break;
    }
    case "imperial_citadel": {
      block(6, y0 - 26, 74, 26, "#9A958C", 0);
      R(6, y0 - 26, 74, 1, tones("#9A958C")[2]);
      for (let x = 6; x < 80; x += 8) T3(x, y0 - 30, 5, 4, "#9A958C");
      T3(cx - 7, y0 - 18, 14, 18, "#2A1A12"); poly([cx - 7, y0 - 18, cx, y0 - 24, cx + 7, y0 - 18], OUT); R(cx - 8, y0 - 19, 16, 1, GOLD);
      block(8, y0 - 40, 12, 14, "#8C877E", 3); gableRoof(14, y0 - 39, 6, 4, color, GOLD, false);
      block(66, y0 - 40, 12, 14, "#8C877E", 3); gableRoof(72, y0 - 39, 6, 4, color, GOLD, false);
      pagoda({ cx, y0: y0 - 27, w: 40, wallH: 14, tiers: 3, wall: "#DCCDA4", roof: color, thatch: false, lanterns: true });
      break;
    }
  }
}

// ------------------------------------------------------------------ packing + baking
function outlinePass(w: number, h: number) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (d[i * 4 + 3] >= 110) { solid[i] = 1; d[i * 4 + 3] = 255; } else d[i * 4 + 3] = 0;
  }
  const [or, og, ob] = hex2rgb(OUT);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (solid[i]) continue;
      if ((x > 0 && solid[i - 1]) || (x < w - 1 && solid[i + 1]) || (y > 0 && solid[i - w]) || (y < h - 1 && solid[i + w])) {
        d[i * 4] = or; d[i * 4 + 1] = og; d[i * 4 + 2] = ob; d[i * 4 + 3] = 255;
      }
    }
  }
  g.putImageData(img, 0, 0);
}

function bake(key: string, w: number, h: number, ax: number, ay: number, art: () => void): Sprite | null {
  if (curX + w > SHEET_W) { curX = 0; curY += rowH; rowH = 0; }
  if (curY + h > SHEET_H) return null;
  g.clearRect(0, 0, scratch.width, scratch.height);
  g.save();
  g.imageSmoothingEnabled = false;
  art();
  g.restore();
  outlinePass(w, h);
  sctx.drawImage(scratch, 0, 0, w, h, curX, curY, w, h);
  const spr: Sprite = { sx: curX, sy: curY, w, h, ax, ay };
  curX += w; rowH = Math.max(rowH, h);
  map.set(key, spr);
  return spr;
}

function keyOf(type: string, color: string, age: number, frame: number) { return type + "|" + color + "|" + age + "|" + frame; }

function bakeOne(type: string, color: string, age: number, frame: number): Sprite | null {
  const k = keyOf(type, color, age, frame);
  const hit = map.get(k);
  if (hit) return hit;
  const us = UNIT_SIZE[type];
  if (us) return bake(k, us, us, us >> 1, (us === 32 ? 29 : type === "war_elephant" ? 45 : 44) + 1, () => { g.translate(0, 1); drawUnitSprite(type, color, frame); });
  const dim = BLDG_DIM[type];
  if (dim) return bake(k, dim[0], dim[1], dim[0] >> 1, dim[1] - 5, () => drawBuildingSprite(type, color, age, dim[0], dim[1]));
  return null;
}

/** Bakes every sprite for the given team colours. Call once at game start (not in the render loop). */
export function prepare(colors: string[]): void {
  if (typeof document === "undefined") return;
  if (!sheet) {
    sheet = document.createElement("canvas"); sheet.width = SHEET_W; sheet.height = SHEET_H;
    sctx = sheet.getContext("2d")!; sctx.imageSmoothingEnabled = false;
    scratch = document.createElement("canvas"); scratch.width = 96; scratch.height = 112;
    g = scratch.getContext("2d", { willReadFrequently: true })!; g.imageSmoothingEnabled = false;
  }
  for (const color of colors) {
    for (const t of UNIT_TYPES) for (let f = 0; f < UNIT_FRAMES; f++) bakeOne(t, color, 1, f);
    for (const t of BUILDING_TYPES) {
      if (AGED[t]) for (let a = 1; a <= 4; a++) bakeOne(t, color, a, 0);
      else bakeOne(t, color, 1, 0);
    }
  }
  ready = true;
}

/** Cache lookup (type + colour + age + frame). Never allocates a canvas; bakes into the sheet only on a miss. */
export function getSprite(type: string, color: string, age: number, frame: number): Sprite | null {
  const a = AGED[type] ? Math.max(1, Math.min(4, age)) : 1;
  const f = UNIT_SIZE[type] ? frame : 0;
  const hit = map.get(keyOf(type, color, a, f));
  if (hit) return hit;
  return ready ? bakeOne(type, color, a, f) : null;
}

export function drawSprite(ctx: CanvasRenderingContext2D, s: Sprite, x: number, groundY: number, flip: boolean): void {
  const dx = Math.round(x - s.ax), dy = Math.round(groundY - s.ay);
  if (!flip) { ctx.drawImage(sheet, s.sx, s.sy, s.w, s.h, dx, dy, s.w, s.h); return; }
  ctx.save();
  ctx.translate(Math.round(x), 0);
  ctx.scale(-1, 1);
  ctx.drawImage(sheet, s.sx, s.sy, s.w, s.h, -s.ax, dy, s.w, s.h);
  ctx.restore();
}

// ------------------------------------------------------------------ unit animation state (no per-frame allocation after first sight)
interface Track { x: number; y: number; until: number; }
const tracks = new WeakMap<object, Track>();

/** Updates u.facing (+1 right / -1 left) and returns the frame: 0 idle, 1/2 walking. */
export function unitFrame(u: any, nowMs: number): number {
  let t = tracks.get(u);
  if (!t) { t = { x: u.x, y: u.y, until: 0 }; tracks.set(u, t); if (u.facing === undefined) u.facing = 1; }
  const dx = u.x - t.x, dy = u.y - t.y;
  if (dx * dx + dy * dy > 1e-6) {
    const sx = dx - dy; // screen-space horizontal direction in isometric view
    if (Math.abs(sx) > 1e-4) u.facing = sx >= 0 ? 1 : -1;
    t.until = nowMs + 140;
  }
  t.x = u.x; t.y = u.y;
  if (nowMs > t.until) return 0;
  return 1 + (Math.floor(nowMs / 150 + (u.id | 0)) & 1);
}
