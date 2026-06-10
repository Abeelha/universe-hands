import * as THREE from "three"
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js"
import { RenderPass } from "three/addons/postprocessing/RenderPass.js"
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js"
import { OutputPass } from "three/addons/postprocessing/OutputPass.js"
import lensingFragment from "./lensing.frag.glsl?raw"

const FULLSCREEN_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

export type BlackholeView = {
  update: (hole: { x: number; y: number }, mass: number, timeSeconds: number) => void
  render: () => void
  resize: () => void
}

export function createBlackholeView(canvas: HTMLCanvasElement, video: HTMLVideoElement): BlackholeView {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: "high-performance",
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  const videoTexture = new THREE.VideoTexture(video)
  videoTexture.colorSpace = THREE.SRGBColorSpace

  const uniforms = {
    uVideo: { value: videoTexture },
    uHole: { value: new THREE.Vector2(0.5, 0.5) },
    uMass: { value: 0 },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uVideoAspect: { value: video.videoWidth / Math.max(video.videoHeight, 1) },
  }

  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader: lensingFragment,
    depthTest: false,
    depthWrite: false,
  })
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material))

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  composer.addPass(
    new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.2, 0.6, 0.85),
  )
  composer.addPass(new OutputPass())

  const resize = (): void => {
    const width = window.innerWidth
    const height = window.innerHeight
    renderer.setSize(width, height)
    composer.setSize(width, height)
    uniforms.uAspect.value = width / height
  }
  resize()

  return {
    update: (hole, mass, timeSeconds) => {
      uniforms.uHole.value.set(hole.x, hole.y)
      uniforms.uMass.value = mass
      uniforms.uTime.value = timeSeconds
    },
    render: () => composer.render(),
    resize,
  }
}
