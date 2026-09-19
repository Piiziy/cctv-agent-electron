import { Image } from 'expo-image'

/**
 * 탭바 아이콘 (피그마 navigation bar — 24px 선 아이콘).
 * 예전에는 ⌂ ☰ ⚙ 글자를 썼는데, 글꼴마다 모양이 달라지고 아이폰에서는 ⚙ 가 컬러 이모지로 그려졌다.
 * 아이콘 묶음 의존성을 늘리지 않고 SVG 를 바로 그린다 — expo-image 는 웹·네이티브 모두 SVG 를 그린다.
 */
export type IconName = 'home' | 'records' | 'settings'

const PATHS: Record<IconName, string> = {
  home: '<path d="M3.5 10.2 12 3.5l8.5 6.7V19.5a1 1 0 0 1-1 1h-5v-6h-5v6h-5a1 1 0 0 1-1-1z"/>',
  records: '<rect x="4.5" y="3.5" width="15" height="17" rx="2"/><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4"/>',
  settings:
    '<path d="M10.01 4.56L10.52 2.11L13.48 2.11L13.99 4.56L15.85 5.33L17.95 3.96L20.04 6.05L18.67 8.15L19.44 10.01L21.89 10.52L21.89 13.48L19.44 13.99L18.67 15.85L20.04 17.95L17.95 20.04L15.85 18.67L13.99 19.44L13.48 21.89L10.52 21.89L10.01 19.44L8.15 18.67L6.05 20.04L3.96 17.95L5.33 15.85L4.56 13.99L2.11 13.48L2.11 10.52L4.56 10.01L5.33 8.15L3.96 6.05L6.05 3.96L8.15 5.33Z"/><circle cx="12" cy="12" r="3.2"/>',
}

const uri = (name: IconName, color: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${PATHS[name]}</svg>`,
  )}`

export const Icon = ({ name, color, size = 24 }: { name: IconName; color: string; size?: number }) => (
  <Image source={{ uri: uri(name, color) }} style={{ width: size, height: size }} contentFit="contain" accessible={false} />
)
