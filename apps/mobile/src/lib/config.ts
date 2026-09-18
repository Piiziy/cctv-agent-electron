/**
 * 실행 환경.
 *
 * 백엔드·Supabase 프로젝트가 아직 없으므로 주소가 비어 있으면 **가짜 모드**로 돈다.
 * 주소를 넣는 순간 같은 화면이 진짜 서버를 보게 된다 — 화면 코드는 바뀌지 않는다.
 */
const trim = (value: string | undefined): string => (value ?? '').trim()

export const config = {
  apiUrl: trim(process.env.EXPO_PUBLIC_API_URL),
  supabaseUrl: trim(process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: trim(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
} as const

export const usingMockApi = config.apiUrl === ''
export const usingMockAuth = config.supabaseUrl === '' || config.supabaseAnonKey === ''
