import * as THREE from "three";

export class WaterSurface {
  private readonly uniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uTime: { value: 0 },
    uDetail: { value: 1 },
    uRain: { value: 0 },
    uHorizon: { value: new THREE.Color() },
    uZenith: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3() }
  };

  readonly material = new THREE.ShaderMaterial({
    uniforms: this.uniforms,
    fog: true, transparent: true, depthWrite: false,
    vertexShader: `
      attribute float aDepth;
      attribute float aPier;
      attribute float aShallow;
      varying vec3 vWorld;
      varying vec3 vBed;
      #include <fog_pars_vertex>
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        vBed = vec3(aDepth, aPier, aShallow);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      uniform float uTime, uDetail, uRain;
      uniform vec3 uHorizon, uZenith, uSunColor, uSunDir;
      varying vec3 vWorld;
      varying vec3 vBed;
      #include <fog_pars_fragment>

      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }
      float noise(vec2 p) {
        vec2 cell = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(cell), hash(cell + vec2(1, 0)), f.x),
                   mix(hash(cell + vec2(0, 1)), hash(cell + vec2(1, 1)), f.x), f.y);
      }

      void main() {
        vec2 p = vWorld.xz;
        if (vBed.x < -0.012) discard;
        float depth = max(0.0, vBed.x);
        float shallow = smoothstep(0.05, 0.72, vBed.z);
        float coarse = dot(p, vec2(2.7, 1.3)) - uTime * 1.35;
        float fine = dot(p, vec2(-2.9, 5.1)) - uTime * 2.15;
        float wash = noise(p * 1.15 + vec2(uTime * 0.12, -uTime * 0.08));
        if (uDetail > 1.5) wash = 0.65 * wash + 0.35 * noise(p * 2.6 - vec2(uTime * 0.23, 0));
        vec2 slope = vec2(0.12, 0.065) * cos(coarse) + vec2(-0.04, 0.08) * cos(fine + wash * uDetail);
        float ripple = 0.0;
        if (uRain > 0.02 && uDetail > 0.5) {
          vec2 cell = floor(p * 1.55);
          vec2 center = vec2(hash(cell), hash(cell + 3.21)) * 0.52 + 0.24;
          vec2 offset = fract(p * 1.55) - center;
          float age = fract(uTime * 1.35 + hash(cell + 28.7));
          ripple = (1.0 - smoothstep(0.009, 0.034, abs(length(offset) - age * 0.23))) * (1.0 - age) * uRain;
          slope += offset * ripple * 0.65;
        }
        vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
        vec3 viewDir = normalize(cameraPosition - vWorld);
        vec3 reflected = reflect(-viewDir, n);
        float fresnel = 0.08 + 0.92 * pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
        vec3 sky = mix(uHorizon, uZenith, smoothstep(0.0, 0.76, reflected.y));
        float deep = smoothstep(0.04, 0.44, depth) * (1.0 - shallow);
        vec3 water = mix(vec3(0.11, 0.28, 0.17), vec3(0.014, 0.089, 0.122), deep);
        water = mix(water, vec3(0.22, 0.255, 0.13), shallow);
        water *= mix(0.28, 1.08, clamp(length(uSunColor), 0.0, 1.0));
        float foamLine = (1.0 - smoothstep(0.018, 0.105, depth + (wash - 0.5) * 0.08)) * smoothstep(0.43, 0.74, wash);
        float pierFoam = (1.0 - smoothstep(0.035, 0.17, vBed.y)) * smoothstep(0.12, 0.85, wash);
        float glint = pow(max(dot(normalize(uSunDir + viewDir), n), 0.0), mix(108.0, 30.0, uRain));
        float reflectivity = fresnel * (uDetail > 1.5 ? 1.38 : 1.0) * (1.0 - shallow * 0.40);
        float sparkle = uDetail > 1.5 ? pow(max(wash, 0.0), 5.0) * glint * 1.42 : 0.0;
        vec3 rgb = mix(water, sky, min(0.88, reflectivity)) + uSunColor * (glint * (0.52 + wash * 0.45) + sparkle);
        rgb += (vec3(0.7, 0.78, 0.7) * (foamLine * (0.36 - shallow * 0.27) + pierFoam * 0.44) + ripple * 0.14) * length(uSunColor);
        gl_FragColor = vec4(rgb, clamp(mix(mix(0.42, 0.30, shallow), 0.92, deep) + fresnel * 0.33 + foamLine * 0.19, 0.0, 1.0));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `
  });

  update(time: number, detail: number, rain: number, horizon: THREE.Color, zenith: THREE.Color, sun: THREE.DirectionalLight): void {
    const u = this.uniforms;
    u.uTime.value = time;
    u.uDetail.value = detail;
    u.uRain.value = rain;
    u.uHorizon.value.copy(horizon);
    u.uZenith.value.copy(zenith);
    u.uSunColor.value.copy(sun.color).multiplyScalar(sun.intensity * 0.7);
    u.uSunDir.value.copy(sun.position).sub(sun.target.position).normalize();
  }
}
