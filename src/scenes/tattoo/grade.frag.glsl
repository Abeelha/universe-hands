uniform sampler2D uVideo;
uniform float uAspect;
uniform float uVideoAspect;

varying vec2 vUv;

vec3 sampleVideo(vec2 p) {
  float cover = max(uAspect / uVideoAspect, 1.0);
  vec2 physical = vec2((p.x - 0.5) * uAspect, p.y - 0.5);
  vec2 videoUv = physical / vec2(uVideoAspect * cover, cover) + 0.5;
  videoUv = clamp(videoUv, 0.002, 0.998);
  return texture2D(uVideo, vec2(1.0 - videoUv.x, videoUv.y)).rgb;
}

void main() {
  vec3 vid = sampleVideo(vUv);
  float luma = dot(vid, vec3(0.2126, 0.7152, 0.0722));
  vid = mix(vid, vec3(luma), 0.12);
  vid = pow(vid, vec3(1.06));
  vec2 vig = (vUv - 0.5) * vec2(uAspect, 1.0);
  vid *= 1.0 - 0.32 * smoothstep(0.45, 1.1, length(vig));
  gl_FragColor = vec4(vid, 1.0);
}
