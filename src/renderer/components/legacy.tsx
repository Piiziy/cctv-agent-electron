/**
 * ⚠️ 한시적 어댑터. 지울 파일이다.
 *
 * ui.tsx 를 디자인시스템 4장 기준으로 교체하면서 옛 API(`Button tone=`, `Field`,
 * `Pill`)가 사라졌다. 그걸 쓰던 화면 넷(ServerSetup / CameraSelect / CameraSetup /
 * Dashboard)은 곧 2a~2c 로 대체되므로, 없어질 코드를 손보는 대신 여기서 이름만
 * 이어 준다. 그 화면들이 사라지는 순간 이 파일도 같이 지운다.
 */
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { Button as DsButton, Input, StatusLabel, type ButtonVariant, type StatusTone } from './ui'

export { Card, Notice, Spinner, Stat } from './ui'

type LegacyTone = 'primary' | 'neutral' | 'danger' | 'ghost'

const VARIANT_FOR: Record<LegacyTone, ButtonVariant> = {
  primary: 'primary',
  neutral: 'secondary',
  // 옛 danger 는 흰 바탕 + 빨간 테두리였다. 디자인의 '삭제' 버튼이 같은 모양이다.
  danger: 'danger-outline',
  ghost: 'link',
}

interface LegacyButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly tone?: LegacyTone
}

export const Button = ({ tone = 'neutral', ...props }: LegacyButtonProps) => (
  <DsButton variant={VARIANT_FOR[tone]} {...props} />
)

interface LegacyFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label: string
  readonly hint?: ReactNode
  readonly error?: string | null
}

export const Field = (props: LegacyFieldProps) => <Input {...props} />

const STATUS_FOR: Record<'ok' | 'warn' | 'bad' | 'idle', StatusTone> = {
  ok: 'connected',
  warn: 'reconnecting',
  bad: 'disconnected',
  idle: 'idle',
}

export const Pill = ({
  tone,
  children,
}: {
  tone: 'ok' | 'warn' | 'bad' | 'idle'
  children: ReactNode
}) => <StatusLabel tone={STATUS_FOR[tone]}>{children}</StatusLabel>
