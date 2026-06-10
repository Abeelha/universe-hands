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

export type HoleState = {
  x: number
  y: number
  mass: number
  tilt: number
  diskGain: number
  lensPower: number
  spectral: number
  jet: number
  jetX: number
  jetY: number
}

export type BlackholeView = {
  update: (holes: readonly HoleState[], timeSeconds: number) => void
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
    uHoles: { value: [new THREE.Vector2(0.5, 0.5), new THREE.Vector2(0.5, 0.5)] },
    uMasses: { value: [0, 0] },
    uTilts: { value: [0, 0] },
    uDiskGains: { value: [0.5, 0.5] },
    uLensPowers: { value: [0.35, 0.35] },
    uSpectrals: { value: [0, 0] },
    uJets: { value: [0, 0] },
    uJetDirs: { value: [new THREE.Vector2(0, 1), new THREE.Vector2(0, 1)] },
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
    new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.45, 0.55, 1.0),
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
    update: (holes, timeSeconds) => {
      for (let index = 0; index < 2; index++) {
        const hole = holes[index]
        if (!hole) continue
        uniforms.uHoles.value[index].set(hole.x, hole.y)
        uniforms.uMasses.value[index] = hole.mass
        uniforms.uTilts.value[index] = hole.tilt
        uniforms.uDiskGains.value[index] = hole.diskGain
        uniforms.uLensPowers.value[index] = hole.lensPower
        uniforms.uSpectrals.value[index] = hole.spectral
        uniforms.uJets.value[index] = hole.jet
        uniforms.uJetDirs.value[index].set(hole.jetX, hole.jetY)
      }
      uniforms.uTime.value = timeSeconds
    },
    render: () => composer.render(),
    resize,
  }
}
