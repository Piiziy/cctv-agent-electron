import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { colors, radius, spacing, toggle as toggleSpec, type as type_ } from '@scene-stealer/tokens'
import type { Risk } from '@scene-stealer/api'
import { riskLabel } from '../lib/format'

export const Card = ({ children, style }: { children: ReactNode; style?: ViewStyle }) => (
  <View style={[styles.card, style]}>{children}</View>
)

export const Heading = ({ children }: { children: ReactNode }) => (
  <Text style={styles.heading}>{children}</Text>
)

export const Caption = ({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'danger' }) => (
  <Text style={[styles.caption, tone === 'danger' && { color: colors.danger }]}>{children}</Text>
)

/** 위험도 표시 — 종류가 없으므로 이게 유일한 구분이다. */
export const RiskTag = ({ risk }: { risk: Risk }) => (
  <View style={[styles.riskTag, risk === 'high' && styles.riskTagHigh]}>
    <Text style={[styles.riskTagText, risk === 'high' && { color: colors.textInverse }]}>
      위험도 {riskLabel[risk]}
    </Text>
  </View>
)

export const Chip = ({
  label, selected = false, tone = 'default', onPress,
}: {
  label: string
  selected?: boolean
  tone?: 'default' | 'danger'
  onPress?: () => void
}) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityState={{ selected }}
    style={({ pressed }) => [
      styles.chip,
      selected && styles.chipSelected,
      tone === 'danger' && styles.chipDanger,
      pressed && onPress ? { opacity: 0.7 } : null,
    ]}
  >
    <Text style={[styles.chipText, selected && { color: colors.textInverse }, tone === 'danger' && { color: colors.danger }]}>
      {label}
    </Text>
  </Pressable>
)

type ButtonTone = 'primary' | 'danger' | 'neutral'

export const Button = ({
  label, onPress, tone = 'neutral', disabled = false, loading = false, style,
}: {
  label: string
  onPress: () => void
  tone?: ButtonTone
  disabled?: boolean
  loading?: boolean
  style?: ViewStyle
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled || loading}
    accessibilityRole="button"
    style={({ pressed }) => [
      styles.button,
      tone === 'primary' && { backgroundColor: colors.accent, borderColor: colors.accent },
      tone === 'danger' && { backgroundColor: colors.danger, borderColor: colors.danger },
      (disabled || loading) && { opacity: 0.5 },
      pressed && { opacity: 0.8 },
      style,
    ]}
  >
    {loading ? (
      <ActivityIndicator color={tone === 'neutral' ? colors.text : colors.textInverse} />
    ) : (
      <Text style={[styles.buttonText, tone !== 'neutral' && { color: colors.textInverse }]}>{label}</Text>
    )}
  </Pressable>
)

/** 피그마 toggle switch 의 비율을 쓰되 손가락이 닿는 크기로 키웠다. */
export const Toggle = ({ value, onChange }: { value: boolean; onChange: (next: boolean) => void }) => (
  <Pressable
    onPress={() => onChange(!value)}
    accessibilityRole="switch"
    accessibilityState={{ checked: value }}
    hitSlop={12}
    style={[styles.toggleTrack, { backgroundColor: value ? toggleSpec.onColor : toggleSpec.offColor }]}
  >
    <View style={[styles.toggleKnob, value && { alignSelf: 'flex-end' }]} />
  </Pressable>
)

export const ListRow = ({
  label, value, onPress, danger = false,
}: {
  label: string
  value?: ReactNode
  onPress?: () => void
  danger?: boolean
}) => (
  <Pressable
    onPress={onPress}
    disabled={!onPress}
    accessibilityRole={onPress ? 'button' : undefined}
    style={({ pressed }) => [styles.row, pressed && onPress ? { backgroundColor: colors.surfaceSubtle } : null]}
  >
    <Text style={[styles.rowLabel, danger && { color: colors.danger }]}>{label}</Text>
    <View style={styles.rowValue}>
      {typeof value === 'string' ? <Text style={styles.rowValueText}>{value}</Text> : value}
      {onPress ? <Text style={styles.chevron}>›</Text> : null}
    </View>
  </Pressable>
)

export const Divider = () => <View style={styles.divider} />

export const EmptyState = ({ text }: { text: string }) => (
  <View style={styles.empty}>
    <Text style={styles.caption}>{text}</Text>
  </View>
)

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bg,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  heading: { ...type_.heading, color: colors.text },
  caption: { ...type_.caption, color: colors.textSecondary },
  riskTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.small,
    backgroundColor: colors.surfaceError,
  },
  riskTagHigh: { backgroundColor: colors.danger },
  riskTagText: { ...type_.tiny, color: colors.danger },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  chipSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipDanger: { borderColor: colors.danger },
  chipText: { ...type_.label, color: colors.text },
  button: {
    minHeight: 48,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonText: { ...type_.label, fontSize: 15, color: colors.text },
  toggleTrack: {
    width: toggleSpec.track.width,
    height: toggleSpec.track.height,
    borderRadius: toggleSpec.track.radius,
    padding: 3,
    justifyContent: 'center',
  },
  toggleKnob: {
    width: toggleSpec.knob.size,
    height: toggleSpec.knob.size,
    borderRadius: toggleSpec.knob.radius,
    backgroundColor: toggleSpec.knob.color,
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  rowLabel: { ...type_.body, color: colors.text, flexShrink: 1 },
  rowValue: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  rowValueText: { ...type_.body, color: colors.textSecondary },
  chevron: { fontSize: 18, color: colors.textSecondary, marginTop: -2 },
  divider: { height: 1, backgroundColor: colors.border },
  empty: { paddingVertical: spacing.xxl, alignItems: 'center' },
})
