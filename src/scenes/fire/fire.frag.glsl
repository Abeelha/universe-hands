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
  if (power < 0.02) return 0.0;
  float rise = 0.16 + 0.5 * power;
  if (rel.y < -0.09 || rel.y > rise * 1.3) return 0.0;
  float t = clamp(rel.y / rise, 0.0, 1.0);
  float sway = (valueNoise(vec2(uTime * 1.9, rel.y * 7.0)) - 0.5) * 0.22 * t;
  float cx = rel.x - bend * rel.y - sway;
  float width = (0.05 + 0.08 * power) * (1.0 - 0.45 * t) + 0.012;
  float xn = cx / width;
  float lateral = exp(-xn * xn);
  float body = fbm(vec2(rel.x * 7.0, rel.y * 5.0 - uTime * 3.0));
  float column = lateral * (1.0 - t * t) * (0.35 + 1.0 * body);
  float glow = exp(-dot(rel, rel) * 160.0) * 0.8;
  return (column + glow) * power;
}

vec3 fireColor(float heat) {
  vec3 c = vec3(0.0);
  c = mix(c, vec3(0.55, 0.04, 0.0), smoothstep(0.0, 0.22, heat));
  c = mix(c, vec3(1.0, 0.42, 0.04), smoothstep(0.22, 0.55, heat));
  c = mix(c, vec3(1.0, 0.85, 0.4), smoothstep(0.55, 0.85, heat));
  c = mix(c, vec3(1.0, 0.98, 0.9), smoothstep(0.85, 1.15, heat));
  return c * (0.85 + 0.5 * heat);
}

void main() {
  vec2 uv = vUv;
  float heat = 0.0;
  float risenHeat = 0.0;
  for (int i = 0; i < 2; i++) {
    vec2 rel = vec2((uv.x - uHands[i].x) * uAspect, uv.y - uHands[i].y);
    heat += flameHeat(rel, uPowers[i], uBends[i]);
    vec2 below = rel;
    below.y -= 0.1;
    risenHeat += flameHeat(below, uPowers[i], uBends[i]);
  }

  float haze = clamp(heat * 0.5 + risenHeat, 0.0, 1.5) * 0.018;
  vec2 wobble = vec2(
    valueNoise(uv * 34.0 + vec2(0.0, uTime * 2.4)) - 0.5,
    valueNoise(uv * 34.0 + vec2(9.3, uTime * 2.4)) - 0.5
  );
  vec3 vid = sampleVideo(uv + wobble * haze);

  float luma = dot(vid, vec3(0.2126, 0.7152, 0.0722));
  vid = mix(vid, vec3(luma), 0.2) * 0.85;
  vec2 vig = (uv - 0.5) * vec2(uAspect, 1.0);
  vid *= 1.0 - 0.4 * smoothstep(0.4, 1.05, length(vig));

  vec3 flame = fireColor(heat);
  flame /= 1.0 + 0.35 * flame;

  gl_FragColor = vec4(vid + flame, 1.0);
}
