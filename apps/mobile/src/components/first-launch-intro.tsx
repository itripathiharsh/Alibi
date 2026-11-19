import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Check, CircleDot, Sparkles, Target, TrendingUp } from "lucide-react-native";
import theme from "../lib/theme";

const slides = [
  {
    key: "welcome",
    eyebrow: "WELCOME TO ALIBI",
    title: "Make space for meaningful work.",
    description: "A clear place to gather what matters, focus, and keep moving.",
    art: "welcome",
  },
  {
    key: "capture",
    eyebrow: "CAPTURE",
    title: "Catch every loose thought.",
    description: "Bring tasks, plans, and notes into one calm workspace.",
    art: "capture",
  },
  {
    key: "choose",
    eyebrow: "CHOOSE",
    title: "Know what matters today.",
    description: "See your real priorities and choose where to put your attention.",
    art: "choose",
  },
  {
    key: "focus",
    eyebrow: "FOCUS",
    title: "Give one task your full focus.",
    description: "Settle into the work with private, simple focus tools.",
    art: "focus",
  },
  {
    key: "reflect",
    eyebrow: "REFLECT",
    title: "Progress, grounded in your work.",
    description: "Notice your rhythm using activity you actually record.",
    art: "reflect",
  },
  {
    key: "ready",
    eyebrow: "YOU’RE READY",
    title: "Your day, with more intention.",
    description: "Start with one clear next step. ALIBI will help you take it from there.",
    art: "ready",
  },
] as const;

const stepDurations = [1200, 1350, 1350, 1350, 1450, 1100];

interface FirstLaunchIntroProps {
  onFinish: () => void;
}

export default function FirstLaunchIntro({ onFinish }: FirstLaunchIntroProps) {
  const [step, setStep] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;
  const scale = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReducedMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    opacity.setValue(reducedMotion ? 1 : 0);
    translateY.setValue(reducedMotion ? 0 : 14);
    scale.setValue(reducedMotion ? 1 : 0.96);
    if (reducedMotion) return;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        speed: 16,
        bounciness: 4,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, reducedMotion, scale, step, translateY]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (step >= slides.length - 1) {
        onFinish();
      } else {
        setStep((current) => current + 1);
      }
    }, reducedMotion ? Math.min(stepDurations[step], 900) : stepDurations[step]);
    return () => clearTimeout(timer);
  }, [onFinish, reducedMotion, step]);

  const currentSlide = slides[step];
  const isFinal = currentSlide.key === "ready";
  const Icon = currentSlide.art === "focus" ? Target : currentSlide.art === "reflect" ? TrendingUp : Sparkles;

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View pointerEvents="none" style={styles.washTop} />
      <View pointerEvents="none" style={styles.washBottom} />
      <View style={styles.header}>
        <View style={styles.stepIndicator}>
          <CircleDot size={13} color={theme.colors.accent.amber} />
          <Text style={styles.stepIndicatorText}>A QUICK INTRODUCTION</Text>
        </View>
        <Pressable
          onPress={onFinish}
          style={styles.skipButton}
          accessibilityRole="button"
          accessibilityLabel="Skip ALIBI introduction"
        >
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      <View style={styles.content} accessibilityLiveRegion="polite">
        <Animated.View
          key={currentSlide.key}
          style={[styles.animatedContent, { opacity, transform: [{ translateY }, { scale }] }]}
        >
          {currentSlide.key === "welcome" ? (
            <View style={styles.welcomeArt}>
              <View style={styles.welcomeGlow} />
              <View style={styles.logoMarkWrap}>
                <Image
                  source={require("../../assets/icon_mark.png")}
                  style={styles.logoMark}
                  resizeMode="contain"
                  accessibilityLabel="ALIBI logo"
                />
              </View>
              <Image
                source={require("../../assets/logo_full_light.png")}
                style={styles.logoLockup}
                resizeMode="contain"
                accessibilityLabel="ALIBI"
              />
            </View>
          ) : currentSlide.key === "ready" ? (
            <View style={styles.readyArt}>
              <Image
                source={require("../../assets/icon_mark.png")}
                style={styles.readyLogo}
                resizeMode="contain"
                accessibilityLabel="ALIBI logo"
              />
              <View style={styles.readyCheck}><Check size={23} color={theme.colors.accent.emerald} strokeWidth={2.7} /></View>
            </View>
          ) : (
            <View style={[styles.illustration, currentSlide.key === "focus" && styles.focusIllustration]}>
              <View style={[styles.iconHalo, currentSlide.key === "choose" && styles.chooseHalo, currentSlide.key === "reflect" && styles.reflectHalo]}>
                <Icon size={32} color={currentSlide.key === "reflect" ? theme.colors.accent.emerald : theme.colors.accent.amber} strokeWidth={1.8} />
              </View>
              {currentSlide.key === "capture" && <CaptureArt />}
              {currentSlide.key === "choose" && <ChooseArt />}
              {currentSlide.key === "focus" && <FocusArt />}
              {currentSlide.key === "reflect" && <ReflectArt />}
            </View>
          )}

          <Text style={styles.eyebrow}>{currentSlide.eyebrow}</Text>
          <Text style={styles.title}>{currentSlide.title}</Text>
          <Text style={styles.description}>{currentSlide.description}</Text>
          {isFinal && (
            <Pressable
              style={({ pressed }) => [styles.continueButton, pressed && styles.continuePressed]}
              onPress={onFinish}
              accessibilityRole="button"
              accessibilityLabel="Continue to ALIBI"
            >
              <Text style={styles.continueText}>Let’s begin</Text>
              <Check size={17} color="#FFFFFF" strokeWidth={2.7} />
            </Pressable>
          )}
        </Animated.View>
      </View>

      <View style={styles.footer}>
        <View style={styles.pagination} accessibilityLabel={`Introduction step ${step + 1} of ${slides.length}`}>
          {slides.map((slide, index) => (
            <View key={slide.key} style={[styles.dot, index === step && styles.dotActive]} />
          ))}
        </View>
        <Text style={styles.footerCopy}>YOUR WORK, IN FOCUS</Text>
      </View>
    </SafeAreaView>
  );
}

function CaptureArt() {
  return (
    <View pointerEvents="none" style={styles.captureCard}>
      <View style={styles.captureIcon}><Sparkles size={16} color={theme.colors.accent.amber} /></View>
      <View style={styles.captureLines}><View style={styles.linePrimary} /><View style={styles.lineSecondary} /></View>
      <View style={styles.captureReady}><View style={styles.readyDot} /><View style={styles.readyLine} /></View>
    </View>
  );
}

function ChooseArt() {
  return (
    <View pointerEvents="none" style={styles.chooseCard}>
      {[0, 1, 2].map((item) => (
        <View key={item} style={[styles.chooseRow, item === 0 && styles.chooseRowActive]}>
          <View style={[styles.chooseCheck, item === 0 && styles.chooseCheckActive]}>{item === 0 && <Check size={11} color="#FFFFFF" />}</View>
          <View style={styles.chooseLines}><View style={[styles.linePrimary, item > 0 && styles.lineMuted]} /><View style={styles.lineSecondary} /></View>
          {item === 0 && <View style={styles.focusTag}><Text style={styles.focusTagText}>FOCUS</Text></View>}
        </View>
      ))}
    </View>
  );
}

function FocusArt() {
  return (
    <View pointerEvents="none" style={styles.focusCard}>
      <View style={styles.focusOuter}><View style={styles.focusMiddle}><View style={styles.focusInner}><View style={styles.focusCore} /></View></View></View>
      <View style={styles.focusCardLines}><View style={styles.linePrimary} /><View style={styles.lineSecondary} /></View>
    </View>
  );
}

function ReflectArt() {
  const heights = [28, 45, 35, 57, 42, 24, 38];
  return (
    <View pointerEvents="none" style={styles.reflectCard}>
      <View style={styles.reflectHeading}><View style={styles.linePrimary} /><View style={styles.reflectBadge} /></View>
      <View style={styles.chart}>
        {heights.map((height, index) => (
          <View key={index} style={styles.chartColumn}>
            <View style={[styles.chartBar, { height }, index === 3 && styles.chartBarHighlight]} />
            <View style={styles.chartTick} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFillObject, zIndex: 100, justifyContent: "space-between", overflow: "hidden", backgroundColor: theme.colors.background.base },
  washTop: { position: "absolute", top: -145, right: -90, width: 310, height: 310, borderRadius: 155, backgroundColor: "rgba(255, 116, 31, .07)" },
  washBottom: { position: "absolute", bottom: -180, left: -120, width: 360, height: 360, borderRadius: 180, backgroundColor: "rgba(14, 165, 233, .06)" },
  header: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24 },
  stepIndicator: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepIndicatorText: { color: theme.colors.text.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  skipButton: { minWidth: 56, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 13, borderWidth: 1, borderColor: theme.colors.border.subtle, borderRadius: 15, backgroundColor: theme.colors.surface.card },
  skipText: { color: theme.colors.text.secondary, fontSize: 13, fontWeight: "700" },
  content: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 26 },
  animatedContent: { width: "100%", alignItems: "center", justifyContent: "center" },
  welcomeArt: { position: "relative", minHeight: 223, width: "100%", alignItems: "center", justifyContent: "center", marginBottom: 17 },
  welcomeGlow: { position: "absolute", width: 208, height: 208, borderRadius: 104, backgroundColor: "rgba(255, 116, 31, .08)" },
  logoMarkWrap: { width: 92, height: 92, alignItems: "center", justifyContent: "center", marginBottom: 17, borderWidth: 1, borderColor: "rgba(255, 116, 31, .22)", borderRadius: 30, backgroundColor: "#FFFFFF", shadowColor: theme.colors.accent.amber, shadowOpacity: 0.12, shadowRadius: 26, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  logoMark: { width: 64, height: 64 },
  logoLockup: { width: 186, height: 38 },
  readyArt: { position: "relative", width: 104, height: 104, alignItems: "center", justifyContent: "center", marginBottom: 20, borderRadius: 33, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: theme.colors.border.subtle, shadowColor: "#0B2030", shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 7 }, elevation: 2 },
  readyLogo: { width: 72, height: 72 },
  readyCheck: { position: "absolute", right: -6, bottom: -5, width: 33, height: 33, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: "#E8F8EF", borderWidth: 2, borderColor: theme.colors.background.base },
  illustration: { position: "relative", width: 264, height: 188, alignItems: "center", justifyContent: "center", marginBottom: 22 },
  focusIllustration: { height: 196 },
  iconHalo: { position: "absolute", top: 2, zIndex: 2, width: 61, height: 61, alignItems: "center", justifyContent: "center", borderRadius: 22, borderWidth: 1, borderColor: "rgba(255, 116, 31, .18)", backgroundColor: "#FFF3EA", shadowColor: theme.colors.accent.amber, shadowOpacity: 0.08, shadowRadius: 13, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  chooseHalo: { borderColor: "rgba(14, 165, 233, .2)", backgroundColor: "#EAF6FC" },
  reflectHalo: { borderColor: "rgba(16, 185, 129, .2)", backgroundColor: "#EAF8F1" },
  captureCard: { position: "absolute", bottom: 3, width: 224, height: 101, padding: 14, borderRadius: 19, borderWidth: 1, borderColor: theme.colors.border.subtle, backgroundColor: theme.colors.surface.card, shadowColor: "#0B2030", shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  captureIcon: { position: "absolute", top: 12, left: 14, width: 29, height: 29, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#FFF1E7" },
  captureLines: { position: "absolute", top: 17, left: 54, right: 14, gap: 7 },
  linePrimary: { height: 7, width: "83%", borderRadius: 5, backgroundColor: "#D7DEE5" },
  lineSecondary: { height: 5, width: "56%", borderRadius: 4, backgroundColor: "#E8ECF0" },
  lineMuted: { backgroundColor: "#E5E9EE" },
  captureReady: { position: "absolute", right: 14, bottom: 14, flexDirection: "row", alignItems: "center", gap: 6 },
  readyDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: theme.colors.accent.emerald },
  readyLine: { width: 54, height: 4, borderRadius: 3, backgroundColor: "#DDEFE5" },
  chooseCard: { position: "absolute", bottom: 0, width: 238, padding: 9, gap: 6, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border.subtle, backgroundColor: theme.colors.surface.card, shadowColor: "#0B2030", shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  chooseRow: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8, borderRadius: 11 },
  chooseRowActive: { backgroundColor: "#FFF8F3" },
  chooseCheck: { width: 17, height: 17, alignItems: "center", justifyContent: "center", borderRadius: 6, borderWidth: 1.5, borderColor: "#C9D2DB", backgroundColor: "#FFFFFF" },
  chooseCheckActive: { borderColor: theme.colors.accent.amber, backgroundColor: theme.colors.accent.amber },
  chooseLines: { flex: 1, gap: 5 },
  focusTag: { paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, backgroundColor: "#FFF1E7" },
  focusTagText: { color: "#B84E0B", fontSize: 7, fontWeight: "800", letterSpacing: .5 },
  focusCard: { position: "absolute", bottom: 0, width: 218, height: 111, alignItems: "center", justifyContent: "center", borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border.subtle, backgroundColor: theme.colors.surface.card, shadowColor: "#0B2030", shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  focusOuter: { width: 61, height: 61, alignItems: "center", justifyContent: "center", borderRadius: 31, borderWidth: 1.5, borderColor: "rgba(255, 116, 31, .32)" },
  focusMiddle: { width: 45, height: 45, alignItems: "center", justifyContent: "center", borderRadius: 23, borderWidth: 1, borderColor: "rgba(255, 116, 31, .38)" },
  focusInner: { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: "#FFF1E7" },
  focusCore: { width: 8, height: 8, borderRadius: 5, backgroundColor: theme.colors.accent.amber },
  focusCardLines: { position: "absolute", right: 22, bottom: 13, left: 22, gap: 5, alignItems: "center" },
  reflectCard: { position: "absolute", bottom: 0, width: 230, height: 107, paddingHorizontal: 15, paddingTop: 14, paddingBottom: 11, borderRadius: 19, borderWidth: 1, borderColor: theme.colors.border.subtle, backgroundColor: theme.colors.surface.card, shadowColor: "#0B2030", shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  reflectHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  reflectBadge: { width: 20, height: 7, borderRadius: 5, backgroundColor: "#E5F5EC" },
  chart: { flex: 1, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 7, paddingTop: 9 },
  chartColumn: { height: "100%", justifyContent: "flex-end", alignItems: "center", gap: 4 },
  chartBar: { width: 12, borderTopLeftRadius: 5, borderTopRightRadius: 5, backgroundColor: "#C4E9D3" },
  chartBarHighlight: { backgroundColor: theme.colors.accent.emerald },
  chartTick: { width: 4, height: 3, borderRadius: 2, backgroundColor: "#D9E0E6" },
  eyebrow: { marginTop: 1, color: theme.colors.accent.amber, fontSize: 11, fontWeight: "800", letterSpacing: 1.7, textAlign: "center" },
  title: { maxWidth: 350, marginTop: 11, color: theme.colors.text.primary, fontSize: 30, fontWeight: "800", letterSpacing: -0.9, lineHeight: 36, textAlign: "center" },
  description: { maxWidth: 325, marginTop: 11, color: theme.colors.text.secondary, fontSize: 15, lineHeight: 22, textAlign: "center" },
  continueButton: { minHeight: 52, minWidth: 170, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, marginTop: 24, paddingHorizontal: 20, borderRadius: 16, backgroundColor: theme.colors.text.primary },
  continuePressed: { opacity: 0.84, transform: [{ scale: 0.98 }] },
  continueText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  footer: { minHeight: 63, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24 },
  pagination: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 5, backgroundColor: "#D5DCE2" },
  dotActive: { width: 20, backgroundColor: theme.colors.accent.amber },
  footerCopy: { color: theme.colors.text.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1.1 },
});
