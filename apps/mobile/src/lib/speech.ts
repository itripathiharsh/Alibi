import { NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from "react-native";

const { SpeechRecognition } = NativeModules;
const speechEventEmitter = SpeechRecognition ? new NativeEventEmitter(SpeechRecognition) : null;

export interface SpeechCallbacks {
  onResults?: (text: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
  onStart?: () => void;
}

let activeSubscriptions: { remove: () => void }[] = [];

export async function requestAudioPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  try {
    const hasPermission = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
    );
    if (hasPermission) return true;

    const status = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: "Microphone Access Required",
        message: "ALIBI needs microphone access so you can dictate tasks and questions in real time.",
        buttonPositive: "Grant Permission",
        buttonNegative: "Cancel",
      }
    );
    return status === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.warn("Audio permission request error:", err);
    return false;
  }
}

export async function isSpeechAvailable(): Promise<boolean> {
  if (Platform.OS !== "android" || !SpeechRecognition) return false;
  try {
    return await SpeechRecognition.isRecognitionAvailable();
  } catch {
    return false;
  }
}

export async function startSpeechRecognition(callbacks: SpeechCallbacks): Promise<boolean> {
  if (Platform.OS !== "android" || !SpeechRecognition || !speechEventEmitter) {
    callbacks.onError?.("Real-time speech recognition is only available on Android native app.");
    return false;
  }

  const hasPerm = await requestAudioPermission();
  if (!hasPerm) {
    callbacks.onError?.("Microphone permission was denied. Please allow microphone in settings.");
    return false;
  }

  // Clear previous subscriptions
  stopSpeechRecognitionListeners();

  const startSub = speechEventEmitter.addListener("onSpeechStart", () => {
    callbacks.onStart?.();
  });

  const resultsSub = speechEventEmitter.addListener(
    "onSpeechResults",
    (event: { text?: string; isFinal?: boolean }) => {
      if (typeof event?.text === "string") {
        callbacks.onResults?.(event.text, !!event.isFinal);
      }
    }
  );

  const errorSub = speechEventEmitter.addListener(
    "onSpeechError",
    (event: { code?: number; message?: string }) => {
      callbacks.onError?.(event?.message || "Speech recognition error");
    }
  );

  const endSub = speechEventEmitter.addListener("onSpeechEnd", () => {
    callbacks.onEnd?.();
  });

  activeSubscriptions = [startSub, resultsSub, errorSub, endSub];

  try {
    await SpeechRecognition.startListening();
    return true;
  } catch (err: any) {
    stopSpeechRecognitionListeners();
    callbacks.onError?.(err?.message || "Failed to start speech recognition");
    return false;
  }
}

export function stopSpeechRecognitionListeners() {
  activeSubscriptions.forEach((sub) => {
    try {
      sub.remove();
    } catch {}
  });
  activeSubscriptions = [];
}

export async function stopSpeechRecognition(): Promise<boolean> {
  stopSpeechRecognitionListeners();
  if (Platform.OS === "android" && SpeechRecognition) {
    try {
      await SpeechRecognition.stopListening();
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function cancelSpeechRecognition(): Promise<boolean> {
  stopSpeechRecognitionListeners();
  if (Platform.OS === "android" && SpeechRecognition) {
    try {
      await SpeechRecognition.cancelListening();
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

