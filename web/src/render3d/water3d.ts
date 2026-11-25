import * as THREE from "three";

function waveNormals(): THREE.DataTexture {
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * Math.PI * 2, v = y / size * Math.PI * 2;
    const wave = Math.cos(3 * u + 2 * v + Math.sin(v) * 0.8);
    const crossing = Math.cos(-2 * u + 5 * v);
    const dx = wave * 0.16 - crossing * 0.078, dy = wave * 0.12 + crossing * 0.14;
    const k = 1 / Math.hypot(dx, dy, 1);
    const i = (y * size + x) * 4;
    pixels.set([(0.5 + dx * k * 0.5) * 255, (0.5 + dy * k * 0.5) * 255, (0.5 + k * 0.5) * 255, 255], i);
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export class WaterSurface {
  private readonly normalMap = waveNormals();
  private readonly uniforms = {
    pdWaves: { value: this.normalMap },
    pdWaterTime: { value: 0 },
    pdWaterLayers: { value: 1 },
    pdWaterRain: { value: 0 },
    pdDeep: { value: new THREE.Color("#101e24") },
    pdBank: { value: new THREE.Color("#1c3138") }
  };

  // Standard lighting supplies direct sun specular and the scene's PMREM sky reflection.
  readonly material = new THREE.MeshPhysicalMaterial({
    transparent: true, depthWrite: false, roughness: 0.19, ior: 1.33,
    specularIntensity: 1.0, envMapIntensity: 1.2
  });

  constructor() {
    this.material.customProgramCacheKey = () => "dote-water-pbr";
    this.material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = `attribute float aDepth, aPier, aShallow;
        varying vec3 vWaterBed;
        varying vec2 vWaterUV;
      ` + shader.vertexShader.replace("#include <begin_vertex>",
        "#include <begin_vertex>\nvWaterBed = vec3(aDepth, aPier, aShallow); vWaterUV = position.xz;");
      shader.fragmentShader = `
        varying vec3 vWaterBed;
        varying vec2 vWaterUV;
        uniform sampler2D pdWaves;
        uniform float pdWaterTime, pdWaterLayers, pdWaterRain;
        uniform vec3 pdDeep, pdBank;
        float pdWaterHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      ` + shader.fragmentShader
        .replace("#include <color_fragment>", `
          #include <color_fragment>
          if (vWaterBed.x < -0.008) discard;
          float shallow = smoothstep(0.1, 0.66, vWaterBed.z);
          float deep = smoothstep(0.03, 0.40, vWaterBed.x);
          vec2 wuv = vWaterUV * 0.48 + vec2(0.046, -0.03) * pdWaterTime;
          vec2 slopeWater = (texture2D(pdWaves, wuv).rg * 2.0 - 1.0) * 0.58;
          if (pdWaterLayers > 1.5) {
            vec2 uv2 = vec2(vWaterUV.y, -vWaterUV.x) * 0.71 + vec2(-0.032, 0.042) * pdWaterTime;
            vec2 wave2 = texture2D(pdWaves, uv2).rg * 2.0 - 1.0;
            slopeWater += vec2(-wave2.y, wave2.x) * 0.38;
          }
          float wash = 0.65 + 1.9 * slopeWater.x;
          float foam = (1.0 - smoothstep(0.013, 0.078, vWaterBed.x)) *
            smoothstep(0.63, 0.95, wash) * (1.0 - shallow);
          foam += (1.0 - smoothstep(0.045, 0.16, vWaterBed.y)) * smoothstep(0.55, 0.95, wash);
          if (pdWaterLayers > 1.5 && pdWaterRain > 0.02) {
            vec2 cells = vWaterUV * 1.45;
            vec2 cell = floor(cells);
            float age = fract(pdWaterTime * 1.4 + pdWaterHash(cell));
            vec2 offset = fract(cells) - vec2(0.25 + 0.5 * pdWaterHash(cell + 17.0), 0.5);
            float ring = (1.0 - smoothstep(0.009, 0.032, abs(length(offset) - age * 0.25))) * (1.0 - age);
            slopeWater += offset * ring * pdWaterRain * 0.55;
          }
          diffuseColor.rgb = mix(mix(pdBank, pdDeep, deep), vec3(0.30, 0.35, 0.31), min(0.2, foam * 0.24));
          float edgeWater = smoothstep(-0.008, 0.045, vWaterBed.x);
          float viewFacing = max(dot(normalize(vViewPosition), mat3(viewMatrix) * vec3(0.0, 1.0, 0.0)), 0.0);
          float grazing = pow(1.0 - viewFacing, 4.0);
          diffuseColor.a *= edgeWater * mix(0.76 + deep * 0.24, 0.27 + grazing * 0.36 + foam * 0.12, shallow);
        `)
        .replace("#include <roughnessmap_fragment>", `
          #include <roughnessmap_fragment>
          roughnessFactor = mix(0.19, 0.31, shallow) + pdWaterRain * 0.10;`)
        .replace("#include <normal_fragment_maps>", `
          normal = normalize(mat3(viewMatrix) * vec3(slopeWater.x, 1.0, slopeWater.y));`);
    };
  }

  update(time: number, layers: number, rain: number): void {
    this.uniforms.pdWaterTime.value = time;
    this.uniforms.pdWaterLayers.value = layers;
    this.uniforms.pdWaterRain.value = rain;
  }

  dispose(): void {
    this.normalMap.dispose();
    this.material.dispose();
  }
}
