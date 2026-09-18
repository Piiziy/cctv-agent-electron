import type { AgentApi } from '../../shared/ipc'
import { inertDemoHook } from './demo'
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

// 진짜 앱에도 데모 훅의 껍데기를 심어 둔다 — 바깥 데모 페이지에서 쓰던 코드가
// 앱 안에서 돌더라도 window.__sceneStealer 가 없어서 터지는 일은 없어야 한다.
if (window.api) window.__sceneStealer = inertDemoHook
