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

  /** 웹 데모용. 비어 있으면 푸시 대신 페이지가 열려 있을 때만 뜨는 로컬 알림으로 내려앉는다. */
  pushEndpoint: trim(process.env.EXPO_PUBLIC_PUSH_ENDPOINT).replace(/\/+$/, ''),
  vapidPublicKey: trim(process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY),

  /**
   * 앱이 올라간 경로. 서비스워커와 아이콘 주소가 이걸 앞에 달아야 한다.
   * 기본값은 루트('') — 하위 경로에 올릴 때만 빌드가 채워 준다.
   */
  webBaseUrl: trim(process.env.EXPO_PUBLIC_WEB_BASE_URL).replace(/\/+$/, ''),

  /** 데모 모드 — 심사위원용 페이지. 로그인을 건너뛰고 시나리오를 돌린다. */
  demo: trim(process.env.EXPO_PUBLIC_DEMO) === '1',

  /** 테스트셋 영상이 들어올 자리. 비우면 가짜 서버의 기본 샘플을 쓴다. */
  clipUrl: trim(process.env.EXPO_PUBLIC_CLIP_URL),
} as const

export const usingMockApi = config.apiUrl === ''
export const usingMockAuth = config.supabaseUrl === '' || config.supabaseAnonKey === ''
