import * as THREE from "three";

const SIZE = 512;
const LAYERS = [
  { dark: [44, 47, 30], light: [110, 109, 67], rough: 0.86, relief: 0.55 },
  { dark: [42, 47, 49], light: [118, 121, 119], rough: 0.76, relief: 1.2 },
  { dark: [41, 32, 27], light: [103, 85, 69], rough: 0.43, relief: 0.34 },
  { dark: [52, 44, 36], light: [121, 104, 83], rough: 0.81, relief: 0.6 }
];

/** Integer hash in [0,1] shared by the procedural PBR texture generators. */
export function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x + seed, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Seamless value noise: tiles across [0,1) with nx × ny lattice cells. */
export function noise(u: number, v: number, nx: number, ny: number, seed: number): number {
  const x = Math.floor(u * nx), y = Math.floor(v * ny);
  const fx = u * nx - x, fy = v * ny - y;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const wrap = (n: number, size: number) => ((n % size) + size) % size;
  const sample = (dx: number, dy: number) => hash(wrap(x + dx, nx), wrap(y + dy, ny), seed);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(sample(0, 0), sample(1, 0), sx),
    THREE.MathUtils.lerp(sample(0, 1), sample(1, 1), sx), sy);
}

function makeArray(data: Uint8Array<ArrayBuffer>, albedo = false): THREE.DataArrayTexture {
  const texture = new THREE.DataArrayTexture(data, SIZE, SIZE, LAYERS.length);
  texture.colorSpace = albedo ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

type Detail = "low" | "medium" | "high";

export class TerrainPbr {
  private maps?: { albedo: THREE.DataArrayTexture; normal: THREE.DataArrayTexture; roughness: THREE.DataArrayTexture };

  private generate() {
    const count = SIZE * SIZE * LAYERS.length * 4;
    const albedo = new Uint8Array(count), normal = new Uint8Array(count), roughness = new Uint8Array(count);
    const height = new Float32Array(SIZE * SIZE);
    LAYERS.forEach(({ dark, light, rough, relief }, layer) => {
      const seed = 52 + layer * 17;
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        const u = x / SIZE, v = y / SIZE;
        const broad = noise(u, v, 7, 7, seed);
        const grain = noise(u, v, 96, 96, seed + 9);
        const grit = hash(x, y, seed + 2);
        const structure = layer === 1
          ? noise(u, v + 0.034 * Math.sin(u * Math.PI * 2), 9, 44, seed + 1)
          : noise(u, v, 36, 36, seed + 1);
        const pebble = Math.max(0, (grain - 0.68) * 3.1);
        const h = broad * 0.28 + structure * 0.42 + grain * 0.15 + grit * 0.045 + pebble * 0.16;
        height[y * SIZE + x] = h;
        const i = (layer * SIZE * SIZE + y * SIZE + x) * 4;
        const shade = THREE.MathUtils.clamp(h * 1.32, 0, 1);
        for (let c = 0; c < 3; c++) albedo[i + c] = THREE.MathUtils.lerp(dark[c], light[c], shade);
        albedo[i + 3] = roughness[i + 3] = normal[i + 3] = 255;
        roughness.fill(THREE.MathUtils.clamp(rough + (structure - 0.5) * 0.18 - pebble * 0.09, 0, 1) * 255, i, i + 3);
      }
      const at = (x: number, y: number) => height[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        const dx = (at(x - 1, y) - at(x + 1, y)) * relief * 2.7;
        const dy = (at(x, y - 1) - at(x, y + 1)) * relief * 2.7;
        const length = Math.hypot(dx, dy, 1);
        const i = (layer * SIZE * SIZE + y * SIZE + x) * 4;
        normal[i] = (0.5 + 0.5 * dx / length) * 255;
        normal[i + 1] = (0.5 + 0.5 * dy / length) * 255;
        normal[i + 2] = (0.5 + 0.5 / length) * 255;
      }
    });
    return { albedo: makeArray(albedo, true), normal: makeArray(normal), roughness: makeArray(roughness) };
  }

  bind(material: THREE.MeshStandardMaterial, detail: Detail, rain: { value: number }): void {
    const maps = this.maps ??= this.generate();
    material.customProgramCacheKey = () => `terrain-pbr-${detail}`;
    material.onBeforeCompile = shader => {
      shader.uniforms.pdAlbedo = { value: maps.albedo };
      shader.uniforms.pdNormal = { value: maps.normal };
      shader.uniforms.pdRoughness = { value: maps.roughness };
      shader.uniforms.pdRain = rain;
      shader.vertexShader = `attribute vec3 aGroundBlend;
        varying vec3 vGroundBlend;
        varying vec2 vGroundUV;
      ` + shader.vertexShader.replace("#include <begin_vertex>",
          "#include <begin_vertex>\nvGroundBlend = aGroundBlend; vGroundUV = position.xz * 0.72;");
      shader.fragmentShader = `precision highp sampler2DArray;
        uniform sampler2DArray pdAlbedo, pdNormal, pdRoughness;
        uniform float pdRain;
        varying vec3 vGroundBlend;
        varying vec2 vGroundUV;
        vec3 pdSample(sampler2DArray atlas, vec4 w) {
          vec2 dx = dFdx(vGroundUV), dy = dFdy(vGroundUV);
          vec3 result = vec3(0.0);
          for (int i = 0; i < 4; i++) {
            if (w[i] > 0.001) result += w[i] * textureGrad(atlas, vec3(vGroundUV, float(i)), dx, dy).rgb;
          }
          return result;
        }
      ` + shader.fragmentShader
        .replace("#include <map_fragment>", `
          float pad = clamp(vGroundBlend.z, 0.0, 1.0);
          float mud = clamp(vGroundBlend.y, 0.0, 1.0) * (1.0 - pad);
          float slate = clamp(vGroundBlend.x, 0.0, 1.0) * (1.0 - pad - mud);
          vec4 groundWeights = vec4(1.0 - pad - mud - slate, slate, mud, pad);
          diffuseColor.rgb *= pdSample(pdAlbedo, groundWeights);`)
        .replace("#include <roughnessmap_fragment>", `
          #include <roughnessmap_fragment>
          roughnessFactor = ${detail === "high" ? "pdSample(pdRoughness, groundWeights).g" : "dot(groundWeights, vec4(0.86, 0.76, 0.43, 0.81))"};
          roughnessFactor = max(0.2, roughnessFactor * (1.0 - pdRain * 0.44));`)
        .replace("#include <normal_fragment_maps>", detail === "low" ? "#include <normal_fragment_maps>" : `
          vec3 relief = pdSample(pdNormal, groundWeights) * 2.0 - 1.0;
          vec3 east = mat3(viewMatrix) * vec3(1.0, 0.0, 0.0);
          vec3 tangentGround = normalize(east - normal * dot(east, normal));
          vec3 south = cross(tangentGround, normal);
          normal = normalize(mat3(tangentGround, south, normal) * relief);`);
    };
    material.needsUpdate = true;
  }

  dispose(): void {
    if (!this.maps) return;
    Object.values(this.maps).forEach(texture => texture.dispose());
    this.maps = undefined;
  }
}
