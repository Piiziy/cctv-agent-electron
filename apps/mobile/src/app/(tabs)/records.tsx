import { useCallback, useMemo, useState } from 'react'
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useFocusEffect } from 'expo-router'
import type { EventListItem, MonitoringCamera, TimelineCamera } from '@scene-stealer/api'
import { colors, radius, spacing } from '@scene-stealer/tokens'
import { Caption, Card, Chip, Divider, EmptyState, Heading, WEB_FRAME_WIDTH } from '../../components/ui'
import { EventRow } from '../../components/EventRow'
import { useApi } from '../../lib/api'
import { dateHeading, localDate, timeOf } from '../../lib/format'
import { repeatLine, summaryCounts, weeklySummary } from '../../lib/summary'
import { useStores } from '../../lib/store-context'
import { type as type_ } from '../../lib/typography'

type StateFilter = 'all' | 'unconfirmed' | 'high'

/**
 * 2l 기록.
 * 뼈대의 '종류' 필터는 없다 — 위험 종류를 나누지 않기로 했으므로 남는 축은 상태·위험도·카메라뿐이다.
 * 필터는 뼈대처럼 한 줄에 둔다 (넘치면 옆으로 민다). 카메라는 칩 하나('카메라 ▾')를 눌러 고른다 —
 * 카메라 수만큼 칩을 늘어놓으면 목록이 화면 아래로 밀린다.
 * 카메라가 끊겨 영상이 없던 구간도 줄로 끼워 넣어 기록의 공백을 설명한다.
 */
export default function RecordsScreen() {
  const api = useApi()
  const insets = useSafeAreaInsets()
  const { selected } = useStores()
  const [events, setEvents] = useState<readonly EventListItem[]>([])
  const [cameras, setCameras] = useState<readonly MonitoringCamera[]>([])
  const [gaps, setGaps] = useState<readonly TimelineCamera[]>([])
  const [stateFilter, setStateFilter] = useState<StateFilter>('all')
  const [cameraId, setCameraId] = useState<string | null>(null)
  const [pickingCamera, setPickingCamera] = useState(false)
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
  const cameraName = cameras.find((camera) => camera.id === cameraId)?.name ?? null

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

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroller}
          contentContainerStyle={styles.filters}
        >
          <Chip label="전체" selected={stateFilter === 'all'} onPress={() => setStateFilter('all')} />
          <Chip
            label={unconfirmed > 0 ? `미확인 ${unconfirmed}` : '미확인'}
            selected={stateFilter === 'unconfirmed'}
            onPress={() => setStateFilter('unconfirmed')}
          />
          <Chip label="높음" selected={stateFilter === 'high'} onPress={() => setStateFilter('high')} />
          <Chip
            label={`${cameraName ?? '카메라'} ▾`}
            selected={cameraId !== null}
            onPress={() => setPickingCamera(true)}
          />
        </ScrollView>

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

        {/* 뼈대 2l — '이번 주 요약 · 위험 12건 · 오탐 3건' + 반복되는 시간대 한 줄. */}
        <Card style={styles.summary}>
          <Text style={styles.summaryText}>
            <Text style={styles.summaryTitle}>이번 주 요약</Text> · {summaryCounts(summary)}
          </Text>
          {repeat ? <Caption>{repeat}</Caption> : null}
        </Card>
      </ScrollView>

      {/* 카메라 고르기 — 아래에서 올라오는 목록. 바깥을 누르면 닫힌다. */}
      <Modal visible={pickingCamera} transparent animationType="fade" onRequestClose={() => setPickingCamera(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPickingCamera(false)} accessibilityLabel="닫기">
          <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <Text style={styles.sheetTitle}>카메라</Text>
            <Card>
              {[{ id: null, name: '모든 카메라' }, ...cameras].map((camera, index) => {
                const active = cameraId === camera.id
                return (
                  <View key={camera.id ?? 'all'}>
                    {index > 0 ? <Divider /> : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => {
                        setCameraId(camera.id)
                        setPickingCamera(false)
                      }}
                      style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.surfaceSubtle }]}
                    >
                      <Text style={[styles.optionText, active && styles.optionActive]}>{camera.name}</Text>
                      {active ? <Text style={styles.optionCheck}>✓</Text> : null}
                    </Pressable>
                  </View>
                )
              })}
            </Card>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  unconfirmed: { ...type_.label, color: colors.danger },
  // 칩 줄은 화면 끝까지 밀리게 좌우 여백 밖으로 편다.
  filterScroller: { marginHorizontal: -spacing.lg, flexGrow: 0 },
  filters: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg },
  group: { gap: spacing.sm },
  gap: {
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  gapText: { ...type_.caption, color: colors.textSecondary },
  summary: { gap: spacing.xs, padding: spacing.lg },
  summaryText: { ...type_.body, color: colors.text, lineHeight: 20 },
  summaryTitle: { fontWeight: '700' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20, 35, 61, 0.4)' },
  sheet: {
    width: '100%',
    maxWidth: WEB_FRAME_WIDTH,
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.large,
    borderTopRightRadius: radius.large,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sheetTitle: { ...type_.heading, color: colors.text },
  option: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  optionText: { ...type_.body, fontSize: 15, color: colors.text },
  optionActive: { fontWeight: '700', color: colors.accent },
  optionCheck: { ...type_.body, fontSize: 15, fontWeight: '700', color: colors.accent },
})
