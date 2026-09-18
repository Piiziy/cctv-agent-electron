import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { EventListItem } from '@scene-stealer/api'
import { colors, radius, spacing, type as type_ } from '@scene-stealer/tokens'
import { EVENT_NAME, durationLabel, riskLabel, stateLabel, timeOf } from '../lib/format'

/** 목록 한 줄. 미확인은 왼쪽에 빨간 기둥을 세워 스캔할 때 먼저 보이게 한다 (뼈대 2l). */
export const EventRow = ({ event, onPress }: { event: EventListItem; onPress: () => void }) => {
  const unconfirmed = event.state === 'unconfirmed'
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${EVENT_NAME} 위험도 ${riskLabel[event.risk]} ${event.cameraName} ${timeOf(event.startedAt)} ${stateLabel[event.state]}`}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceSubtle }]}
    >
      {unconfirmed ? <View style={styles.marker} /> : <View style={styles.markerSpace} />}
      <View style={styles.thumb} />
      <View style={styles.body}>
        <View style={styles.titleLine}>
          <Text style={[styles.title, !unconfirmed && { color: colors.textSecondary }]}>{EVENT_NAME}</Text>
          <Text style={[styles.risk, event.risk === 'high' && { color: colors.danger }]}>
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
  thumb: { width: 64, height: 48, borderRadius: radius.small, backgroundColor: colors.surfaceSubtle },
  body: { flex: 1, gap: 2 },
  titleLine: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  title: { ...type_.heading, color: colors.text },
  risk: { ...type_.label, color: colors.textSecondary },
  meta: { ...type_.caption, color: colors.textSecondary },
})
