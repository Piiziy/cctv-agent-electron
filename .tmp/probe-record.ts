import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startRtspServer } from '../tools/fake-camera/rtsp-server'
import { resolveFfmpegPath } from '../src/main/lib/ffmpeg'
import { createSegmentRecorder } from '../src/main/services/segment-recorder'
import { createSpoolStore } from '../src/main/services/spool-store'
import { probeMedia } from '../src/main/services/media-probe'

const run = async () => {
  const server = await startRtspServer({
    ffmpegPath: resolveFfmpegPath(),
    streams: [{ path: 'sub', sourceFile: '.tmp/test.mp4', width: 640, height: 480, fps: 15, gopSeconds: 2, bitrateKbps: 400 }],
  })
  const spoolDir = mkdtempSync(join(tmpdir(), 'rec-'))
  const seen: string[] = []

  const recorder = createSegmentRecorder({
    ffmpegPath: resolveFfmpegPath(),
    rtspUri: server.urls.sub!,
    spoolDir,
    segmentSeconds: 2,
    includeAudio: false,
    pollMs: 200,
    onSegment: (e) => { seen.push(e.name); console.log('완성:', e.name) },
    onExit: (e) => console.log('ffmpeg 종료:', e.code, e.stderr.slice(0, 200)),
  })
  recorder.start()
  await new Promise((r) => setTimeout(r, 11000))

  console.log('\n--- 정지 전 스풀 목록 (완성된 것만 보여야 함) ---')
  const spool = createSpoolStore(spoolDir, 1e9)
  const entries = await spool.list()
  for (const e of entries) {
    const probed = await probeMedia(e.path)
    console.log(`${e.name}  ${e.sizeBytes}B  →  ${probed ? `${probed.durationMs}ms ${probed.width}x${probed.height}` : '읽기 실패'}`)
  }
  console.log('parts/ 안:', readdirSync(join(spoolDir, 'parts')).join(', '))

  await recorder.stop()
  await server.close()
  rmSync(spoolDir, { recursive: true, force: true })
  console.log(`\n이벤트 ${seen.length}건, 중복 이름 ${seen.length - new Set(seen).size}건`)
  process.exit(0)
}
void run()
