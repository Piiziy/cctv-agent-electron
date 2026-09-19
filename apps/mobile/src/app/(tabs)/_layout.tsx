import { Tabs } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, navBar } from '@scene-stealer/tokens'
import { Icon, type IconName } from '../../components/icons'
import { useStores } from '../../lib/store-context'
import { bodyFont } from '../../lib/typography'

/** 피그마 `navigation bar` 값 그대로. 아래 여백은 기기 홈 인디케이터에 맞춰 늘린다. */
const TabIcon = ({ name, focused }: { name: IconName; focused: boolean }) => (
  <Icon name={name} size={navBar.iconSize} color={focused ? navBar.activeColor : navBar.inactiveColor} />
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
        tabBarLabelStyle: { ...bodyFont, fontSize: navBar.label.fontSize, fontWeight: navBar.label.fontWeight },
        // 창이 넓으면 라벨이 아이콘 옆으로 가는 게 기본이다. 앱은 휴대폰 폭으로 그리므로 늘 아래에 둔다.
        tabBarLabelPosition: 'below-icon',
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
          boxShadow: `0 ${navBar.shadow.offsetY}px ${navBar.shadow.blur}px rgba(0, 0, 0, ${navBar.shadow.opacity})`,
          elevation: 8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: '홈', tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} /> }}
      />
      <Tabs.Screen
        name="records"
        options={{
          title: '기록',
          tabBarIcon: ({ focused }) => (
            <View>
              <TabIcon name="records" focused={focused} />
              <Badge count={unconfirmed} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: '설정', tabBarIcon: ({ focused }) => <TabIcon name="settings" focused={focused} /> }}
      />
    </Tabs>
  )
}

const styles = StyleSheet.create({
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
  badgeText: { ...bodyFont, fontSize: 10, fontWeight: '700', color: colors.textInverse },
})
