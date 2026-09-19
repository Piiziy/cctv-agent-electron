import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { VideoView, useVideoPlayer } from 'expo-video'
import { useEvent } from 'expo'
import type { EventDetail, EventState, NearbyCamera } from '@scene-stealer/api'
import { colors, radius, spacing } from '@scene-stealer/tokens'
import { Button, Caption, Card, Divider, EmptyState, RiskTag } from '../../components/ui'
import { notify } from '../../lib/alert'
import { useApi } from '../../lib/api'
import { useStores } from '../../lib/store-context'
import { EVENT_NAME, clockOf, durationLabel, timeOf, whenLabel } from '../../lib/format'
import { type as type_ } from '../../lib/typography'
import { reportAck } from '../../lib/web-push'

/** 알림으로 바로 열렸으면 돌아갈 화면이 없다 — 그때는 홈으로. */
const goBack = (): void => {
  if (router.canGoBack()) router.back()
  else router.replace('/')
}

/**
 * 2j 알림 상세 · 대응.
 * 푸시를 탭하면 여기로 온다. 첫 화면에서 판단하고 전화까지 가는 것이 목표라
 * 영상 → 위험 구간 → 무슨 일·어디·언제 → 112 → 확인/오탐 순서로 쌓았다 (뼈대 2j 그대로).
 * '전후 영상'·'다른 카메라'는 버튼으로 두고 누르면 목록을 편다 — 늘 펼쳐 두면 확인 버튼이 화면 밖으로 밀린다.
 */
export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const api = useApi()
  const { selected: store, refresh: refreshStores } = useStores()
  const [event, setEvent] = useState<EventDetail | null>(null)
  const [nearby, setNearby] = useState<readonly NearbyCamera[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [source, setSource] = useState<string | null>(null)
  const [openList, setOpenList] = useState<'segments' | 'nearby' | null>(null)
  const videoRef = useRef<VideoView>(null)

  useEffect(() => {
    void (async () => {
      if (!id) return
      try {
        const detail = await api.getEvent(id)
        setEvent(detail)
        setSource(detail.clipUrl)
        setNearby(await api.getNearbyCameras(id).catch(() => []))
      } catch (e) {
        setError(e instanceof Error ? e.message : '불러오지 못했습니다')
      }
    })()
  }, [api, id])

  /** 위험 클립은 자동 반복 재생 — 사장님이 다시 누를 필요가 없게. */
  const player = useVideoPlayer(source, (p) => {
    p.loop = true
    p.muted = true
    p.play()
  })

  // 영상이 안 나오면 검은 네모만 남는다. 못 불러왔다는 사실을 말해 준다.
  const { status } = useEvent(player, 'statusChange', { status: player.status })

  const setState = useCallback(
    async (state: EventState) => {
      if (!event) return
      setSaving(true)
      try {
        // 서버는 목록 모양만 돌려준다 (점수·클립·조각 없음). 통째로 바꾸면 상세가 비어 화면이 깨진다 — state 만 합친다.
        const updated = await api.setEventState(event.id, state)
        setEvent((current) => (current ? { ...current, state: updated.state } : current))
        // 탭의 '기록' 배지(미확인 수)가 매장 목록에서 나온다 — 처리한 만큼 바로 줄어야 한다.
        void refreshStores({ silent: true })
        if (state !== 'unconfirmed') void reportAck(event.id, state)
      } catch {
        notify('저장하지 못했습니다', '잠시 후 다시 시도해 주세요.')
      } finally {
        setSaving(false)
      }
    },
    [api, event, refreshStores],
  )

  const call112 = useCallback(async () => {
    const url = 'tel:112'
    if (await Linking.canOpenURL(url)) return Linking.openURL(url)
    notify('전화를 걸 수 없습니다', '이 기기에서는 전화 기능을 쓸 수 없습니다.')
  }, [])

  /** 공유 창을 띄운다. 공유 창이 없는 브라우저면 클립 링크를 복사해 둔다. */
  const share = useCallback(async () => {
    if (!event?.clipUrl) return
    const message = `${store?.name ?? ''} ${event.cameraName} · ${whenLabel(event.startedAt)}\n${EVENT_NAME} 감지\n${event.clipUrl}`
    try {
      await Share.share({ message })
    } catch (shareError) {
      // 사용자가 공유 창을 닫은 것은 실패가 아니다.
      if (shareError instanceof Error && shareError.name === 'AbortError') return
      await Clipboard.setStringAsync(event.clipUrl)
      notify('클립 링크를 복사했습니다', '메신저에 붙여 넣어 보낼 수 있습니다.')
    }
  }, [event, store])

  const toggle = (list: 'segments' | 'nearby') => setOpenList((current) => (current === list ? null : list))

  if (error) {
    return (
      <SafeAreaView style={styles.safe}>
        <Header onBack={goBack} title="알림 상세" />
        <Card style={styles.pad}>
          <EmptyState text={error} />
        </Card>
      </SafeAreaView>
    )
  }

  if (!event) {
    return (
      <SafeAreaView style={styles.safe}>
        <Header onBack={goBack} title="알림 상세" />
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </SafeAreaView>
    )
  }

  const resolved = event.state !== 'unconfirmed'

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Header onBack={goBack} title={store?.name ?? '알림 상세'} onShare={event.clipUrl ? share : undefined} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.player}>
          <Pressable accessibilityRole="button" accessibilityLabel="전체화면으로 보기" onPress={() => void videoRef.current?.enterFullscreen()}>
            <VideoView
              ref={videoRef}
              player={player}
              style={styles.video}
              contentFit="cover"
              nativeControls={false}
              fullscreenOptions={{ enable: true, orientation: 'landscape' }}
            />
          </Pressable>
          <Text style={styles.playerHint}>
            {status === 'error'
              ? '영상을 불러오지 못했습니다 — 인터넷 연결을 확인해 주세요'
              : status === 'loading'
                ? '영상을 불러오는 중…'
                : '탭하면 전체화면 · 소리 없이 반복 재생됩니다'}
          </Text>
        </View>

        <RiskRange event={event} segmentSeconds={store?.segmentSeconds ?? 60} />

        <View style={styles.summary}>
          <View style={styles.titleLine}>
            <Text style={styles.title}>{EVENT_NAME}</Text>
            <RiskTag risk={event.risk} />
          </View>
          <Text style={styles.where}>
            {event.cameraName} · {whenLabel(event.startedAt)} ({durationLabel(event.durationSec)})
          </Text>
          {/* 서버가 점수를 비워 줄 수 있다 (anomaly_score 가 null). 없는 숫자는 쓰지 않는다. */}
          {typeof event.anomalyScore === 'number' && typeof event.anomalyThreshold === 'number' ? (
            <Caption>
              AI 이상 점수 {event.anomalyScore.toFixed(2)} · 알림 기준 {event.anomalyThreshold.toFixed(2)} 이상
            </Caption>
          ) : null}
        </View>

        <Button label="📞 112 전화하기" tone="danger" size="large" onPress={() => void call112()} />
        {store?.address ? (
          <Card style={styles.addressCard}>
            <Caption>통화 중 읽어 주세요</Caption>
            <Text style={styles.address}>{store.address}</Text>
            <Text style={styles.addressMeta}>
              {store.name} · {event.cameraName} · {clockOf(event.startedAt)}
            </Text>
          </Card>
        ) : (
          <Caption>매장 주소가 없습니다 — PC 앱 설정에서 주소를 넣으면 통화 중에 여기 표시됩니다.</Caption>
        )}

        <Button
          label={openList === 'segments' ? '전후 영상 접기' : '전후 영상'}
          onPress={() => toggle('segments')}
        />
        {openList === 'segments' ? (
          <Card>
            {event.segments.length === 0 ? (
              <EmptyState text="보관된 조각이 없습니다." />
            ) : (
              event.segments.map((segment, index) => (
                <View key={segment.videoId}>
                  {index > 0 ? <Divider /> : null}
                  <ListButton
                    label={clockOf(segment.startedAt)}
                    meta={segment.playbackUrl ? (source === segment.playbackUrl ? '보는 중' : '이 조각 보기') : '재생 주소 없음'}
                    active={source === segment.playbackUrl}
                    onPress={() => segment.playbackUrl && setSource(segment.playbackUrl)}
                  />
                </View>
              ))
            )}
          </Card>
        ) : null}

        <View style={styles.pair}>
          <Button
            label="클립 저장 · 공유"
            onPress={() => void share()}
            disabled={!event.clipUrl}
            style={styles.half}
          />
          <Button
            label={openList === 'nearby' ? '다른 카메라 접기' : '다른 카메라'}
            onPress={() => toggle('nearby')}
            style={styles.half}
          />
        </View>
        {openList === 'nearby' ? (
          <>
            <Card>
              {nearby.length === 0 ? (
                <EmptyState text="같은 시각에 남은 다른 카메라 영상이 없습니다." />
              ) : (
                nearby.map((camera, index) => (
                  <View key={camera.cameraId}>
                    {index > 0 ? <Divider /> : null}
                    <ListButton
                      label={camera.name}
                      meta={source === camera.playbackUrl ? '보는 중' : camera.offsetSec === 0 ? '같은 시각' : `${camera.offsetSec}초 차이`}
                      active={source === camera.playbackUrl}
                      onPress={() => setSource(camera.playbackUrl)}
                    />
                  </View>
                ))
              )}
            </Card>
            <Caption>모든 카메라가 같은 시각에 잘리므로 같은 순간을 맞춰 볼 수 있습니다.</Caption>
          </>
        ) : null}

        {/* 뼈대 2j — 점선 아래 두 버튼. 오탐(테두리)과 확인(남색 채움)을 모양으로 갈라 잘못 누르지 않게 한다. */}
        <View style={styles.dashed} />
        <View style={styles.pair}>
          <Button
            label={event.state === 'false_positive' ? '✓ 문제 없음 (오탐)' : '문제 없음 (오탐)'}
            onPress={() => void setState('false_positive')}
            disabled={saving}
            style={styles.half}
          />
          <Button
            label={event.state === 'confirmed' ? '✓ 확인했어요' : '확인했어요'}
            tone="brand"
            onPress={() => void setState('confirmed')}
            disabled={saving}
            style={styles.half}
          />
        </View>
        <Caption>
          {resolved
            ? `${event.state === 'false_positive' ? '오탐으로 처리했습니다' : '확인 처리했습니다'} · PC 앱에도 같이 반영됩니다`
            : '확인/오탐은 PC 앱과 함께 반영됩니다.'}
        </Caption>
      </ScrollView>
    </SafeAreaView>
  )
}

/**
 * 뼈대 2j 의 '14:30 [━━■━━] 14:35' — 이 경고가 영상 조각 안의 어디쯤인지.
 * 경고가 들어 있는 조각을 찾아 그 길이를 막대로 그린다. 조각이 없으면 경고를 가운데 둔 같은 길이로 그린다.
 */
const RiskRange = ({ event, segmentSeconds }: { event: EventDetail; segmentSeconds: number }) => {
  const start = Date.parse(event.startedAt)
  const windowMs = Math.max(segmentSeconds, event.durationSec) * 1000
  const containing = event.segments
    .map((segment) => Date.parse(segment.startedAt))
    .filter((at) => Number.isFinite(at) && at <= start && start < at + windowMs)
    .sort((a, b) => b - a)[0]
  const from = containing ?? start - Math.max(0, windowMs - event.durationSec * 1000) / 2
  const left = Math.min(1, Math.max(0, (start - from) / windowMs))
  const width = Math.max(0.02, Math.min(1 - left, (event.durationSec * 1000) / windowMs))
  // 조각이 1분보다 짧으면 시·분만으로는 양 끝이 같은 글자가 된다.
  const label = (at: number): string => (windowMs < 60_000 ? clockOf : timeOf)(new Date(at).toISOString())

  return (
    <View style={styles.range} accessibilityLabel={`위험 구간 ${clockOf(event.startedAt)}부터 ${durationLabel(event.durationSec)}`}>
      <Text style={styles.rangeTime}>{label(from)}</Text>
      <View style={styles.rangeTrack}>
        <View style={[styles.rangeHit, { left: `${left * 100}%`, width: `${width * 100}%` }]} />
      </View>
      <Text style={styles.rangeTime}>{label(from + windowMs)}</Text>
    </View>
  )
}

/** 펼친 목록의 한 줄 — 지금 보는 영상은 파랗게. */
const ListButton = ({
  label, meta, active, onPress,
}: {
  label: string
  meta: string
  active: boolean
  onPress: () => void
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityState={{ selected: active }}
    onPress={onPress}
    style={({ pressed }) => [styles.listRow, pressed && { backgroundColor: colors.surfaceSubtle }]}
  >
    <Text style={[styles.listLabel, active && { color: colors.accent, fontWeight: '600' }]}>{label}</Text>
    <Text style={[styles.listMeta, active && { color: colors.accent }]}>{meta}</Text>
  </Pressable>
)

/** 뼈대 2j 머리 — 왼쪽 '‹ 매장 이름', 오른쪽 '공유 ↗'. */
const Header = ({
  onBack, title, onShare,
}: {
  onBack: () => void
  title: string
  onShare?: () => void
}) => (
  <View style={styles.header}>
    <Pressable accessibilityRole="button" accessibilityLabel="뒤로" hitSlop={12} onPress={onBack} style={styles.back}>
      <Text style={styles.backIcon}>‹</Text>
      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
    </Pressable>
    {onShare ? (
      <Pressable accessibilityRole="button" hitSlop={12} onPress={onShare}>
        <Text style={styles.headerAction}>공유 ↗</Text>
      </Pressable>
    ) : null}
  </View>
)

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
  backIcon: { ...type_.heading, fontSize: 24, lineHeight: 24, color: colors.text, marginTop: -2 },
  headerTitle: { ...type_.heading, color: colors.text, flexShrink: 1 },
  headerAction: { ...type_.label, fontWeight: '600', color: colors.accent },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pad: { margin: spacing.lg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  player: { gap: spacing.xs },
  video: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.medium, backgroundColor: colors.brand },
  playerHint: { ...type_.caption, color: colors.textSecondary },
  range: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rangeTime: { ...type_.caption, color: colors.textSecondary },
  rangeTrack: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  rangeHit: { position: 'absolute', top: 0, bottom: 0, backgroundColor: colors.danger },
  summary: { gap: spacing.xs },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...type_.title, color: colors.text },
  where: { ...type_.body, color: colors.text },
  addressCard: { gap: spacing.xs, padding: spacing.lg },
  address: { ...type_.heading, color: colors.text },
  addressMeta: { ...type_.caption, color: colors.textSecondary },
  pair: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  listRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  listLabel: { ...type_.body, color: colors.text },
  listMeta: { ...type_.caption, color: colors.textSecondary },
  dashed: { borderTopWidth: 1, borderColor: colors.border, borderStyle: 'dashed', marginVertical: spacing.xs },
})
