import * as THREE from "three";

export const wind = {
  uTime: { value: 0 },
  uWindDir: { value: new THREE.Vector2(0.92, 0.39) },
  uWindStrength: { value: 0.085 }
};

export const chopWind = { value: Array.from({ length: 4 }, () => new THREE.Vector3()) };

export const grassUnits = { value: Array.from({ length: 12 }, () => new THREE.Vector4()) };

export type WindShape = "stalk" | "leaf" | "rice" | "flag" | "crown" | "canopy" | "grass";

export function applyWind(material: THREE.Material, shape: WindShape): void {
  const flag = shape === "flag";
  const height = shape === "leaf" ? "aWindLift + position.y * 0.5" :
    shape === "crown" ? "0.85 + position.y" :
    shape === "canopy" ? "max(position.y - 0.45, 0.0) * 0.9" : "max(position.y, 0.0) * length(instanceMatrix[1].xyz)";
  const bend = flag ? `
    vec2 anchor = modelMatrix[3].xz;
    float trailing = uv.x * uv.x;
    transformed.z += sin(uTime * 4.0 + uv.x * 6.0 + dot(anchor, vec2(0.8, 1.1))) *
      trailing * uWindStrength * (0.45 + abs(dot(uWindDir, normalize(modelMatrix[2].xz))));
    transformed.y -= trailing * 0.012;` : `
    #ifdef USE_INSTANCING
      vec2 anchor = (modelMatrix * instanceMatrix[3]).xz;
      float h = max(0.0, ${height});
      float gust = sin(uTime * 1.5 + dot(anchor, vec2(0.76, 0.48))) + 0.28 * sin(uTime * 3.7 + anchor.x);
      vec2 drift = uWindDir * gust * h * ${shape === "rice" ? "1.6" : "0.68"} * uWindStrength;
      ${shape === "stalk" || shape === "leaf" || shape === "canopy" ? `
      for (int i = 0; i < 4; ++i) {
        vec3 chop = uChop[i];
        drift.x += max(0.0, 1.0 - length(anchor - chop.xy)) * chop.z * sin(uTime * 35.0) * h * 0.13;
      }` : ""}
      ${shape === "grass" ? `
      float nearest = 0.60;
      vec2 side = vec2(0.0);
      for (int i = 0; i < 12; i++) {
        vec4 unit = uGrassUnits[i];
        if (unit.w <= 0.0) continue;
        vec2 gap = anchor - unit.xy;
        float dist = length(gap);
        if (dist < nearest) {
          nearest = dist;
          side = gap / max(dist, 0.04) * unit.w;
        }
      }
      drift += side * h * 0.72 * (1.0 - smoothstep(0.06, 0.60, nearest));
      ` : ""}
      transformed.xz += vec2(dot(instanceMatrix[0].xz, drift), dot(instanceMatrix[2].xz, drift)) /
        max(vec2(dot(instanceMatrix[0].xz, instanceMatrix[0].xz), dot(instanceMatrix[2].xz, instanceMatrix[2].xz)), vec2(0.01));
    #endif`;
  const previous = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, wind, { uChop: chopWind, uGrassUnits: grassUnits });
    shader.vertexShader = `uniform float uTime;
      uniform vec2 uWindDir;
      uniform vec3 uChop[4];
      uniform vec4 uGrassUnits[12];
      uniform float uWindStrength;
      ${shape === "leaf" ? "attribute float aWindLift;" : ""}
    ` + shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n" + bend);
  };
  material.customProgramCacheKey = () => `${key}|wind-${shape}`;
}
