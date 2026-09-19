import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import type { EventListItem } from '@scene-stealer/api'
import { colors, radius, spacing } from '@scene-stealer/tokens'
import { EVENT_NAME, durationLabel, riskLabel, stateLabel, timeOf } from '../lib/format'
import { type as type_ } from '../lib/typography'

/** 목록 한 줄. 미확인은 왼쪽에 빨간 기둥을 세워 스캔할 때 먼저 보이게 한다 (뼈대 2l). */
export const EventRow = ({ event, onPress }: { event: EventListItem; onPress: () => void }) => {
  const unconfirmed = event.state === 'unconfirmed'
  const falsePositive = event.state === 'false_positive'
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${EVENT_NAME} 위험도 ${riskLabel[event.risk]} ${event.cameraName} ${timeOf(event.startedAt)} ${stateLabel[event.state]}`}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceSubtle }]}
    >
      {unconfirmed ? <View style={styles.marker} /> : <View style={styles.markerSpace} />}
      {/* 서버가 준 첫 장면. 없으면 회색 자리만 둔다 (PC 2c 피드와 같다). */}
      <View style={[styles.thumb, !unconfirmed && styles.dimmed]}>
        {event.thumbnailUrl ? (
          <Image source={{ uri: event.thumbnailUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : null}
      </View>
      <View style={styles.body}>
        <View style={styles.titleLine}>
          <Text
            style={[
              styles.title,
              !unconfirmed && { color: colors.textSecondary },
              falsePositive && styles.strike,
            ]}
          >
            {EVENT_NAME}
          </Text>
          <Text style={[styles.risk, event.risk === 'high' && unconfirmed && { color: colors.danger }]}>
            {riskLabel[event.risk]}
          </Text>
        </View>
        <Text style={styles.meta}>
          {event.cameraName} · {timeOf(event.startedAt)} · {durationLabel(event.durationSec)} · {stateLabel[event.state]}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingRight: spacing.lg },
  marker: { width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: colors.danger },
  markerSpace: { width: 3 },
  thumb: {
    width: 64,
    height: 48,
    borderRadius: radius.small,
    backgroundColor: colors.surfaceSubtle,
    overflow: 'hidden',
  },
  dimmed: { opacity: 0.6 },
  body: { flex: 1, gap: 2 },
  titleLine: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  title: { ...type_.heading, color: colors.text },
  // 오탐은 PC 2c 피드처럼 줄을 긋는다.
  strike: { textDecorationLine: 'line-through' },
  risk: { ...type_.label, color: colors.textSecondary },
  meta: { ...type_.caption, color: colors.textSecondary },
})
