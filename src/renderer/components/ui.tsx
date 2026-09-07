import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { cn } from '../lib/cn'

type ButtonTone = 'primary' | 'neutral' | 'danger' | 'ghost'

const TONE: Record<ButtonTone, string> = {
  primary: cn(
    'bg-indigo-600 text-white border-transparent',
    'hover:bg-indigo-700 active:bg-indigo-800 focus-visible:ring-indigo-300',
  ),
  neutral: cn(
    'bg-white text-slate-700 border-slate-300',
    'hover:bg-slate-50 active:bg-slate-100 focus-visible:ring-slate-300',
  ),
  danger: cn(
    'bg-white text-red-600 border-red-300',
    'hover:bg-red-50 active:bg-red-100 focus-visible:ring-red-300',
  ),
  ghost: cn(
    'bg-transparent text-slate-500 border-transparent',
    'hover:bg-slate-200/70 active:bg-slate-300/70 focus-visible:ring-slate-300',
  ),
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly tone?: ButtonTone
}

export const Button = ({ tone = 'neutral', className, ...props }: ButtonProps) => (
  <button
    type="button"
    className={cn(
      'rounded-lg border font-medium transition-colors',
      'inline-flex items-center justify-center gap-2',
      'px-4 py-2 text-sm',
      'focus-visible:outline-none focus-visible:ring-2',
      'disabled:cursor-not-allowed disabled:opacity-50',
      TONE[tone],
      className,
    )}
    {...props}
  />
)

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label: string
  readonly hint?: ReactNode
  readonly error?: string | null
}

export const Field = ({ label, hint, error, className, ...props }: FieldProps) => (
  <label className={cn('block', className)}>
    <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
    <input
      className={cn(
        'w-full rounded-lg border bg-white transition-colors',
        'px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400',
        'focus:outline-none focus:ring-2',
        error
          ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
          : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-200',
      )}
      {...props}
    />
    {(error || hint) && (
      <span className={cn('mt-1.5 block text-xs', error ? 'text-red-600' : 'text-slate-500')}>
        {error ?? hint}
      </span>
    )}
  </label>
)

export const Card = ({ className, children }: { className?: string; children: ReactNode }) => (
  <section className={cn('rounded-xl border border-slate-200 bg-white shadow-sm', className)}>
    {children}
  </section>
)

type PillTone = 'ok' | 'warn' | 'bad' | 'idle'

const PILL: Record<PillTone, { dot: string; text: string }> = {
  ok: { dot: 'bg-emerald-500', text: 'text-emerald-700' },
  warn: { dot: 'bg-amber-500', text: 'text-amber-700' },
  bad: { dot: 'bg-red-500', text: 'text-red-700' },
  idle: { dot: 'bg-slate-400', text: 'text-slate-600' },
}

export const Pill = ({ tone, children }: { tone: PillTone; children: ReactNode }) => (
  <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium', PILL[tone].text)}>
    <span className={cn('rounded-full', 'size-2 shrink-0', PILL[tone].dot)} />
    {children}
  </span>
)

export const Spinner = ({ className }: { className?: string }) => (
  <span
    className={cn(
      'inline-block rounded-full border-2 border-current border-t-transparent',
      'size-4 animate-spin',
      className,
    )}
  />
)

export const Stat = ({ label, value }: { label: string; value: ReactNode }) => (
  <div>
    <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
    <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{value}</div>
  </div>
)

export const Notice = ({ tone, children }: { tone: 'warn' | 'bad' | 'info'; children: ReactNode }) => (
  <div
    className={cn(
      'rounded-lg border px-3 py-2.5 text-sm leading-relaxed',
      tone === 'bad' && 'border-red-200 bg-red-50 text-red-800',
      tone === 'warn' && 'border-amber-200 bg-amber-50 text-amber-800',
      tone === 'info' && 'border-slate-200 bg-slate-50 text-slate-600',
    )}
  >
    {children}
  </div>
)
