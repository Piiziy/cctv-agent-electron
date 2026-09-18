import { useCallback, useMemo, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useFocusEffect } from 'expo-router'
import type { EventListItem, MonitoringCamera, TimelineCamera } from '@scene-stealer/api'
import { colors, spacing, type as type_ } from '@scene-stealer/tokens'
import { Caption, Card, Chip, EmptyState, Heading } from '../../components/ui'
import { EventRow } from '../../components/EventRow'
import { useApi } from '../../lib/api'
import { dateHeading, localDate, timeOf } from '../../lib/format'
import { repeatLine, summaryLine, weeklySummary } from '../../lib/summary'
import { useStores } from '../../lib/store-context'

type StateFilter = 'all' | 'unconfirmed' | 'high'

/**
 * 2l 기록.
 * 뼈대의 '종류' 필터는 없다 — 위험 종류를 나누지 않기로 했으므로 남는 축은 상태·위험도·카메라뿐이다.
 * 카메라가 끊겨 영상이 없던 구간도 줄로 끼워 넣어 기록의 공백을 설명한다.
 */
export default function RecordsScreen() {
  const api = useApi()
  const { selected } = useStores()
  const [events, setEvents] = useState<readonly EventListItem[]>([])
  const [cameras, setCameras] = useState<readonly MonitoringCamera[]>([])
  const [gaps, setGaps] = useState<readonly TimelineCamera[]>([])
  const [stateFilter, setStateFilter] = useState<StateFilter>('all')
  const [cameraId, setCameraId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!selected) return
    setBusy(true)
    try {
      const today = localDate(new Date().toISOString())
      const [page, timeline, monitoring] = await Promise.all([
        api.listEvents(selected.id),
        api.getTimeline(selected.id, today),
        api.getMonitoring(selected.id),
      ])
      setEvents(page.items)
      setGaps(timeline.filter((camera) => camera.gaps.length > 0))
      setCameras(monitoring.cameras)
    } finally {
      setBusy(false)
    }
  }, [api, selected])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  const shown = useMemo(
    () =>
      events
        .filter((e) =>
          stateFilter === 'unconfirmed'
            ? e.state === 'unconfirmed'
            : stateFilter === 'high'
              ? e.risk === 'high'
              : true,
        )
        .filter((e) => (cameraId ? e.cameraId === cameraId : true)),
    [events, stateFilter, cameraId],
  )

  /** 날짜별로 묶는다 — 뼈대의 "오늘 · 9월 11일 (목)" 머리글. */
  const groups = useMemo(() => {
    const byDate = shown.reduce<Record<string, EventListItem[]>>(
      (acc, event) => {
        const key = localDate(event.startedAt)
        return { ...acc, [key]: [...(acc[key] ?? []), event] }
      },
      {},
    )
    return Object.entries(byDate).sort(([a], [b]) => (a < b ? 1 : -1))
  }, [shown])

  const summary = useMemo(() => weeklySummary(events), [events])
  const unconfirmed = events.filter((e) => e.state === 'unconfirmed').length
  const today = localDate(new Date().toISOString())
  const shownGaps = gaps.filter((camera) => (cameraId ? camera.cameraId === cameraId : true))
  const repeat = repeatLine(summary)

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void load()} />}
      >
        <View style={styles.head}>
          <Heading>위험 기록 · {selected?.name ?? ''}</Heading>
          {unconfirmed > 0 ? <Text style={styles.unconfirmed}>미확인 {unconfirmed}</Text> : null}
        </View>

        <View style={styles.chips}>
          <Chip label="전체" selected={stateFilter === 'all'} onPress={() => setStateFilter('all')} />
          <Chip
            label="미확인"
            selected={stateFilter === 'unconfirmed'}
            onPress={() => setStateFilter('unconfirmed')}
          />
          <Chip label="높음" selected={stateFilter === 'high'} onPress={() => setStateFilter('high')} />
        </View>

        <View style={styles.chips}>
          <Chip label="모든 카메라" selected={cameraId === null} onPress={() => setCameraId(null)} />
          {cameras.map((camera) => (
            <Chip
              key={camera.id}
              label={camera.name}
              selected={cameraId === camera.id}
              onPress={() => setCameraId(camera.id)}
            />
          ))}
        </View>

        {groups.length === 0 ? (
          <Card>
            <EmptyState text="해당하는 기록이 없습니다." />
          </Card>
        ) : (
          groups.map(([date, items]) => (
            <View key={date} style={styles.group}>
              <Caption>{dateHeading(items[0]!.startedAt)}</Caption>
              <Card>
                {items.map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    onPress={() => router.push(`/events/${event.id}`)}
                  />
                ))}
                {date === today
                  ? shownGaps.flatMap((camera) =>
                      camera.gaps.map((gap) => (
                        <View key={`${camera.cameraId}-${gap.from}`} style={styles.gap}>
                          <Text style={styles.gapText}>
                            — {timeOf(gap.from)}~ '{camera.name}' 카메라 끊김 (영상 없음) —
                          </Text>
                        </View>
                      )),
                    )
                  : null}
              </Card>
            </View>
          ))
        )}

        <Card style={styles.summary}>
          <Text style={styles.summaryTitle}>{summaryLine(summary)}</Text>
          {repeat ? <Caption>{repeat}</Caption> : null}
        </Card>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  unconfirmed: { ...type_.label, color: colors.danger },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  group: { gap: spacing.sm },
  gap: {
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  gapText: { ...type_.caption, color: colors.textSecondary },
  summary: { gap: spacing.xs },
  summaryTitle: { ...type_.heading, color: colors.text },
})
