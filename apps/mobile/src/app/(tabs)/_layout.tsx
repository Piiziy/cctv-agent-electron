import { Tabs } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, navBar, spacing } from '@scene-stealer/tokens'
import { useStores } from '../../lib/store-context'

/** 피그마 `navigation bar` 값 그대로. 아래 여백은 기기 홈 인디케이터에 맞춰 늘린다. */
const TabIcon = ({ glyph, focused }: { glyph: string; focused: boolean }) => (
  <Text style={[styles.icon, { color: focused ? navBar.activeColor : navBar.inactiveColor }]}>{glyph}</Text>
)

const Badge = ({ count }: { count: number }) =>
  count > 0 ? (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
    </View>
  ) : null

export default function TabsLayout() {
  const insets = useSafeAreaInsets()
  const { selected } = useStores()
  const unconfirmed = selected?.unconfirmedCount ?? 0

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: navBar.activeColor,
        tabBarInactiveTintColor: navBar.inactiveColor,
        tabBarLabelStyle: { fontSize: navBar.label.fontSize, fontWeight: navBar.label.fontWeight },
        tabBarItemStyle: { gap: navBar.gap },
        tabBarStyle: {
          // 아이콘 + 간격 + 라벨 한 줄이 들어갈 높이. 모자라면 라벨이 잘려 아이콘만 남는다.
          height: navBar.paddingTop + navBar.iconSize + navBar.gap + 20 + Math.max(insets.bottom, 12),
          paddingTop: navBar.paddingTop,
          paddingBottom: Math.max(insets.bottom, 12),
          backgroundColor: navBar.background,
          borderTopLeftRadius: navBar.radiusTop,
          borderTopRightRadius: navBar.radiusTop,
          borderTopWidth: 0,
          shadowColor: navBar.shadow.color,
          shadowOpacity: navBar.shadow.opacity,
          shadowOffset: { width: 0, height: navBar.shadow.offsetY },
          shadowRadius: navBar.shadow.blur,
          elevation: 8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: '홈', tabBarIcon: ({ focused }) => <TabIcon glyph="⌂" focused={focused} /> }}
      />
      <Tabs.Screen
        name="records"
        options={{
          title: '기록',
          tabBarIcon: ({ focused }) => (
            <View>
              <TabIcon glyph="☰" focused={focused} />
              <Badge count={unconfirmed} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: '설정', tabBarIcon: ({ focused }) => <TabIcon glyph="⚙" focused={focused} /> }}
      />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  icon: { fontSize: navBar.iconSize - 4, lineHeight: navBar.iconSize, textAlign: 'center' },
  badge: {
    position: 'absolute',
    top: -6,
    right: -12,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, fontWeight: '700', color: colors.textInverse },
})
