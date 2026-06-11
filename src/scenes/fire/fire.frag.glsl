uniform sampler2D uVideo;
uniform vec2 uHands[2];
uniform float uPowers[2];
uniform float uBends[2];
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

float flameHeat(vec2 rel, float power, float bend) {
  if (power < 0.02 || rel.y < -0.25 || rel.y > 0.95 || abs(rel.x) > 0.6) return 0.0;
  float rise = 0.14 + 0.38 * power;
  float t = clamp(rel.y / rise, 0.0, 1.2);
  float sway = (valueNoise(vec2(uTime * 1.8, rel.y * 6.0)) - 0.5) * 0.26 * t;
  float cx = rel.x - bend * rel.y - sway;
  float width = (0.035 + 0.055 * power) * (1.0 - 0.4 * min(t, 1.0)) + 0.01;
  float xn = cx / width;
  float lateral = exp(-xn * xn);
  float body = fbm(vec2(cx * 5.5, rel.y * 3.5 - uTime * 2.7));
  float ragged = lateral * (1.15 - t) - (1.0 - body) * 0.5;
  float column = clamp(ragged * 2.4, 0.0, 1.4);
  column *= 1.0 - smoothstep(0.7, 1.1, t);
  column *= 0.85 + 0.3 * valueNoise(vec2(uTime * 5.0, t * 3.0));
  column *= smoothstep(-0.16, -0.03, rel.y);
  float glow = exp(-dot(rel, rel) * 240.0) * 0.5;
  return (column + glow) * power;
}

vec3 fireColor(float heat) {
  vec3 c = vec3(0.0);
  c = mix(c, vec3(0.55, 0.04, 0.0), smoothstep(0.0, 0.25, heat));
  c = mix(c, vec3(1.0, 0.42, 0.04), smoothstep(0.25, 0.6, heat));
  c = mix(c, vec3(1.0, 0.85, 0.4), smoothstep(0.6, 0.95, heat));
  c = mix(c, vec3(1.0, 0.98, 0.9), smoothstep(1.0, 1.35, heat));
  return c * (0.8 + 0.35 * heat);
}

void main() {
  vec2 uv = vUv;
  float heat = 0.0;
  float risenHeat = 0.0;
  vec3 spill = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    vec2 rel = vec2((uv.x - uHands[i].x) * uAspect, uv.y - uHands[i].y);
    heat += flameHeat(rel, uPowers[i], uBends[i]);
    vec2 below = rel;
    below.y -= 0.1;
    risenHeat += flameHeat(below, uPowers[i], uBends[i]);
    spill += vec3(1.0, 0.5, 0.18) * exp(-dot(rel, rel) * 26.0) * uPowers[i] * 0.14;
  }

  float haze = clamp(heat * 0.5 + risenHeat, 0.0, 1.5) * 0.014;
  vec2 wobble = vec2(
    valueNoise(uv * 34.0 + vec2(0.0, uTime * 2.4)) - 0.5,
    valueNoise(uv * 34.0 + vec2(9.3, uTime * 2.4)) - 0.5
  );
  vec3 vid = sampleVideo(uv + wobble * haze);

  float luma = dot(vid, vec3(0.2126, 0.7152, 0.0722));
  vid = mix(vid, vec3(luma), 0.2) * 0.85;
  vec2 vig = (uv - 0.5) * vec2(uAspect, 1.0);
  vid *= 1.0 - 0.4 * smoothstep(0.4, 1.05, length(vig));
  vid += spill;

  vec3 flame = fireColor(heat);
  flame /= 1.0 + 0.35 * flame;

  gl_FragColor = vec4(vid + flame, 1.0);
}
