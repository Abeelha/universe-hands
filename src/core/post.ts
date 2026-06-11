import * as THREE from "three"
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js"
import { RenderPass } from "three/addons/postprocessing/RenderPass.js"
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js"
import { OutputPass } from "three/addons/postprocessing/OutputPass.js"

const FULLSCREEN_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

export type Pipeline = {
  render: () => void
  resize: () => void
  dispose: () => void
}

export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: "high-performance",
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  return renderer
}

export function createVideoPipeline(options: {
  renderer: THREE.WebGLRenderer
  video: HTMLVideoElement
  fragmentShader: string
  uniforms: Record<string, THREE.IUniform>
  bloom?: { strength: number; radius: number; threshold: number }
}): Pipeline {
  const { renderer, video, fragmentShader, uniforms, bloom } = options

  const videoTexture = new THREE.VideoTexture(video)
  videoTexture.colorSpace = THREE.SRGBColorSpace

  uniforms.uVideo = { value: videoTexture }
  uniforms.uAspect = { value: 1 }
  uniforms.uVideoAspect = { value: video.videoWidth / Math.max(video.videoHeight, 1) }

  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
  })
  const geometry = new THREE.PlaneGeometry(2, 2)
  scene.add(new THREE.Mesh(geometry, material))

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  if (bloom) {
    composer.addPass(
      new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        bloom.strength,
        bloom.radius,
        bloom.threshold,
      ),
    )
  }
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
    render: () => {
      if (video.videoWidth > 0) {
        uniforms.uVideoAspect.value = video.videoWidth / video.videoHeight
      }
      composer.render()
    },
    resize,
    dispose: () => {
      composer.dispose()
      material.dispose()
      geometry.dispose()
      videoTexture.dispose()
    },
  }
}
