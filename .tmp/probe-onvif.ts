import { startFakeCamera } from '../tools/fake-camera'
import { discoverCameras } from '../src/main/services/discovery'
import { probeCamera } from '../src/main/services/camera-probe'

const run = async () => {
  const camera = await startFakeCamera({ friendlyName: '테스트카메라' })
  console.log('가짜 카메라:', camera.xaddr)

  console.log('\n--- ONVIF 검색 ---')
  const found = await discoverCameras(4000)
  console.log(JSON.stringify(found, null, 2))

  console.log('\n--- 프로필 조회 ---')
  const target = found.find((c) => c.xaddr === camera.xaddr)
  if (target) {
    const probed = await probeCamera({ camera: target, username: 'admin', password: 'pw' })
    console.log(JSON.stringify(probed.profiles, null, 2))
  } else {
    console.log('검색으로 못 찾음 — 수동 경로로 직접 조회')
  }

  await camera.close()
  process.exit(0)
}
void run()
