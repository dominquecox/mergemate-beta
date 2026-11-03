import React, {useState} from "react";
import { View, Image, Pressable, StyleSheet } from "react-native";
import { Text } from "./Text";
import { Link, useRouter, useSegments } from "expo-router";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { NAV_ITEMS, type NavItem } from "../navigation/items";
import { SIDEBAR_WIDTH } from "../layout/breakpoints";
import { Icon, IconName } from "./Icon";

interface SidebarRowProps {
  label: string;
  icon: IconName;
  iconActive: IconName;
  active: boolean;
  href: NavItem["href"];
  accessibilityLabel: string;
}

function SidebarRow({ label, icon, iconActive, active, href, accessibilityLabel }: SidebarRowProps) {
  const [hovered,setHovered]=useState(false);
  const [pressed,setPressed]=useState(false);
  const { colors, typography, radius } = useTheme();

  return (
    <Link href={href} asChild><Pressable onHoverIn={()=>setHovered(true)} onHoverOut={()=>setHovered(false)} onPressIn={()=>setPressed(true)} onPressOut={()=>setPressed(false)}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
      style={StyleSheet.flatten([styles.row,{
        borderRadius:radius.md,
        backgroundColor:active?colors.brandSubtle:hovered||pressed?colors.surfaceElevated:"transparent",
      }])}
    >
      <Icon name={active ? iconActive : icon} size={20} color={active ? colors.brandLight : colors.textMuted} />
      <Text
        style={[
          typography.body,
          { color: active ? colors.brandLight : colors.textSecondary, fontWeight: active ? "700" : "500" },
        ]}
      >
        {label}
      </Text>
    </Pressable></Link>
  );
}

/** Desktop navigation (>= 1024px). Replaces the bottom tab bar. */
export function Sidebar() {
  const router = useRouter();
  const segments = useSegments() as string[];
  const { colors, typography, radius, isDark } = useTheme();

  const {user,isDemo}=useAuth();
  const inTabs = segments[0] === "(tabs)";
  const searchActive = segments[0] === "search";

  return (
    <View
      style={[styles.sidebar, { backgroundColor: colors.surface, borderRightColor: colors.border }]}
      accessibilityRole="navigation"
      accessibilityLabel="Main navigation"
    >
      <View style={styles.logoWrap}>
        <Image
          source={isDark ? require("../../assets/logo-dark.png") : require("../../assets/logo-light.png")}
          style={styles.logo}
          resizeMode="contain"
          accessibilityRole="image"
          accessibilityLabel="MergeMate"
        />
      </View>

      <Pressable
        onPress={() => router.push("/search")}
        accessibilityRole="button"
        accessibilityLabel="Search pull requests"
        accessibilityState={{ selected: searchActive }}
        style={(state) => {
          const hovered = Boolean((state as { hovered?: boolean }).hovered);
          return [
            styles.searchBtn,
            {
              borderRadius: radius.md,
              borderColor: searchActive ? colors.brandLight : colors.border,
              backgroundColor: hovered || state.pressed ? colors.surfaceSecondary : colors.surfaceElevated,
            },
          ];
        }}
      >
        <Icon name="search" size={16} color={colors.textMuted} />
        <Text style={[typography.callout, { color: colors.textSecondary, flex: 1 }]}>Search</Text>
      </Pressable>

      <View style={styles.nav}>
        {NAV_ITEMS.map((item) => (
          <SidebarRow
            key={item.name}
            label={item.label}
            icon={item.icon}
            iconActive={item.iconActive}
            active={inTabs && segments[1] === item.name}
            accessibilityLabel={item.label}
            href={item.href}
          />
        ))}
      </View>
      <Link href="/workflows" asChild><Pressable accessibilityRole="link" accessibilityLabel="Agent workflows" style={StyleSheet.flatten({ minHeight: 44, marginTop: 14, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: segments[0] === 'workflows' ? colors.brandLight : colors.brandMuted, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, backgroundColor: segments[0] === 'workflows' ? colors.brand : colors.brandSubtle })}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name="git-network-outline" size={18} color={segments[0] === 'workflows' ? '#FFFFFF' : colors.brandLight}/>
          <Text style={[typography.subhead,{color: segments[0] === 'workflows' ? '#FFFFFF' : colors.brandLight, fontWeight: '600'}]}>Agent workflows</Text>
        </View>
        <Icon name="add-circle-outline" size={16} color={segments[0] === 'workflows' ? '#FFFFFF' : colors.brandLight}/>
      </Pressable></Link>
      <View style={{flex:1}} />
      <View style={[styles.guard,{borderColor:colors.border}]}>
        <Icon name="shield-checkmark-outline" size={18} color={colors.brandLight}/>
        <Text style={[typography.footnote,{color:colors.textSecondary,flex:1}]}>Build a workflow. Follow its evidence.</Text>
      </View>
      <View accessibilityLabel="Signed-in account" style={StyleSheet.flatten([styles.account,{borderTopColor:colors.border}])}>
        <View style={[styles.avatar,{backgroundColor:colors.brandSubtle}]}><Icon name="person-outline" size={20} color={colors.brandLight}/></View>
        <View style={{flex:1,minWidth:0}}><Text style={[typography.subhead,{color:colors.text}]} numberOfLines={1}>{user?.name || user?.login || 'Your account'}</Text><Text style={[typography.caption,{color:colors.textSecondary}]}>{isDemo?'Demo workspace':'Personal workspace'}</Text></View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: SIDEBAR_WIDTH,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderRightWidth: 1,
  },
  logoWrap: {
    minHeight: 56,
    justifyContent: "center",
    paddingLeft: 4,
  },
  logo: {
    width: 142,
    height: 34,
  },
  searchBtn: {
    marginTop: 12,
    minHeight: 44,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
  },
  guard: { flexDirection:"row",gap:10,padding:12,borderWidth:1,borderRadius:12,marginTop:24,alignItems:"center" },
  account: { minHeight:76,flexDirection:"row",alignItems:"center",gap:10,borderTopWidth:1,marginTop:20,paddingTop:12 },
  avatar: { width:36,height:36,borderRadius:12,alignItems:"center",justifyContent:"center" },
  nav: {
    marginTop: 16,
    gap: 4,
  },
  row: {
    minHeight: 44,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});
