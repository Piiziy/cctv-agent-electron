import { StyleSheet, type StyleProp, type ImageStyle } from 'react-native'
import { Image } from 'expo-image'

/**
 * 그림 두 가지 — 카드 바탕 그라디언트와 홈 안내 카드의 CCTV 그림.
 * 그라디언트 · 그림 의존성을 늘리지 않고 SVG 를 그린다 (아이콘과 같은 방식, expo-image 는 웹 · 네이티브 모두 SVG 를 그린다).
 */
const svgUri = (svg: string): string => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`

/** 피그마의 분홍 카드 바탕(홈 안내 · 이번 주 요약) — 왼쪽 옅은 분홍 → 가운데 거의 흰색 → 오른쪽 분홍. */
export const PINK_SWEEP = [
  [0, '#FAF2F2'],
  [0.5, '#FFFDFD'],
  [1, '#F4DFDF'],
] as const

/** 가로 그라디언트. 부모가 모서리(borderRadius)와 overflow: 'hidden' 을 준다. */
export const Gradient = ({ stops }: { stops: readonly (readonly [number, string])[] }) => (
  <Image
    source={{
      uri: svgUri(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">' +
          `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0">${stops
            .map(([offset, color]) => `<stop offset="${offset}" stop-color="${color}"/>`)
            .join('')}</linearGradient></defs>` +
          '<rect width="100" height="100" fill="url(#g)"/></svg>',
      ),
    }}
    style={StyleSheet.absoluteFill}
    contentFit="fill"
    accessible={false}
  />
)

/** 벽에 붙은 흰 CCTV — 피그마 홈 'AI가 매장을 지키고 있어요' 카드 오른쪽 그림. */
const CCTV = svgUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 130">' +
  '<defs>' +
  '<linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".6" stop-color="#EEF1F6"/><stop offset="1" stop-color="#C8D0DB"/></linearGradient>' +
  '<linearGradient id="h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E2E7EE"/></linearGradient>' +
  '<linearGradient id="f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#D5DCE5"/></linearGradient>' +
  '<linearGradient id="w" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FAFBFC"/><stop offset="1" stop-color="#D6DCE4"/></linearGradient>' +
  '<linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6F8FA"/><stop offset="1" stop-color="#C6CDD8"/></linearGradient>' +
  '<radialGradient id="l" cx=".36" cy=".34" r=".72"><stop offset="0" stop-color="#5877BE"/><stop offset=".45" stop-color="#1C2A49"/><stop offset="1" stop-color="#060A14"/></radialGradient>' +
  '</defs>' +
  '<rect x="132" y="76" width="24" height="50" rx="7" fill="url(#w)"/>' +
  '<rect x="136" y="82" width="16" height="38" rx="5" fill="#FFFFFF" opacity=".55"/>' +
  '<path d="M108 74 L136 100" stroke="#C0C8D3" stroke-width="15" stroke-linecap="round"/>' +
  '<path d="M108 74 L136 100" stroke="url(#a)" stroke-width="11" stroke-linecap="round"/>' +
  '<circle cx="107" cy="72" r="9" fill="#E6EAF0"/>' +
  '<g transform="rotate(-12 86 46)">' +
  '<rect x="30" y="24" width="122" height="48" rx="14" fill="url(#b)"/>' +
  '<path d="M18 28c0-10 6-16 16-16h108c10 0 16 6 16 16v3H18Z" fill="url(#h)"/>' +
  '<rect x="18" y="29" width="140" height="3" rx="1.5" fill="#CBD2DC"/>' +
  '<rect x="10" y="30" width="56" height="50" rx="14" fill="url(#f)"/>' +
  '<rect x="16" y="35" width="46" height="41" rx="10" fill="#141B2B"/>' +
  '<circle cx="39" cy="55.5" r="15.5" fill="url(#l)"/>' +
  '<circle cx="39" cy="55.5" r="7" fill="#05080F"/>' +
  '<circle cx="33.5" cy="50" r="3.6" fill="#A9C2F5" opacity=".9"/>' +
  '</g>' +
  '</svg>',
)

export const CctvIllustration = ({ style }: { style?: StyleProp<ImageStyle> }) => (
  <Image source={{ uri: CCTV }} style={[{ width: 80, height: 65 }, style]} contentFit="contain" accessible={false} />
)
