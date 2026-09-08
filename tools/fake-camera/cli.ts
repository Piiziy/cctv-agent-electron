import { startFakeCamera } from './index'

/** `npm run fake-camera` — 가짜 카메라를 띄우고 Ctrl+C 까지 유지한다. */
const run = async (): Promise<void> => {
  const useWebcam = process.argv.includes('--webcam') || process.env.FAKE_CAM_SOURCE === 'webcam'
  const camera = await startFakeCamera({
    host: process.env.FAKE_CAM_HOST ?? '127.0.0.1',
    ...(useWebcam ? { source: 'webcam' as const } : {}),
    manufacturer: 'FakeCam',
    model: useWebcam ? 'WEBCAM-1' : 'SIM-1000',
    friendlyName: useWebcam ? '노트북웹캠' : '테스트카메라',
  })

  console.log(`가짜 카메라가 떴습니다. (입력: ${useWebcam ? '노트북 웹캠' : '테스트 영상'})`)
  console.log(`  ONVIF  ${camera.xaddr}`)
  console.log(`  UUID   ${camera.uuid}`)
  Object.entries(camera.rtsp).forEach(([name, url]) => console.log(`  RTSP   ${name}  ${url}`))
  console.log('\n에이전트에서 검색하거나, 위 RTSP 주소를 직접 입력해 보세요. (Ctrl+C 로 종료)')

  const shutdown = (): void => {
    void camera.close().then(() => process.exit(0))
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

void run()
