import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { VideoView, useVideoPlayer } from 'expo-video'
import { useEvent } from 'expo'
import type { EventDetail, EventState, NearbyCamera } from '@scene-stealer/api'
import { colors, radius, spacing, type as type_ } from '@scene-stealer/tokens'
import { Button, Caption, Card, Divider, EmptyState, RiskTag } from '../../components/ui'
import { useApi } from '../../lib/api'
import { useStores } from '../../lib/store-context'
import { EVENT_NAME, clockOf, durationLabel, stateLabel, whenLabel } from '../../lib/format'

/**
 * 2j 알림 상세 · 대응.
 * 푸시를 탭하면 여기로 온다. 첫 화면에서 판단하고 전화까지 가는 것이 목표라
 * 영상 → 무슨 일·어디·언제 → 112 → 확인/오탐 순서로 쌓았다.
 */
export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const api = useApi()
  const { selected: store } = useStores()
  const [event, setEvent] = useState<EventDetail | null>(null)
  const [nearby, setNearby] = useState<readonly NearbyCamera[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [source, setSource] = useState<string | null>(null)
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
        setEvent(await api.setEventState(event.id, state))
      } catch {
        Alert.alert('저장하지 못했습니다', '잠시 후 다시 시도해 주세요.')
      } finally {
        setSaving(false)
      }
    },
    [api, event],
  )

  const call112 = useCallback(async () => {
    const url = 'tel:112'
    if (await Linking.canOpenURL(url)) return Linking.openURL(url)
    Alert.alert('전화를 걸 수 없습니다', '이 기기에서는 전화 기능을 쓸 수 없습니다.')
  }, [])

  const share = useCallback(async () => {
    if (!event?.clipUrl) return
    const when = whenLabel(event.startedAt)
    await Share.share({
      message: `${store?.name ?? ''} ${event.cameraName} · ${when}\n${EVENT_NAME} 감지\n${event.clipUrl}`,
    })
  }, [event, store])

  if (error) {
    return (
      <SafeAreaView style={styles.safe}>
        <Header onBack={() => router.back()} title="알림 상세" />
        <Card style={styles.pad}>
          <EmptyState text={error} />
        </Card>
      </SafeAreaView>
    )
  }

  if (!event) {
    return (
      <SafeAreaView style={styles.safe}>
        <Header onBack={() => router.back()} title="알림 상세" />
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </SafeAreaView>
    )
  }

  const resolved = event.state !== 'unconfirmed'

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Header onBack={() => router.back()} title={store?.name ?? '알림 상세'} onShare={event.clipUrl ? share : undefined} />
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

        <View style={styles.titleLine}>
          <Text style={styles.title}>{EVENT_NAME}</Text>
          <RiskTag risk={event.risk} />
        </View>
        <Text style={styles.where}>
          {event.cameraName} · {whenLabel(event.startedAt)} ({durationLabel(event.durationSec)})
        </Text>
        <Caption>
          AI 이상 점수 {event.anomalyScore.toFixed(2)} · 알림 기준 {event.anomalyThreshold.toFixed(2)} 이상
        </Caption>

        <Button label="📞 112 전화하기" tone="danger" onPress={() => void call112()} />
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

        <View style={styles.section}>
          <Caption>전후 영상</Caption>
          <Card>
            {event.segments.length === 0 ? (
              <EmptyState text="보관된 조각이 없습니다." />
            ) : (
              event.segments.map((segment, index) => (
                <View key={segment.videoId}>
                  {index > 0 ? <Divider /> : null}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => segment.playbackUrl && setSource(segment.playbackUrl)}
                    style={({ pressed }) => [styles.segmentRow, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={styles.segmentTime}>{clockOf(segment.startedAt)}</Text>
                    <Text style={styles.segmentMeta}>
                      {segment.playbackUrl ? '이 조각 보기' : '재생 주소 없음'}
                    </Text>
                  </Pressable>
                </View>
              ))
            )}
          </Card>
        </View>

        <View style={styles.section}>
          <Caption>같은 시각 다른 카메라</Caption>
          <Card>
            {nearby.length === 0 ? (
              <EmptyState text="같은 시각에 남은 다른 카메라 영상이 없습니다." />
            ) : (
              nearby.map((camera, index) => (
                <View key={camera.cameraId}>
                  {index > 0 ? <Divider /> : null}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setSource(camera.playbackUrl)}
                    style={({ pressed }) => [styles.segmentRow, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={styles.segmentTime}>{camera.name}</Text>
                    <Text style={styles.segmentMeta}>
                      {camera.offsetSec === 0 ? '같은 시각' : `${camera.offsetSec}초 차이`}
                    </Text>
                  </Pressable>
                </View>
              ))
            )}
          </Card>
          <Caption>모든 카메라가 같은 시각에 잘리므로 같은 순간을 맞춰 볼 수 있습니다.</Caption>
        </View>

        <View style={styles.actions}>
          {/* 오탐 버튼은 확인과 붙여 두지 않는다 — 잘못 누르면 학습 데이터가 오염된다. */}
          <Button
            label="문제 없음 (오탐)"
            onPress={() => void setState('false_positive')}
            disabled={saving}
            style={styles.falsePositive}
          />
          <Button
            label="확인했어요"
            tone="primary"
            onPress={() => void setState('confirmed')}
            disabled={saving}
          />
        </View>
        {resolved ? (
          <Caption>
            {stateLabel[event.state]} 처리되었습니다 · PC 앱에도 같이 반영됩니다
          </Caption>
        ) : (
          <Caption>확인/오탐은 PC 앱과 함께 반영됩니다.</Caption>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const Header = ({
  onBack, title, onShare,
}: {
  onBack: () => void
  title: string
  onShare?: () => void
}) => (
  <View style={styles.header}>
    <Pressable accessibilityRole="button" accessibilityLabel="뒤로" hitSlop={12} onPress={onBack}>
      <Text style={styles.headerIcon}>‹</Text>
    </Pressable>
    <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
    {onShare ? (
      <Pressable accessibilityRole="button" accessibilityLabel="공유" hitSlop={12} onPress={onShare}>
        <Text style={styles.headerIcon}>↗</Text>
      </Pressable>
    ) : (
      <View style={styles.headerSpacer} />
    )}
  </View>
)

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  headerIcon: { ...type_.heading, color: colors.accent, fontSize: 22 },
  headerTitle: { ...type_.heading, color: colors.text, flex: 1, textAlign: 'center' },
  headerSpacer: { width: 22 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pad: { margin: spacing.lg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  player: { gap: spacing.xs },
  video: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.medium, backgroundColor: colors.brand },
  playerHint: { ...type_.caption, color: colors.textSecondary },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...type_.title, color: colors.text },
  where: { ...type_.body, color: colors.text },
  addressCard: { gap: spacing.xs },
  address: { ...type_.heading, color: colors.text },
  addressMeta: { ...type_.caption, color: colors.textSecondary },
  section: { gap: spacing.sm, marginTop: spacing.sm },
  segmentRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.md },
  segmentTime: { ...type_.body, color: colors.text },
  segmentMeta: { ...type_.caption, color: colors.textSecondary },
  actions: { gap: spacing.xl, marginTop: spacing.lg },
  falsePositive: { borderStyle: 'dashed' },
})
