uniform sampler2D uVideo;
uniform vec2 uHole;
uniform float uMass;
uniform float uTime;
uniform float uAspect;
uniform float uVideoAspect;

varying vec2 vUv;

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

vec3 blackbody(float heat) {
  vec3 ember = vec3(0.45, 0.03, 0.0);
  vec3 flame = vec3(1.0, 0.42, 0.08);
  vec3 core = vec3(1.0, 0.96, 0.9);
  vec3 warm = mix(ember, flame, smoothstep(0.0, 0.55, heat));
  return mix(warm, core, smoothstep(0.55, 1.0, heat));
}

vec3 accretionDisk(vec2 centered, float rs) {
  if (rs < 1e-4) return vec3(0.0);
  vec2 plane = vec2(centered.x, centered.y / 0.35);
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
  float brightness = band * (0.3 + 1.1 * turbulence) * beaming * (0.45 + 1.55 * heat * heat);
  return blackbody(heat) * brightness * 0.9;
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
  vec2 centered = vec2((uv.x - uHole.x) * uAspect, uv.y - uHole.y);
  float r = length(centered);
  float rs = uMass * 0.09;
  float presence = smoothstep(0.002, 0.012, rs);

  vec2 outward = r > 1e-5 ? centered / r : vec2(0.0, 1.0);
  float reach = 1.0 - smoothstep(rs * 3.0, rs * 8.0 + 1e-5, r);
  float deflection = rs * rs / max(r, 1e-4) * 2.3 * reach;
  vec2 shift = outward * deflection;
  vec2 lensedUv = uv - vec2(shift.x / uAspect, shift.y);

  vec2 chroma = vec2(outward.x / uAspect, outward.y) * deflection * 0.08;
  vec3 videoColor;
  videoColor.r = sampleVideo(lensedUv - chroma).r;
  videoColor.g = sampleVideo(lensedUv).g;
  videoColor.b = sampleVideo(lensedUv + chroma).b;

  float luma = dot(videoColor, vec3(0.2126, 0.7152, 0.0722));
  vec3 graded = mix(videoColor, vec3(luma), 0.28);
  vec2 vignettePos = (uv - 0.5) * vec2(uAspect, 1.0);
  graded *= 1.0 - 0.45 * smoothstep(0.35, 1.05, length(vignettePos));

  vec2 starCoord = (vec2(uv.x * uAspect, uv.y) + outward * uTime * 0.02 * uMass) * 55.0;
  float stars = starField(starCoord) * (1.0 - smoothstep(0.05, 0.4, luma)) * 0.6;

  vec2 lensedCentered = vec2((lensedUv.x - uHole.x) * uAspect, lensedUv.y - uHole.y);
  vec3 disk = accretionDisk(lensedCentered, rs) * presence;

  float ringRadius = rs * 1.5;
  float ringWidth = max(rs * 0.16, 1e-4);
  float ringT = (r - ringRadius) / ringWidth;
  float ring = exp(-ringT * ringT) * presence;
  vec3 ringGlow = vec3(1.0, 0.86, 0.58) * ring * 1.3;

  float horizon = smoothstep(rs, rs * 1.02 + 1e-5, r);

  vec3 emissive = disk + ringGlow;
  emissive /= 1.0 + 0.3 * emissive;

  vec3 color = graded + vec3(stars) + emissive;
  color *= horizon;
  gl_FragColor = vec4(color, 1.0);
}
