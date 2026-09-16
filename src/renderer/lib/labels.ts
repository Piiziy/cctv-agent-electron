/**
 * 화면에 나가는 한글 이름. 카피는 design/씬스틸러 PC 앱.dc.html 그대로다.
 * 디자인에 샘플이 없는 조합은 같은 화면의 다른 자리(2g 설정 표)에서 가져왔고,
 * 새 문구를 지어내지 않았다.
 */
import type { StatusTone, TagTone } from '../components/ui'
import type {
  CameraRuntimeState,
  EventState,
  LocationTag,
  RiskKind,
  RiskLevel,
} from '../../shared/server-types'

/** 피드·팝업·목록에 쓰는 짧은 이름 (2c 피드, 2d 제목, 2e 표). */
export const KIND_LABEL: Record<RiskKind, string> = {
  theft: '절도 의심',
  // 2c·2e 에 샘플이 없어 2g 설정 표의 이름을 쓴다.
  vandalism: '기물 파손 · 폭력',
  dine_and_dash: '취식 후 미결제',
  underage_purchase: '미성년자 주류 · 담배',
  loitering: '장시간 배회',
  sleeping: '노숙 · 취침',
  collapse: '쓰러짐 의심',
  // AI 게이트 미연결/실패 (docs/ai-gate-contract.md 5절).
  unknown: '분석 중',
}

/** 2g '어떤 위험을 알려드릴까요' 표의 이름과 보조 설명. */
export const KIND_SETTING: Record<Exclude<RiskKind, 'unknown'>, { label: string; hint?: string }> = {
  theft: { label: '절도 (미결제 반출)' },
  vandalism: { label: '기물 파손 · 폭력' },
  dine_and_dash: { label: '취식 후 미결제' },
  underage_purchase: { label: '미성년자 주류 · 담배' },
  loitering: { label: '장시간 배회', hint: '10분 이상' },
  sleeping: { label: '노숙 · 취침', hint: '심야만' },
  collapse: { label: '쓰러짐 (응급)', hint: '항상 최우선 · 끌 수 없음' },
}

/** 2g 표의 순서. 디자인 행 순서 그대로. */
export const KIND_ORDER: readonly Exclude<RiskKind, 'unknown'>[] = [
  'theft',
  'vandalism',
  'dine_and_dash',
  'underage_purchase',
  'loitering',
  'sleeping',
  'collapse',
]

export const RISK_LABEL: Record<RiskLevel, string> = { high: '높음', medium: '보통', low: '낮음' }
export const RISK_TONE: Record<RiskLevel, TagTone> = { high: 'high', medium: 'medium', low: 'low' }

export const STATE_LABEL: Record<EventState, string> = {
  unconfirmed: '미확인',
  confirmed: '확인됨',
  false_positive: '오탐',
}
export const STATE_TONE: Record<EventState, TagTone> = {
  unconfirmed: 'unconfirmed',
  confirmed: 'confirmed',
  false_positive: 'false-positive',
}

/** 2b ③ 위치 태그 — AI 판단에 쓴다. */
export const LOCATION_LABEL: Record<LocationTag, string> = {
  checkout: '계산대',
  entrance: '출입문',
  shelf: '진열대',
  dining: '취식대',
  storage: '창고',
  other: '기타',
}
export const LOCATION_ORDER: readonly LocationTag[] = [
  'checkout',
  'entrance',
  'shelf',
  'dining',
  'storage',
  'other',
]

export const CAMERA_STATE_LABEL: Record<CameraRuntimeState, string> = {
  connected: '연결됨',
  reconnecting: '재연결 중',
  disconnected: '끊김',
  auth_failed: '인증 실패',
  unknown: '중지',
}
export const CAMERA_STATE_TONE: Record<CameraRuntimeState, StatusTone> = {
  connected: 'connected',
  reconnecting: 'reconnecting',
  disconnected: 'disconnected',
  auth_failed: 'disconnected',
  unknown: 'idle',
}

/** 2b ③ '알림 빠르기' — UI 에서는 '조각 길이'라고 부르지 않는다. */
export const SPEED_OPTIONS: readonly { value: 30 | 60 | 300; label: string }[] = [
  { value: 30, label: '30초' },
  { value: 60, label: '1분' },
  { value: 300, label: '5분' },
]
