import type { EventListItem } from '@scene-stealer/api'

export interface WeeklySummary {
  readonly risky: number
  readonly falsePositive: number
  /** 같은 시간대에 3건 이상 몰렸을 때만. 근거 없는 '패턴'은 말하지 않는다. */
  readonly repeatedHour: number | null
}

const WEEK_MS = 7 * 86_400_000

/**
 * 뼈대 2l 의 '이번 주 요약'.
 * 뼈대엔 "신고 1건" 도 있지만 신고 여부를 기록하는 필드가 계약에 없다 — 없는 값을 지어내지 않는다.
 */
export const weeklySummary = (
  events: readonly EventListItem[],
  now: Date = new Date(),
): WeeklySummary => {
  const since = now.getTime() - WEEK_MS
  const week = events.filter((e) => Date.parse(e.startedAt) >= since)
  const falsePositive = week.filter((e) => e.state === 'false_positive').length

  const byHour = week.reduce<Record<number, number>>((acc, event) => {
    const hour = new Date(event.startedAt).getHours()
    return { ...acc, [hour]: (acc[hour] ?? 0) + 1 }
  }, {})
  const top = Object.entries(byHour).sort(([, a], [, b]) => b - a)[0]

  return {
    risky: week.length - falsePositive,
    falsePositive,
    repeatedHour: top && top[1] >= 3 ? Number(top[0]) : null,
  }
}

/** "위험 12건 · 오탐 3건" — 요약 카드는 앞에 굵은 '이번 주 요약'을 붙인다. */
export const summaryCounts = (s: WeeklySummary): string => `위험 ${s.risky}건 · 오탐 ${s.falsePositive}건`

export const summaryLine = (s: WeeklySummary): string => `이번 주 요약 · ${summaryCounts(s)}`

/** 0–23시를 말로 — "새벽 1시", "오후 3시". 뼈대의 '새벽 1시대에 반복됨' 표현을 따른다. */
const hourLabel = (hour: number): string => {
  if (hour === 0) return '밤 12시'
  if (hour < 6) return `새벽 ${hour}시`
  if (hour < 12) return `오전 ${hour}시`
  if (hour === 12) return '낮 12시'
  if (hour < 18) return `오후 ${hour - 12}시`
  if (hour < 21) return `저녁 ${hour - 12}시`
  return `밤 ${hour - 12}시`
}

export const repeatLine = (s: WeeklySummary): string | null =>
  s.repeatedHour === null ? null : `주로 ${hourLabel(s.repeatedHour)}대에 반복됐습니다`
