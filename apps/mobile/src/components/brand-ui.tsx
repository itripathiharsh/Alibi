import React from "react";
import { Image, StyleSheet, View, type ViewStyle } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";
import theme from "../lib/theme";

export function BrandHeader({ right, style }: { right?: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.header, style]}>
    <View style={styles.brand}>
      <Image source={require("../../assets/logo_full_light.png")} style={styles.logo} resizeMode="contain" accessibilityLabel="ALIBI" />
    </View>
    <View style={styles.actions}>{right}</View>
  </View>;
}

export function SunriseArt({ height = 150 }: { height?: number }) {
  return <View pointerEvents="none" style={[styles.art, { height }]}>
    <Svg width="100%" height="100%" viewBox="0 0 420 170" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id="sunrise-front" x1="0" y1="0" x2="0.8" y2="1">
          <Stop offset="0" stopColor="#FFE7D3" stopOpacity=".74" />
          <Stop offset="1" stopColor="#F5D7D4" stopOpacity=".18" />
        </LinearGradient>
        <LinearGradient id="sunrise-back" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFD3AC" stopOpacity=".55" />
          <Stop offset="1" stopColor="#FFEBDD" stopOpacity=".12" />
        </LinearGradient>
      </Defs>
      <Circle cx="334" cy="67" r="45" fill="#FFD19F" opacity=".55" />
      <Path d="M0 132 Q72 126 128 87 T224 90 Q270 124 318 93 T420 112 V170 H0Z" fill="url(#sunrise-back)" />
      <Path d="M0 153 Q82 135 149 105 T249 105 Q301 136 354 111 T420 126 V170 H0Z" fill="url(#sunrise-front)" />
      <Path d="M0 160 Q102 147 190 123 T310 128 Q361 145 420 136 V170 H0Z" fill="#EBDADD" opacity=".22" />
    </Svg>
  </View>;
}

const styles = StyleSheet.create({
  header: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, zIndex: 1 },
  brand: { flexDirection: "row", alignItems: "center" },
  logo: { width: 138, height: 36 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  art: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 0, opacity: .8 },
});
