import { startRtspServer } from '../tools/fake-camera/rtsp-server'
import { resolveFfmpegPath } from '../src/main/lib/ffmpeg'
import { probeMedia } from '../src/main/services/media-probe'

const run = async () => {
  const server = await startRtspServer({
    ffmpegPath: resolveFfmpegPath(),
    streams: [
      { path: 'main', sourceFile: '.tmp/test.mp4', width: 1280, height: 720, fps: 15, gopSeconds: 2, bitrateKbps: 2000 },
      { path: 'sub', sourceFile: '.tmp/test.mp4', width: 640, height: 480, fps: 15, gopSeconds: 2, bitrateKbps: 400 },
    ],
  })
  console.log('urls:', server.urls)
  for (const [name, url] of Object.entries(server.urls)) {
    const probed = await probeMedia(url, { timeoutMs: 20000 })
    console.log(name, '→', JSON.stringify(probed))
  }
  await server.close()
  process.exit(0)
}
void run()
