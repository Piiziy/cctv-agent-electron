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

export const summaryLine = (s: WeeklySummary): string =>
  `이번 주 · 위험 ${s.risky}건 · 오탐 ${s.falsePositive}건`

export const repeatLine = (s: WeeklySummary): string | null =>
  s.repeatedHour === null ? null : `${s.repeatedHour}시대에 가장 잦았습니다`
