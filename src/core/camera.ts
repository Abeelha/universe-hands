export async function startCamera(): Promise<HTMLVideoElement> {
  const video = document.createElement("video")
  video.autoplay = true
  video.playsInline = true
  video.muted = true
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 60 },
      facingMode: "user",
    },
    audio: false,
  })
  video.srcObject = stream
  await new Promise<void>((resolve) => {
    video.onloadedmetadata = () => resolve()
  })
  await video.play()
  return video
}
