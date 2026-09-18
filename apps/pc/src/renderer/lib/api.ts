import type { AgentApi } from '../../shared/ipc'
import { createMockApi } from './mock-api'

declare global {
  interface Window {
    api?: AgentApi
  }
}

/**
 * Electron 안에서는 preload 가 심어 준 진짜 API 를, 브라우저에서는 가짜 API 를 쓴다.
 * 덕분에 화면 작업을 Electron 없이 `npm run ui` 로 할 수 있다.
 */
export const api: AgentApi = window.api ?? createMockApi()

export const isMock = !window.api
