import { useState, type ReactNode } from 'react'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { colors, radius, spacing, toggle as toggleSpec } from '@scene-stealer/tokens'
import type { Risk } from '@scene-stealer/api'
import { riskLabel } from '../lib/format'
import { bodyFont, type as type_ } from '../lib/typography'

/** 웹을 넓은 창으로 열었을 때 앱이 차지하는 폭 (_layout). 아래에서 올라오는 시트도 이 폭을 넘지 않는다. */
export const WEB_FRAME_WIDTH = 480

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

/** 칩 앞의 상태 점 — 디자인시스템 4장 '상태 점' (연결됨 초록 · 끊김 빨강 · 중지 회색). */
export type ChipDot = 'ok' | 'danger' | 'idle'

const DOT_COLOR: Record<ChipDot, string> = {
  ok: colors.ok,
  danger: colors.danger,
  idle: colors.textSecondary,
}

export const Chip = ({
  label, selected = false, tone = 'default', dot, onPress,
}: {
  label: string
  selected?: boolean
  tone?: 'default' | 'danger'
  dot?: ChipDot
  onPress?: () => void
}) => (
  <Pressable
    onPress={onPress}
    disabled={!onPress}
    accessibilityRole={onPress ? 'button' : 'text'}
    accessibilityState={onPress ? { selected } : undefined}
    style={({ pressed }) => [
      styles.chip,
      selected && styles.chipSelected,
      tone === 'danger' && styles.chipDanger,
      pressed && onPress ? { opacity: 0.7 } : null,
    ]}
  >
    {dot ? <View style={[styles.chipDot, { backgroundColor: DOT_COLOR[dot] }]} /> : null}
    <Text style={[styles.chipText, selected && { color: colors.textInverse }, tone === 'danger' && { color: colors.danger }]}>
      {label}
    </Text>
  </Pressable>
)

/**
 * primary = 파랑(sub) — 화면 안의 주요 동작. brand = 남색(main) — 흐름을 끝내는 버튼 하나 ('확인했어요').
 * 디자인시스템 4장의 action(blue) · primary(navy) 구분을 그대로 따른다.
 */
type ButtonTone = 'primary' | 'brand' | 'danger' | 'neutral'

const BUTTON_FILL: Record<Exclude<ButtonTone, 'neutral'>, string> = {
  primary: colors.accent,
  brand: colors.brand,
  danger: colors.danger,
}

export const Button = ({
  label, onPress, tone = 'neutral', size = 'regular', disabled = false, loading = false, style,
}: {
  label: string
  onPress: () => void
  tone?: ButtonTone
  /** large = 뼈대 2j 의 '112 전화하기'처럼 한눈에 들어와야 하는 버튼. */
  size?: 'regular' | 'large'
  disabled?: boolean
  loading?: boolean
  style?: ViewStyle
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled || loading}
    accessibilityRole="button"
    accessibilityState={{ disabled: disabled || loading }}
    style={({ pressed }) => [
      styles.button,
      size === 'large' && styles.buttonLarge,
      tone !== 'neutral' && { backgroundColor: BUTTON_FILL[tone], borderColor: BUTTON_FILL[tone] },
      (disabled || loading) && { opacity: 0.5 },
      pressed && { opacity: 0.8 },
      style,
    ]}
  >
    {loading ? (
      <ActivityIndicator color={tone === 'neutral' ? colors.text : colors.textInverse} />
    ) : (
      <Text
        style={[
          styles.buttonText,
          size === 'large' && styles.buttonTextLarge,
          tone !== 'neutral' && { color: colors.textInverse },
        ]}
      >
        {label}
      </Text>
    )}
  </Pressable>
)

/**
 * 입력 칸. 디자인시스템 4장 '입력' — 누르면 테두리가 border/focus(blue/600) 로 바뀐다.
 * 브라우저가 그리는 검은 포커스 테두리는 끈다 (그 자리를 파란 테두리가 대신한다).
 */
export const TextField = ({ style, onFocus, onBlur, editable = true, ...props }: TextInputProps) => {
  const [focused, setFocused] = useState(false)
  return (
    <TextInput
      {...props}
      editable={editable}
      placeholderTextColor={colors.textSecondary}
      onFocus={(event) => {
        setFocused(true)
        onFocus?.(event)
      }}
      onBlur={(event) => {
        setFocused(false)
        onBlur?.(event)
      }}
      style={[
        styles.field,
        WEB_NO_OUTLINE,
        focused && { borderColor: colors.borderFocus },
        !editable && { backgroundColor: colors.surfaceSubtle, color: colors.textSecondary },
        style,
      ]}
    />
  )
}

/**
 * 크롬은 포커스 테두리를 outline-style:auto 로 그려서 굵기(outlineWidth 0)만으로는 지워지지 않는다.
 * RN 타입에는 'none' 이 없지만 react-native-web 은 그대로 CSS 로 넘긴다.
 */
const WEB_NO_OUTLINE = (Platform.OS === 'web' ? { outlineStyle: 'none' } : null) as TextStyle | null

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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
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
  field: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.medium,
    paddingHorizontal: spacing.lg,
    ...type_.body,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  buttonLarge: { minHeight: 56 },
  // 디자인시스템 4장 버튼 글자 — 15px semibold.
  buttonText: { ...type_.label, fontSize: 15, fontWeight: '600', letterSpacing: -0.15, color: colors.text },
  buttonTextLarge: { fontSize: 17, fontWeight: '700', letterSpacing: -0.17 },
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
  chevron: { ...bodyFont, fontSize: 18, color: colors.textSecondary, marginTop: -2 },
  divider: { height: 1, backgroundColor: colors.border },
  empty: { paddingVertical: spacing.xxl, alignItems: 'center' },
})
