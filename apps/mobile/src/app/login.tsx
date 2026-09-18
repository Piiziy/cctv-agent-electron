import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, radius, spacing, type as type_ } from '@scene-stealer/tokens'
import { Button, Caption } from '../components/ui'
import { config, usingMockAuth } from '../lib/config'
import { useSession } from '../lib/session'

/**
 * 로그인 — 휴대폰 번호 + 인증번호. PC 앱과 같은 계정이다.
 * 뼈대에 모바일 로그인 화면이 없어 PC 2a 의 순서(번호 → 코드)를 그대로 따랐다.
 */
/**
 * 실서버 시연에서는 로그인 화면이 없다 — 데모 계정으로 들어가지 못했을 때만 여기로 온다.
 * 휴대폰 인증 칸을 보여 봐야 심사위원은 쓸 번호가 없다. 앱 첫 화면 그대로에 이유와 다시 시도만 둔다.
 */
const LiveSignInProblem = () => {
  const { liveError, accessToken } = useSession()
  const [busy, setBusy] = useState(false)
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <View style={styles.brandBlock}>
          <Text style={styles.brand}>Scene Stealer</Text>
          <Text style={styles.lede}>매장에서 일어난 이상 행동을{'\n'}바로 알려드립니다.</Text>
        </View>
        {liveError ? <Caption tone="danger">{liveError}</Caption> : null}
        <Button
          label="다시 시도"
          tone="primary"
          loading={busy}
          onPress={() => {
            setBusy(true)
            void accessToken().finally(() => setBusy(false))
          }}
        />
      </View>
    </SafeAreaView>
  )
}

export default function LoginScreen() {
  return config.live ? <LiveSignInProblem /> : <PhoneLogin />
}

function PhoneLogin() {
  const { auth, signIn } = useSession()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await task()
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brandBlock}>
            <Text style={styles.brand}>Scene Stealer</Text>
            <Text style={styles.lede}>매장에서 일어난 이상 행동을{'\n'}바로 알려드립니다.</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>휴대폰 번호</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              editable={!sent}
              placeholder="010-1234-5678"
              placeholderTextColor={colors.textSecondary}
              keyboardType="phone-pad"
              autoComplete="tel"
            />

            {sent ? (
              <>
                <Text style={styles.label}>인증번호</Text>
                <TextInput
                  style={styles.input}
                  value={code}
                  onChangeText={setCode}
                  placeholder="6자리"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                />
              </>
            ) : null}

            {error ? <Caption tone="danger">{error}</Caption> : null}

            {sent ? (
              <Button
                label="확인"
                tone="primary"
                loading={busy}
                disabled={code.length < 6}
                onPress={() => run(async () => signIn(await auth.verifyOtp(phone, code)))}
              />
            ) : (
              <Button
                label="인증번호 받기"
                tone="primary"
                loading={busy}
                disabled={phone.replace(/\D/g, '').length < 10}
                onPress={() =>
                  run(async () => {
                    await auth.sendOtp(phone)
                    setSent(true)
                  })
                }
              />
            )}

            {sent ? (
              <Button label="번호 다시 입력" onPress={() => { setSent(false); setCode(''); setError(null) }} />
            ) : null}
          </View>

          {usingMockAuth ? (
            <View style={styles.notice}>
              <Caption>
                지금은 시험용으로 돌고 있습니다. 아무 번호나 넣고 인증번호는 숫자 6자리를 입력하면
                들어갑니다.
              </Caption>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.xxl, flexGrow: 1, justifyContent: 'center' },
  brandBlock: { gap: spacing.md },
  brand: { fontSize: 28, fontWeight: '700', color: colors.brand },
  lede: { ...type_.body, color: colors.textSecondary, lineHeight: 22 },
  form: { gap: spacing.md },
  label: { ...type_.label, color: colors.text },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.medium,
    paddingHorizontal: spacing.lg,
    ...type_.body,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  notice: {
    padding: spacing.lg,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.medium,
  },
})
