import { join } from 'node:path'
import { app, BrowserWindow, dialog, Menu, nativeImage, Tray } from 'electron'
import { IPC } from '../shared/ipc'
import type { AgentStatus } from '../shared/types'
import { registerIpc } from './ipc'
import { createAgent, type Agent } from './services/agent'

const state = {
  window: null as BrowserWindow | null,
  tray: null as Tray | null,
  agent: null as Agent | null,
  status: null as AgentStatus | null,
  quitting: false,
}

const paths = {
  config: () => join(app.getPath('userData'), 'config.json'),
  spool: () => join(app.getPath('userData'), 'spool'),
}

const STATUS_LABEL: Record<string, string> = {
  idle: '대기 중',
  connecting: '연결 중',
  streaming: '감시 중',
  reconnecting: '재연결 중',
  'auth-failed': '카메라 인증 실패',
}

const trayTitle = (status: AgentStatus | null): string => {
  if (!status?.running || status.cameras.length === 0) return '감시 중지됨'
  const streaming = status.cameras.filter((c) => c.camera === 'streaming').length
  const pending = status.cameras.reduce((sum, c) => sum + c.pendingCount, 0)
  const head = `카메라 ${streaming}/${status.cameras.length}대 감시 중`
  const trouble = status.cameras.find((c) => c.camera === 'auth-failed' || c.camera === 'reconnecting')
  const detail = trouble ? ` · ${trouble.name} ${STATUS_LABEL[trouble.camera] ?? ''}` : ''
  return pending > 0 ? `${head}${detail} · 보관 ${pending}개` : `${head}${detail}`
}

const createWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 820,
    minHeight: 620,
    show: false,
    title: 'CCTV 수집기',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  window.once('ready-to-show', () => window.show())

  // 창을 닫아도 감시는 계속되어야 한다. 매장에서 창을 닫는 것은 흔한 일이다.
  window.on('close', (event) => {
    if (state.quitting) return
    event.preventDefault()
    window.hide()
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) void window.loadURL(devUrl)
  else void window.loadFile(join(__dirname, '../renderer/index.html'))

  return window
}

const showWindow = (): void => {
  if (!state.window || state.window.isDestroyed()) state.window = createWindow()
  state.window.show()
  state.window.focus()
}

const refreshTray = (): void => {
  if (!state.tray) return
  const running = state.status?.running ?? false
  state.tray.setToolTip(`CCTV 수집기 — ${trayTitle(state.status)}`)
  state.tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: trayTitle(state.status), enabled: false },
      { type: 'separator' },
      { label: '창 열기', click: showWindow },
      {
        label: running ? '감시 중지' : '감시 시작',
        click: () => {
          const agent = state.agent
          if (!agent) return
          if (running) {
            void agent.fleet.stop()
            return
          }
          const cameras = agent.config.read().cameras
          if (cameras.length > 0) void agent.fleet.start(cameras)
          else showWindow()
        },
      },
      { type: 'separator' },
      { label: '종료', click: () => app.quit() },
    ]),
  )
}

const createTray = (): void => {
  const icon = nativeImage.createFromPath(join(__dirname, '../../resources/trayTemplate.png'))
  icon.setTemplateImage(true)
  state.tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
  state.tray.on('click', showWindow)
  refreshTray()
}

const publishStatus = (status: AgentStatus): void => {
  state.status = status
  refreshTray()
  if (state.window && !state.window.isDestroyed()) {
    state.window.webContents.send(IPC.statusChanged, status)
  }
}

// 한 대의 매장 PC 에서 두 개가 돌면 같은 스풀을 두고 다투게 된다.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWindow)

  void app.whenReady().then(() => {
    const spoolRoot = paths.spool()
    const agent = createAgent({ configFile: paths.config(), spoolRoot }, publishStatus)
    state.agent = agent

    registerIpc(agent, () => state.window, spoolRoot)
    state.window = createWindow()
    createTray()

    const config = agent.config.read()
    app.setLoginItemSettings({ openAtLogin: config.autoStart, openAsHidden: true })

    // 재부팅 후 사람 없이도 감시가 이어져야 한다. 무인매장에는 켜 줄 사람이 없다.
    if (config.cameras.length > 0 && config.backendBaseUrl) {
      void agent.fleet.start(config.cameras)
    }

    app.on('activate', showWindow)
  })

  app.on('before-quit', (event) => {
    if (state.quitting || !state.status?.running) {
      state.quitting = true
      return
    }
    event.preventDefault()
    const choice = dialog.showMessageBoxSync({
      type: 'warning',
      buttons: ['취소', '종료'],
      defaultId: 0,
      cancelId: 0,
      title: '정말 종료할까요?',
      message: `종료하면 카메라 ${state.status?.cameras.length ?? 0}대의 감시가 모두 중단됩니다.`,
      detail: '이상행동 감지가 멈추고, 종료된 동안의 영상은 분석되지 않습니다.',
    })
    if (choice !== 1) return
    state.quitting = true
    void state.agent?.fleet.stop().then(() => app.quit())
  })

  // 창을 다 닫아도 트레이에서 계속 돈다 (macOS 관례와 동일하게 모든 플랫폼에서)
  app.on('window-all-closed', () => undefined)
}
