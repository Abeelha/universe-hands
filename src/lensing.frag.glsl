uniform sampler2D uVideo;
uniform vec2 uHoles[2];
uniform float uMasses[2];
uniform float uTilts[2];
uniform float uDiskGains[2];
uniform float uLensPowers[2];
uniform float uSpectrals[2];
uniform float uJets[2];
uniform vec2 uJetDirs[2];
uniform float uTime;
uniform float uAspect;
uniform float uVideoAspect;

varying vec2 vUv;

const float SCHWARZSCHILD_SCALE = 0.09;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float valueNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(cell);
  float b = hash(cell + vec2(1.0, 0.0));
  float c = hash(cell + vec2(0.0, 1.0));
  float d = hash(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 3; i++) {
    sum += amplitude * valueNoise(p);
    p = p * 2.13 + vec2(7.31, 1.97);
    amplitude *= 0.5;
  }
  return sum;
}

vec3 sampleVideo(vec2 p) {
  float cover = max(uAspect / uVideoAspect, 1.0);
  vec2 physical = vec2((p.x - 0.5) * uAspect, p.y - 0.5);
  vec2 videoUv = physical / vec2(uVideoAspect * cover, cover) + 0.5;
  videoUv = clamp(videoUv, 0.002, 0.998);
  return texture2D(uVideo, vec2(1.0 - videoUv.x, videoUv.y)).rgb;
}

vec3 paletteGradient(float heat, vec3 low, vec3 mid, vec3 high) {
  vec3 base = mix(low, mid, smoothstep(0.0, 0.55, heat));
  return mix(base, high, smoothstep(0.55, 1.0, heat));
}

vec3 diskColor(float heat, float spectral) {
  vec3 warm = paletteGradient(heat, vec3(0.45, 0.03, 0.0), vec3(1.0, 0.42, 0.08), vec3(1.0, 0.96, 0.9));
  vec3 cool = paletteGradient(heat, vec3(0.16, 0.02, 0.42), vec3(0.2, 0.5, 1.0), vec3(0.85, 0.97, 1.0));
  return mix(warm, cool, spectral);
}

vec3 accretionDisk(vec2 plane2d, float rs, float gain, float spectral) {
  if (rs < 1e-4) return vec3(0.0);
  vec2 plane = vec2(plane2d.x, plane2d.y / 0.35);
  float radius = length(plane);
  float inner = rs * 1.9;
  float outer = rs * 4.5;
  float band = smoothstep(inner * 0.82, inner * 1.12, radius)
    * (1.0 - smoothstep(outer * 0.72, outer, radius));
  if (band < 1e-3) return vec3(0.0);
  float angle = atan(plane.y, plane.x);
  float spin = uTime * 6.0 * pow(max(radius / rs, 0.6), -1.5);
  float phase = angle - spin;
  vec2 swirl = vec2(cos(phase), sin(phase)) * (radius / rs);
  float turbulence = fbm(swirl * 1.35);
  float heat = 1.0 - smoothstep(inner, outer, radius);
  float beaming = 1.0 + 0.7 * sin(angle);
  float brightness = band * (0.3 + 1.1 * turbulence) * beaming
    * (0.45 + 1.55 * heat * heat) * (0.4 + 1.6 * gain) * 0.9;
  return diskColor(heat, spectral) * brightness;
}

float starField(vec2 p) {
  vec2 cell = floor(p);
  vec2 local = fract(p);
  float seed = hash(cell);
  if (seed < 0.93) return 0.0;
  vec2 starPos = vec2(hash(cell + 31.7), hash(cell + 57.3)) * 0.8 + 0.1;
  float dist = length(local - starPos);
  float twinkle = 0.55 + 0.45 * sin(uTime * (1.0 + seed * 5.0) + seed * 40.0);
  return smoothstep(0.09, 0.0, dist) * twinkle;
}

void main() {
  vec2 uv = vUv;

  vec2 totalShift = vec2(0.0);
  vec3 glow = vec3(0.0);
  vec2 starDrift = vec2(0.0);
  float horizon = 1.0;

  for (int i = 0; i < 2; i++) {
    vec2 centered = vec2((uv.x - uHoles[i].x) * uAspect, uv.y - uHoles[i].y);
    float r = length(centered);
    float rs = uMasses[i] * SCHWARZSCHILD_SCALE;
    float presence = smoothstep(0.004, 0.02, rs);
    vec2 outward = r > 1e-5 ? centered / r : vec2(0.0, 1.0);
    float reach = 1.0 - smoothstep(rs * 3.0, rs * 8.0 + 1e-5, r);
    float deflection = rs * rs / max(r, 1e-4) * (1.15 + uLensPowers[i] * 3.3) * reach;
    totalShift += vec2(outward.x * deflection / uAspect, outward.y * deflection);
    float ringT = (r - rs * 1.5) / max(rs * 0.16, 1e-4);
    vec3 ringColor = mix(vec3(1.0, 0.86, 0.58), vec3(0.7, 0.85, 1.0), uSpectrals[i]);
    glow += ringColor * exp(-ringT * ringT) * presence * 1.1;
    horizon *= smoothstep(rs, rs * 1.02 + 1e-5, r);
    starDrift += outward * uMasses[i];
  }

  vec2 lensedUv = uv - totalShift;
  vec2 chroma = totalShift * 0.08;
  vec3 videoColor;
  videoColor.r = sampleVideo(lensedUv - chroma).r;
  videoColor.g = sampleVideo(lensedUv).g;
  videoColor.b = sampleVideo(lensedUv + chroma).b;

  float luma = dot(videoColor, vec3(0.2126, 0.7152, 0.0722));
  vec3 graded = mix(videoColor, vec3(luma), 0.28);
  vec2 vignettePos = (uv - 0.5) * vec2(uAspect, 1.0);
  graded *= 1.0 - 0.45 * smoothstep(0.35, 1.05, length(vignettePos));

  vec2 starCoord = (vec2(uv.x * uAspect, uv.y) + starDrift * uTime * 0.02) * 55.0;
  float stars = starField(starCoord) * (1.0 - smoothstep(0.05, 0.4, luma)) * 0.6;

  vec3 emissive = glow;
  for (int i = 0; i < 2; i++) {
    float rs = uMasses[i] * SCHWARZSCHILD_SCALE;
    float presence = smoothstep(0.004, 0.02, rs);
    vec2 lensedCentered = vec2((lensedUv.x - uHoles[i].x) * uAspect, lensedUv.y - uHoles[i].y);
    float rollCos = cos(uTilts[i]);
    float rollSin = sin(uTilts[i]);
    vec2 diskPlane = mat2(rollCos, -rollSin, rollSin, rollCos) * lensedCentered;
    emissive += accretionDisk(diskPlane, rs, uDiskGains[i], uSpectrals[i]) * presence;

    if (uJets[i] > 0.004) {
      vec2 axis = vec2(uJetDirs[i].x * uAspect, uJetDirs[i].y);
      axis /= max(length(axis), 1e-5);
      float along = dot(lensedCentered, axis);
      float perp = length(lensedCentered - axis * along);
      float coreT = perp / max(rs * 0.4, 1e-4);
      float beamCore = exp(-coreT * coreT);
      float beamReach = exp(-abs(along) / max(rs * 3.5, 1e-4));
      float pulse = 0.8 + 0.2 * sin(uTime * 24.0 - abs(along) * 30.0);
      emissive += vec3(0.55, 0.75, 1.0) * beamCore * beamReach * pulse * uJets[i] * presence * 1.6;
    }
  }

  emissive /= 1.0 + 0.45 * emissive;

  vec3 color = graded + vec3(stars) + emissive;
  color *= horizon;
  gl_FragColor = vec4(color, 1.0);
}
