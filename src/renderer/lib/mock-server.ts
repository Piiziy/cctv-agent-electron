/**
 * 브라우저 개발 모드(`npm run ui`)에서 백엔드 계약(docs/api-contract.md)을 흉내 낸다.
 * 제품 동작에는 관여하지 않는다 — Electron 안에서는 메인 프로세스가 진짜 서버를 부른다.
 *
 * 데이터는 design/씬스틸러 PC 앱.dc.html 화면에 그려진 값 그대로다 (강남 1호점,
 * 계산대 14:32 절도 의심 …). 시각은 오늘 날짜에 붙여서 '오늘 위험 신호'에 뜨게 한다.
 *
 * 새 위험 이벤트(2d 팝업)를 보려면 브라우저 콘솔에서:
 *   window.__sceneStealer.emitRiskEvent()
 */
import type { ServerRequest, ServerResult, StreamConnectionState } from '../../shared/ipc'
import type {
  CameraDto,
  CameraRuntimeState,
  EventDetail,
  EventHistoryItem,
  EventListItem,
  EventState,
  KindNotificationSetting,
  LocationTag,
  MonitoringCamera,
  NotificationSettings,
  RiskKind,
  RiskLevel,
  SegmentSeconds,
  ServerStreamMessage,
  StoreDto,
} from '../../shared/server-types'

/* ------------------------------------------------------------ 가짜 화면 */

/** CCTV 프레임 자리. CSP 가 data: 이미지를 허용한다. */
export const frame = (label: string, tone: 'normal' | 'dark' = 'normal'): string => {
  const [a, b] = tone === 'dark' ? ['#1A1C20', '#2A3038'] : ['#2A3038', '#555D6D']
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="640" height="360" fill="url(#g)"/>
<rect x="40" y="200" width="560" height="4" fill="#ffffff" opacity=".06"/>
<rect x="120" y="120" width="140" height="160" rx="6" fill="#ffffff" opacity=".05"/>
<rect x="380" y="90" width="160" height="190" rx="6" fill="#ffffff" opacity=".04"/>
<text x="320" y="190" text-anchor="middle" font-family="Pretendard, sans-serif" font-size="20" fill="#ffffff" opacity=".35">${label}</text>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/* ------------------------------------------------------------------ 시각 */

const todayAt = (hour: number, minute: number, second = 0): string => {
  const date = new Date()
  date.setHours(hour, minute, second, 0)
  return date.toISOString()
}
const addSeconds = (iso: string, seconds: number): string =>
  new Date(Date.parse(iso) + seconds * 1000).toISOString()
const minutesAgo = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString()

/* ------------------------------------------------------------------ 시드 */

const STORE_GANGNAM = 'store-gangnam-1'
const STORE_YEOKSAM = 'store-yeoksam'
const USER_ID = 'user-mock-owner'

interface CameraRow extends CameraDto {
  readonly deletedAt: string | null
  readonly stateUpdatedAt: string | null
}

const camera = (
  idSuffix: string,
  sortOrder: number,
  name: string,
  locationTag: LocationTag,
  state: CameraRuntimeState,
  lastFrameMinutesAgo: number,
): CameraRow => ({
  id: `cam-${idSuffix}`,
  storeId: STORE_GANGNAM,
  agentCameraId: `urn:uuid:mock-${idSuffix}`,
  name,
  locationTag,
  sortOrder,
  streamProfile: 'sub',
  state,
  lastFrameAt: minutesAgo(lastFrameMinutesAgo),
  lastSegmentAt: minutesAgo(lastFrameMinutesAgo),
  deletedAt: null,
  stateUpdatedAt: state === 'connected' ? minutesAgo(180) : minutesAgo(lastFrameMinutesAgo),
})

interface EventRow extends EventDetail {
  readonly memo: string | null
}

const event = (input: {
  id: string
  cameraId: string
  kind: RiskKind
  risk: RiskLevel
  state: EventState
  startedAt: string
  durationSec: number
  description: string | null
  appearance?: string | null
}): EventRow => ({
  id: input.id,
  storeId: STORE_GANGNAM,
  cameraId: input.cameraId,
  cameraName: null,
  locationTag: null,
  kind: input.kind,
  risk: input.risk,
  state: input.state,
  startedAt: input.startedAt,
  endedAt: addSeconds(input.startedAt, input.durationSec),
  durationSec: input.durationSec,
  description: input.description,
  thumbnailUrl: frame(''),
  aiGateStatus: 'done',
  createdAt: addSeconds(input.startedAt, input.durationSec + 40),
  appearance: input.appearance ?? null,
  boundingBoxes: [{ t: 2, x: 0.38, y: 0.22, w: 0.18, h: 0.56 }],
  anomalyScore: 0.83,
  memo: null,
  falsePositiveReason: null,
  aiGateError: null,
  clipUrl: null,
  clipExpiresAt: addSeconds(input.startedAt, 30 * 86_400),
  segments: [],
  history: [],
})

const initialDb = () => ({
  stores: [
    {
      id: STORE_GANGNAM,
      name: '강남 1호점',
      address: '서울 강남구 테헤란로 123 1층',
      opensAt: '09:00',
      closesAt: '21:00',
      segmentSeconds: 60 as SegmentSeconds,
      clipRetentionDays: 30,
      cameraCount: 5,
      device: null,
      unconfirmedCount: 0,
    },
    {
      id: STORE_YEOKSAM,
      name: '역삼점',
      address: '서울 강남구 역삼로 45',
      opensAt: '00:00',
      closesAt: '23:59',
      segmentSeconds: 60 as SegmentSeconds,
      clipRetentionDays: 30,
      cameraCount: 3,
      // 디자인 2a — "다른 PC가 연결돼 있음 — 선택하면 교체"
      device: {
        id: 'device-yeoksam',
        deviceId: 'agent-other-pc',
        label: '역삼점 카운터 PC',
        agentVersion: '1.0.0',
        online: true,
        lastHeartbeatAt: minutesAgo(1),
        spoolBytes: 0,
        uploadedBytesToday: 0,
      },
      unconfirmedCount: 0,
    },
  ] as readonly StoreDto[],
  cameras: [
    camera('01', 1, '계산대', 'checkout', 'connected', 0),
    camera('02', 2, '출입문', 'entrance', 'connected', 1),
    camera('03', 3, '진열대 A', 'shelf', 'connected', 1),
    camera('04', 4, '취식대', 'dining', 'connected', 1),
    // 디자인 2c — "◌ 재연결 중 · 마지막 화면 14:20 · 창고 끊김 11분"
    camera('05', 5, '창고', 'storage', 'reconnecting', 11),
  ] as readonly CameraRow[],
  events: [
    event({
      id: 'evt-1432',
      cameraId: 'cam-01',
      kind: 'theft',
      risk: 'high',
      state: 'unconfirmed',
      startedAt: todayAt(14, 32, 10),
      durationSec: 31,
      description:
        '남성 1명(검은 상의·회색 모자)이 진열대에서 상품 2개를 가방에 넣고 결제 없이 출입문 방향으로 이동. 같은 시각 출입문 카메라에서 퇴장 확인 (14:32:38).',
      appearance: '남성 1명, 검은 상의·회색 모자',
    }),
    event({
      id: 'evt-1305',
      cameraId: 'cam-02',
      kind: 'loitering',
      risk: 'medium',
      state: 'unconfirmed',
      startedAt: todayAt(13, 5),
      durationSec: 720,
      description: '12분간 출입구 근처 서성임',
    }),
    event({
      id: 'evt-1140',
      cameraId: 'cam-04',
      kind: 'dine_and_dash',
      risk: 'medium',
      state: 'confirmed',
      startedAt: todayAt(11, 40),
      durationSec: 95,
      description: '취식대에서 음식을 먹은 뒤 결제 없이 퇴장',
    }),
    event({
      id: 'evt-0912',
      cameraId: 'cam-03',
      kind: 'collapse',
      risk: 'high',
      state: 'false_positive',
      startedAt: todayAt(9, 12),
      durationSec: 18,
      description: '진열대 앞에서 사람이 바닥에 쓰러짐',
    }),
    event({
      id: 'evt-0210',
      cameraId: 'cam-02',
      kind: 'sleeping',
      risk: 'medium',
      state: 'confirmed',
      startedAt: todayAt(2, 10),
      durationSec: 2400,
      description: '심야 취식대에서 40분 취침',
    }),
  ] as readonly EventRow[],
  notifications: {
    kinds: [
      { kind: 'theft', enabled: true, sensitivity: 'medium', locked: false },
      { kind: 'vandalism', enabled: true, sensitivity: 'medium', locked: false },
      { kind: 'dine_and_dash', enabled: true, sensitivity: 'medium', locked: false },
      { kind: 'underage_purchase', enabled: true, sensitivity: 'medium', locked: false },
      { kind: 'loitering', enabled: true, sensitivity: 'low', locked: false },
      { kind: 'sleeping', enabled: false, sensitivity: 'medium', locked: false },
      { kind: 'collapse', enabled: true, sensitivity: 'high', locked: true },
      { kind: 'unknown', enabled: true, sensitivity: 'medium', locked: false },
    ] as readonly KindNotificationSetting[],
    quietHours: {
      businessHoursHighOnly: true,
      sleepStart: '01:00',
      sleepEnd: '07:00',
      sleepEmergencyOnly: true,
      overrideDndForHigh: true,
    },
  } as NotificationSettings,
})

/* ---------------------------------------------------------------- 서버 */

export interface MockServer {
  request(request: ServerRequest): Promise<ServerResult>
  startStream(storeId: string): void
  stopStream(): void
  onStream(listener: (message: ServerStreamMessage) => void): () => void
  onStreamState(listener: (state: StreamConnectionState) => void): () => void
  /** 개발용 — 새 위험 이벤트를 만들어 SSE 로 흘린다 (2d 팝업 확인). */
  emitRiskEvent(input?: Partial<Pick<EventListItem, 'kind' | 'risk' | 'cameraId'>>): EventListItem
}

const ok = (data: unknown, status = 200): ServerResult => ({ ok: true, status, data })
const fail = (status: number, error: string, extra: Record<string, unknown> = {}): ServerResult => ({
  ok: false,
  status,
  error,
  data: { error, ...extra },
})

// 실제 서버처럼 살짝 늦게 답한다 — 로딩 상태가 화면에 한 번은 보이게.
const LATENCY_MS = 160

export const createMockServer = (): MockServer => {
  const state = {
    db: initialDb(),
    streamStore: null as string | null,
    streamListeners: new Set<(message: ServerStreamMessage) => void>(),
    stateListeners: new Set<(state: StreamConnectionState) => void>(),
    counter: 0,
  }

  const emitState = (next: StreamConnectionState): void =>
    state.stateListeners.forEach((listener) => listener(next))
  const emit = (message: ServerStreamMessage): void => {
    if (state.streamStore === null) return
    state.streamListeners.forEach((listener) => listener(message))
  }

  const activeCameras = (storeId: string): readonly CameraRow[] =>
    state.db.cameras
      .filter((c) => c.storeId === storeId && c.deletedAt === null)
      .toSorted((a, b) => a.sortOrder - b.sortOrder)

  const toCameraDto = ({ deletedAt: _d, stateUpdatedAt: _s, ...dto }: CameraRow): CameraDto => dto

  const toListItem = (row: EventRow): EventListItem => {
    const cam = state.db.cameras.find((c) => c.id === row.cameraId)
    return {
      id: row.id,
      storeId: row.storeId,
      cameraId: row.cameraId,
      cameraName: cam?.name ?? null,
      locationTag: cam?.locationTag ?? null,
      kind: row.kind,
      risk: row.risk,
      state: row.state,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      durationSec: row.durationSec,
      description: row.description,
      thumbnailUrl: row.thumbnailUrl,
      aiGateStatus: row.aiGateStatus,
      createdAt: row.createdAt,
    }
  }

  const storeView = (store: StoreDto): StoreDto => ({
    ...store,
    cameraCount: activeCameras(store.id).length || store.cameraCount,
    unconfirmedCount: state.db.events.filter((e) => e.storeId === store.id && e.state === 'unconfirmed').length,
  })

  const updateEvent = (eventId: string, patch: Partial<EventRow>): EventRow | null => {
    const current = state.db.events.find((e) => e.id === eventId)
    if (!current) return null
    const next = { ...current, ...patch }
    state.db = { ...state.db, events: state.db.events.map((e) => (e.id === eventId ? next : e)) }
    return next
  }

  const routes: readonly {
    method: ServerRequest['method']
    pattern: RegExp
    // 요청 body 는 화면이 보내는 계약 모양이다. 개발용 흉내라 필드 검증은 하지 않는다.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handle: (match: RegExpMatchArray, body: any, params: URLSearchParams) => ServerResult
  }[] = [
    {
      method: 'GET',
      pattern: /^\/stores$/,
      handle: () => ok({ stores: state.db.stores.map(storeView) }),
    },
    {
      method: 'POST',
      pattern: /^\/stores$/,
      handle: (_m, body) => {
        state.counter += 1
        const store: StoreDto = {
          id: `store-new-${state.counter}`,
          name: body?.name ?? '새 매장',
          address: body?.address ?? null,
          opensAt: null,
          closesAt: null,
          segmentSeconds: 60,
          clipRetentionDays: 30,
          cameraCount: 0,
          device: null,
          unconfirmedCount: 0,
        }
        state.db = { ...state.db, stores: [...state.db.stores, store] }
        return ok({ store }, 201)
      },
    },
    {
      method: 'PATCH',
      pattern: /^\/stores\/([^/]+)$/,
      handle: ([, storeId], body) => {
        const current = state.db.stores.find((s) => s.id === storeId)
        if (!current) return fail(404, '매장을 찾을 수 없습니다')
        const next = { ...current, ...body }
        state.db = { ...state.db, stores: state.db.stores.map((s) => (s.id === storeId ? next : s)) }
        return ok({ store: storeView(next) })
      },
    },
    {
      method: 'POST',
      pattern: /^\/stores\/([^/]+)\/devices$/,
      handle: ([, storeId], body) => {
        const store = state.db.stores.find((s) => s.id === storeId)
        if (!store) return fail(404, '매장을 찾을 수 없습니다')
        const other = store.device && store.device.deviceId !== body?.deviceId ? store.device : null
        if (other && !body?.replaceExisting) {
          return fail(409, '이 매장에는 이미 연결된 PC 가 있습니다', { existingDevice: other })
        }
        const device = {
          id: `device-${storeId}`,
          deviceId: body?.deviceId ?? 'agent-mock',
          label: body?.label ?? null,
          agentVersion: body?.agentVersion ?? '1.0.0',
          online: true,
          lastHeartbeatAt: new Date().toISOString(),
          spoolBytes: 0,
          uploadedBytesToday: 0,
        }
        state.db = {
          ...state.db,
          stores: state.db.stores.map((s) => (s.id === storeId ? { ...s, device } : s)),
        }
        return ok({ ...device, deviceToken: 'ss_dev_mock_token', replacedDeviceId: other?.id ?? null }, 201)
      },
    },
    {
      method: 'GET',
      pattern: /^\/stores\/([^/]+)\/cameras$/,
      handle: ([, storeId]) => ok({ cameras: activeCameras(storeId ?? '').map(toCameraDto) }),
    },
    {
      method: 'POST',
      pattern: /^\/stores\/([^/]+)\/cameras$/,
      handle: ([, storeId], body) => {
        const existing = state.db.cameras.find(
          (c) => c.storeId === storeId && c.agentCameraId === body?.agentCameraId,
        )
        if (existing) {
          const next: CameraRow = { ...existing, ...body, deletedAt: null }
          state.db = { ...state.db, cameras: state.db.cameras.map((c) => (c.id === existing.id ? next : c)) }
          return ok({ camera: toCameraDto(next) })
        }
        if (activeCameras(storeId ?? '').length >= 8) {
          return fail(400, '카메라는 매장당 8대까지 등록할 수 있습니다')
        }
        state.counter += 1
        const row: CameraRow = {
          id: `cam-new-${state.counter}`,
          storeId: storeId ?? '',
          agentCameraId: body?.agentCameraId,
          name: body?.name,
          locationTag: body?.locationTag ?? null,
          sortOrder: body?.sortOrder ?? activeCameras(storeId ?? '').length + 1,
          streamProfile: body?.streamProfile ?? 'sub',
          state: 'connected',
          lastFrameAt: new Date().toISOString(),
          lastSegmentAt: null,
          deletedAt: null,
          stateUpdatedAt: new Date().toISOString(),
        }
        state.db = { ...state.db, cameras: [...state.db.cameras, row] }
        return ok({ camera: toCameraDto(row) }, 201)
      },
    },
    {
      method: 'PATCH',
      pattern: /^\/cameras\/([^/]+)$/,
      handle: ([, cameraId], body) => {
        const current = state.db.cameras.find((c) => c.id === cameraId)
        if (!current) return fail(404, '카메라를 찾을 수 없습니다')
        const next = { ...current, ...body }
        state.db = { ...state.db, cameras: state.db.cameras.map((c) => (c.id === cameraId ? next : c)) }
        return ok({ camera: toCameraDto(next) })
      },
    },
    {
      method: 'DELETE',
      pattern: /^\/cameras\/([^/]+)$/,
      handle: ([, cameraId]) => {
        state.db = {
          ...state.db,
          cameras: state.db.cameras.map((c) =>
            c.id === cameraId ? { ...c, deletedAt: new Date().toISOString() } : c,
          ),
        }
        return ok(null, 204)
      },
    },
    {
      method: 'GET',
      pattern: /^\/stores\/([^/]+)\/monitoring$/,
      handle: ([, storeId]) => {
        const store = state.db.stores.find((s) => s.id === storeId)
        const cameras: MonitoringCamera[] = activeCameras(storeId ?? '').map((row) => ({
          ...toCameraDto(row),
          disconnectedForSec:
            row.state === 'connected' || !row.stateUpdatedAt
              ? null
              : Math.round((Date.now() - Date.parse(row.stateUpdatedAt)) / 1000),
        }))
        return ok({
          device: {
            online: true,
            lastHeartbeatAt: new Date().toISOString(),
            agentVersion: '1.0.0',
            spoolBytes: 0,
            // 디자인 2c — "오늘 전송 1.8 GB"
            uploadedBytesToday: Math.round(1.8 * 1024 ** 3),
          },
          segmentSeconds: store?.segmentSeconds ?? 60,
          cameras,
          lastAnalyzedAt: minutesAgo(1),
          monitoringCount: cameras.filter((c) => c.state === 'connected').length,
          totalCount: cameras.length,
        })
      },
    },
    {
      method: 'GET',
      pattern: /^\/stores\/([^/]+)\/events\/timeline$/,
      handle: ([, storeId], _body, params) => {
        const date = params.get('date') ?? new Date().toISOString().slice(0, 10)
        const [y, m, d] = date.split('-').map(Number)
        const dayStart = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
        const dayEnd = new Date(dayStart.getTime() + 86_400_000)
        const windowEnd = new Date(Math.min(dayEnd.getTime(), Date.now()))
        return ok({
          date,
          windowStart: dayStart.toISOString(),
          windowEnd: windowEnd.toISOString(),
          cameras: activeCameras(storeId ?? '').map((cam) => ({
            cameraId: cam.id,
            name: cam.name,
            locationTag: cam.locationTag,
            events: state.db.events
              .filter((e) => e.cameraId === cam.id && Date.parse(e.startedAt) >= dayStart.getTime() && Date.parse(e.startedAt) < dayEnd.getTime())
              .map((e) => ({ id: e.id, startedAt: e.startedAt, endedAt: e.endedAt, risk: e.risk, kind: e.kind, state: e.state })),
            // 창고 카메라는 11분 전부터 끊겼다. 새벽에도 한 번 끊겼던 것으로 둔다.
            gaps:
              cam.locationTag === 'storage'
                ? [
                    { from: todayAt(4, 0), to: todayAt(5, 30), reason: 'no_segment' },
                    { from: minutesAgo(11), to: windowEnd.toISOString(), reason: 'no_segment' },
                  ]
                : [],
          })),
        })
      },
    },
    {
      method: 'GET',
      pattern: /^\/stores\/([^/]+)\/events\/summary$/,
      // 디자인 2e — "이번 주 · 위험 12건 · 오탐 3건 · 신고 1건"
      handle: () =>
        ok({
          from: new Date(Date.now() - 7 * 86_400_000).toISOString(),
          to: new Date().toISOString(),
          total: 12,
          falsePositive: 3,
          reported: 1,
          byWeekday: [1, 2, 1, 3, 2, 2, 1],
          byHour: Array.from({ length: 24 }, (_, hour) => (hour === 14 || hour === 2 ? 2 : hour % 5 === 0 ? 1 : 0)),
        }),
    },
    {
      method: 'GET',
      pattern: /^\/stores\/([^/]+)\/events\/unconfirmed-count$/,
      handle: ([, storeId]) =>
        ok({ count: state.db.events.filter((e) => e.storeId === storeId && e.state === 'unconfirmed').length }),
    },
    {
      method: 'GET',
      pattern: /^\/stores\/([^/]+)\/events$/,
      handle: ([, storeId], _body, params) => {
        const date = params.get('date')
        const filtered = state.db.events
          .filter((e) => e.storeId === storeId)
          // 날짜는 매장 벽시계 기준이다 — UTC 로 자르면 새벽 이벤트가 전날로 넘어간다.
          .filter((e) => !date || new Date(e.startedAt).toDateString() === new Date(`${date}T12:00:00`).toDateString())
          .filter((e) => !params.get('state') || e.state === params.get('state'))
          .filter((e) => !params.get('risk') || e.risk === params.get('risk'))
          .filter((e) => !params.get('kind') || e.kind === params.get('kind'))
          .filter((e) => !params.get('cameraId') || e.cameraId === params.get('cameraId'))
        // 계약 5.1 — 미확인 우선, 그다음 최신순
        const rank = { unconfirmed: 0, confirmed: 1, false_positive: 2 } as const
        const sorted = filtered.toSorted(
          (a, b) => rank[a.state] - rank[b.state] || Date.parse(b.startedAt) - Date.parse(a.startedAt),
        )
        return ok({ items: sorted.map(toListItem), nextCursor: null })
      },
    },
    {
      method: 'GET',
      pattern: /^\/events\/([^/]+)\/nearby-cameras$/,
      handle: ([, eventId]) => {
        const target = state.db.events.find((e) => e.id === eventId)
        if (!target) return fail(404, '이벤트를 찾을 수 없습니다')
        return ok({
          cameras: activeCameras(target.storeId)
            .filter((c) => c.id !== target.cameraId)
            .map((c) => ({
              cameraId: c.id,
              name: c.name,
              locationTag: c.locationTag,
              // 미리보기 모드에는 실제 영상이 없다. 화면은 '영상 없음'으로 그린다.
              playbackUrl: null,
              segmentStartedAt: addSeconds(target.startedAt, -18),
              offsetSec: 18,
            })),
        })
      },
    },
    {
      method: 'GET',
      pattern: /^\/events\/([^/]+)\/clip$/,
      handle: () => fail(404, '클립이 없습니다 (미리보기 모드)'),
    },
    {
      method: 'GET',
      pattern: /^\/events\/([^/]+)$/,
      handle: ([, eventId]) => {
        const row = state.db.events.find((e) => e.id === eventId)
        if (!row) return fail(404, '이벤트를 찾을 수 없습니다')
        return ok({ event: { ...row, ...toListItem(row) } })
      },
    },
    {
      method: 'PATCH',
      pattern: /^\/events\/([^/]+)\/state$/,
      handle: ([, eventId], body) => {
        const current = state.db.events.find((e) => e.id === eventId)
        if (!current) return fail(404, '이벤트를 찾을 수 없습니다')
        const entry: EventHistoryItem = {
          fromState: current.state,
          toState: body?.state,
          changedBy: USER_ID,
          source: body?.source ?? 'pc',
          reason: body?.reason ?? null,
          createdAt: new Date().toISOString(),
        }
        const next = updateEvent(eventId ?? '', {
          state: body?.state,
          falsePositiveReason: body?.state === 'false_positive' ? (body?.reason ?? null) : null,
          history: [...current.history, entry],
        })
        const item = toListItem(next as EventRow)
        emit({ type: 'event.updated', data: item })
        return ok({ event: item })
      },
    },
    {
      method: 'PATCH',
      pattern: /^\/events\/([^/]+)\/memo$/,
      handle: ([, eventId], body) => {
        const next = updateEvent(eventId ?? '', { memo: body?.memo ?? '' })
        if (!next) return fail(404, '이벤트를 찾을 수 없습니다')
        const item = toListItem(next)
        emit({ type: 'event.updated', data: item })
        return ok({ event: { ...item, memo: next.memo } })
      },
    },
    {
      method: 'GET',
      pattern: /^\/stores\/([^/]+)\/segments$/,
      handle: ([, storeId], _body, params) => {
        // 1분 조각을 벽시계에 맞춰 만든다. 창고는 11분 전부터 끊겨 조각이 없다.
        const cameraId = params.get('cameraId')
        const from = Date.parse(params.get('from') ?? '')
        const to = Date.parse(params.get('to') ?? '')
        const cam = activeCameras(storeId ?? '').find((c) => c.id === cameraId)
        if (!cam || Number.isNaN(from) || Number.isNaN(to)) return ok({ segments: [] })
        const store = state.db.stores.find((s) => s.id === storeId)
        const length = (store?.segmentSeconds ?? 60) * 1000
        const brokenSince = cam.state === 'connected' ? Infinity : Date.parse(cam.stateUpdatedAt ?? '')
        const first = Math.ceil(from / length) * length
        const count = Math.max(0, Math.floor((to - first) / length))
        const segments = Array.from({ length: count }, (_, index) => first + index * length)
          .filter((start) => start + length <= Date.now() && start < brokenSince)
          .map((start) => ({
            videoId: `vid-${cam.id}-${start}`,
            cameraId: cam.id,
            sequence: Math.floor(start / length) % 100_000,
            startedAt: new Date(start).toISOString(),
            endedAt: new Date(start + length).toISOString(),
            durationSec: length / 1000,
            status: 'done',
            playbackUrl: null,
          }))
          .reverse()
        return ok({ segments })
      },
    },
    {
      method: 'GET',
      pattern: /^\/stores\/([^/]+)\/notification-settings$/,
      handle: () => ok(state.db.notifications),
    },
    {
      method: 'PUT',
      pattern: /^\/stores\/([^/]+)\/notification-settings$/,
      handle: (_m, body) => {
        const collapse = (body?.kinds ?? []).find((k: KindNotificationSetting) => k.kind === 'collapse')
        if (collapse && !collapse.enabled) return fail(400, '쓰러짐(응급) 알림은 끌 수 없습니다')
        state.db = { ...state.db, notifications: body }
        return ok(state.db.notifications)
      },
    },
    {
      method: 'POST',
      pattern: /^\/stores\/([^/]+)\/notification-settings\/test$/,
      handle: () => ok({ sent: true, deviceCount: 1 }),
    },
  ]

  const emitRiskEvent: MockServer['emitRiskEvent'] = (input = {}) => {
    state.counter += 1
    const startedAt = new Date(Date.now() - 45_000).toISOString()
    const row = event({
      id: `evt-live-${state.counter}`,
      cameraId: input.cameraId ?? 'cam-01',
      kind: input.kind ?? 'theft',
      risk: input.risk ?? 'high',
      state: 'unconfirmed',
      startedAt,
      durationSec: 31,
      description:
        '남성 1명(검은 상의·회색 모자)이 진열대에서 상품 2개를 가방에 넣고 결제 없이 출입문 방향으로 이동.',
      appearance: '남성 1명, 검은 상의·회색 모자',
    })
    state.db = { ...state.db, events: [row, ...state.db.events] }
    const item = toListItem(row)
    emit({ type: 'event.created', data: item })
    return item
  }

  return {
    request: async ({ method, path, body }) => {
      await new Promise((resolve) => setTimeout(resolve, LATENCY_MS))
      const url = new URL(path, 'http://mock')
      for (const route of routes) {
        if (route.method !== method) continue
        const match = url.pathname.match(route.pattern)
        if (match) return route.handle(match, body, url.searchParams)
      }
      return fail(404, `미리보기 서버에 없는 경로입니다: ${method} ${url.pathname}`)
    },

    startStream: (storeId) => {
      state.streamStore = storeId
      emitState('connecting')
      setTimeout(() => {
        if (state.streamStore !== storeId) return
        emitState('open')
        emit({ type: 'ready', data: { storeId } })
      }, 300)
    },

    stopStream: () => {
      state.streamStore = null
      emitState('idle')
    },

    onStream: (listener) => {
      state.streamListeners.add(listener)
      return () => state.streamListeners.delete(listener)
    },

    onStreamState: (listener) => {
      state.stateListeners.add(listener)
      return () => state.stateListeners.delete(listener)
    },

    emitRiskEvent,
  }
}
