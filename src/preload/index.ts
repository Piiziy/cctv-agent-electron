import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type AgentApi } from '../shared/ipc'
import type { AgentStatus } from '../shared/types'

/**
 * 렌더러에 노출하는 유일한 통로.
 * contextIsolation 이 켜져 있어 렌더러는 Node 에 직접 닿지 못한다.
 */
const api: AgentApi = {
  discover: (timeoutMs) => ipcRenderer.invoke(IPC.discover, timeoutMs),
  probe: (args) => ipcRenderer.invoke(IPC.probe, args),
  probeRtsp: (rtspUri) => ipcRenderer.invoke(IPC.probeRtsp, rtspUri),
  snapshot: (rtspUri) => ipcRenderer.invoke(IPC.snapshot, rtspUri),
  previewStart: (rtspUri) => ipcRenderer.invoke(IPC.previewStart, rtspUri),
  previewStop: () => ipcRenderer.invoke(IPC.previewStop),
  start: (cameras) => ipcRenderer.invoke(IPC.start, cameras),
  stop: () => ipcRenderer.invoke(IPC.stop),
  getConfig: () => ipcRenderer.invoke(IPC.getConfig),
  setConfig: (patch) => ipcRenderer.invoke(IPC.setConfig, patch),
  getStatus: () => ipcRenderer.invoke(IPC.getStatus),
  openSpoolFolder: () => ipcRenderer.invoke(IPC.openSpoolFolder),
  onStatus: (listener) => {
    const handler = (_event: unknown, status: AgentStatus): void => listener(status)
    ipcRenderer.on(IPC.statusChanged, handler)
    return () => {
      ipcRenderer.removeListener(IPC.statusChanged, handler)
    }
  },
}

contextBridge.exposeInMainWorld('api', api)
