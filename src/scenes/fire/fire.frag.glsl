uniform sampler2D uVideo;
uniform vec2 uHands[2];
uniform float uPowers[2];
uniform float uBends[2];
uniform vec4 uBalls[6];
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
  float cx = rel.x - bend * rel.y;
  vec2 q = vec2(cx * 5.0, rel.y * 3.2 - uTime * 2.4);
  vec2 warp = vec2(
    fbm(q * 1.3 + vec2(0.0, uTime * 0.4)),
    fbm(q * 1.3 + vec2(5.2, -uTime * 0.3))
  ) - 0.5;
  float body = fbm(q + warp * 1.9);
  float width = (0.035 + 0.055 * power) * (1.0 - 0.35 * min(t, 1.0)) + 0.01;
  width *= 1.0 + warp.x * 0.7;
  float xn = cx / max(width, 0.008);
  float lateral = exp(-xn * xn);
  float ragged = lateral * (1.1 - t) - (1.0 - body) * 0.55;
  float column = clamp(ragged * 2.6, 0.0, 1.3);
  column *= 1.0 - smoothstep(0.65, 1.1, t);
  column *= smoothstep(-0.14, -0.02, rel.y);
  column *= 0.8 + 0.4 * valueNoise(vec2(uTime * 6.0, t * 4.0));
  float glow = exp(-dot(rel, rel) * 320.0) * 0.35;
  return (column + glow) * power;
}

vec3 fireColor(float heat) {
  vec3 c = vec3(0.0);
  c = mix(c, vec3(0.5, 0.03, 0.0), smoothstep(0.0, 0.3, heat));
  c = mix(c, vec3(1.0, 0.38, 0.03), smoothstep(0.3, 0.65, heat));
  c = mix(c, vec3(1.0, 0.8, 0.3), smoothstep(0.65, 1.0, heat));
  c = mix(c, vec3(1.0, 0.97, 0.88), smoothstep(1.1, 1.45, heat));
  return c * (0.75 + 0.3 * heat);
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

  for (int b = 0; b < 6; b++) {
    float ballPower = uBalls[b].z;
    if (ballPower < 0.02) continue;
    vec2 rel = vec2((uv.x - uBalls[b].x) * uAspect, uv.y - uBalls[b].y);
    float ca = cos(uBalls[b].w);
    float sa = sin(uBalls[b].w);
    vec2 local = vec2(ca * rel.x + sa * rel.y, -sa * rel.x + ca * rel.y);
    local.x *= 0.6;
    float r2 = dot(local, local);
    float size = 0.032 + 0.02 * ballPower;
    float core = exp(-r2 / (size * size));
    float flick = 0.7 + 0.6 * valueNoise(vec2(uTime * 9.0 + float(b) * 7.3, r2 * 60.0));
    heat += core * ballPower * 1.4 * flick;
    spill += vec3(1.0, 0.5, 0.18) * exp(-dot(rel, rel) * 40.0) * ballPower * 0.1;
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

  gl_FragColor = vec4(vid + flame * 0.9, 1.0);
}
