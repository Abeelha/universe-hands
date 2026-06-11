export type CameraFacing = "user" | "environment"

const constraintsFor = (facing: CameraFacing): MediaStreamConstraints => ({
  video: {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 60 },
    facingMode: facing,
  },
  audio: false,
})

export async function startCamera(facing: CameraFacing = "user"): Promise<HTMLVideoElement> {
  const video = document.createElement("video")
  video.autoplay = true
  video.playsInline = true
  video.muted = true
  const stream = await navigator.mediaDevices.getUserMedia(constraintsFor(facing))
  video.srcObject = stream
  await new Promise<void>((resolve) => {
    video.onloadedmetadata = () => resolve()
  })
  await video.play()
  return video
}

export async function switchCamera(video: HTMLVideoElement, facing: CameraFacing): Promise<void> {
  const current = video.srcObject
  if (current instanceof MediaStream) {
    for (const track of current.getTracks()) track.stop()
  }
  const stream = await navigator.mediaDevices.getUserMedia(constraintsFor(facing))
  video.srcObject = stream
  await video.play()
}
