import React, { useState, useEffect, useRef } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Linking,
} from "react-native";
import {
  Sparkles,
  Send,
  Bot,
  User as UserIcon,
  RotateCcw,
  ShieldCheck,
  Zap,
  Mic,
  MicOff,
  CheckCircle2,
  Clock,
  Layers,
} from "lucide-react-native";
import theme from "../../lib/theme";
import { getAccessToken, ensureAuthenticated } from "../../lib/auth";
import { getServerUrl, autoDetectServer } from "../../lib/config";
import { startSpeechRecognition, stopSpeechRecognition } from "../../lib/speech";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Array<{ title?: string; type?: string }>;
  toolCalls?: Array<{ tool?: string; summary?: string; count?: number }>;
  createdAt: string;
}

const QUICK_PROMPTS = [
  "What are my highest priority tasks today?",
  "Summarize my pending tasks and deadlines",
  "Break down my upcoming work into subtasks",
  "What are my peak focus hours?",
];

export default function AIScreen() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome-1",
      role: "assistant",
      content:
        "Hello! I am your ALIBI Grounded Assistant. I am strictly grounded in your verified tasks, schedules, and learning data—I will never fabricate deadlines or metrics. How can I assist you with your work today?",
      createdAt: new Date().toISOString(),
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    // Proactively detect server on mount
    autoDetectServer().catch(() => {});
  }, []);

  const handleVoiceDictation = async () => {
    if (isVoiceMode) {
      await stopSpeechRecognition();
      setIsVoiceMode(false);
      return;
    }

    const baseText = inputText.trim();
    setIsVoiceMode(true);
    const ok = await startSpeechRecognition({
      onStart: () => setIsVoiceMode(true),
      onResults: (text, isFinal) => {
        const combined = baseText ? `${baseText} ${text}` : text;
        setInputText(combined);
        if (isFinal) {
          setIsVoiceMode(false);
        }
      },
      onError: (err) => {
        setIsVoiceMode(false);
        Alert.alert("Voice Input", err);
      },
      onEnd: () => {
        setIsVoiceMode(false);
      },
    });

    if (!ok) {
      setIsVoiceMode(false);
    }
  };

  const handleSend = async (textToSend?: string) => {
    stopSpeechRecognition();
    setIsVoiceMode(false);
    const text = (textToSend || inputText).trim();
    if (!text || isLoading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setIsLoading(true);

    // Scroll to bottom
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);

    try {
      await autoDetectServer();
      let token = await ensureAuthenticated();
      const baseUrl = getServerUrl();

      let res = await fetch(`${baseUrl}/api/v1/assistant/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: text,
          thread_id: threadId,
        }),
      });

      // 401 auto-retry
      if (res.status === 401) {
        token = await ensureAuthenticated(true);
        if (token) {
          res = await fetch(`${baseUrl}/api/v1/assistant/chat`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              message: text,
              thread_id: threadId,
            }),
          });
        }
      }

      if (res.ok) {
        const data = await res.json();
        if (data.thread_id) {
          setThreadId(data.thread_id);
        }

        const assistantMsg: Message = {
          id: data.id || `asst-${Date.now()}`,
          role: "assistant",
          content: data.content || "I have reviewed your records.",
          sources: data.sources || [],
          toolCalls: data.tool_calls || [],
          createdAt: data.created_at || new Date().toISOString(),
        };

        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        const errJson = await res.json().catch(() => ({}));
        const errorMsg: Message = {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `Unable to complete request: ${errJson.detail || "Server error"}. Check backend connectivity in Settings.`,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } catch (err: unknown) {
      const errorMsg: Message = {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: `Network connection failed: ${err instanceof Error ? err.message : "Cannot reach backend"}. Please verify backend connection in Settings.`,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 150);
    }
  };

  const handleClear = () => {
    Alert.alert("Reset Conversation", "Clear chat history and start a new session?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: () => {
          setMessages([
            {
              id: "welcome-reset",
              role: "assistant",
              content: "Conversation cleared. Ready for your next request.",
              createdAt: new Date().toISOString(),
            },
          ]);
          setThreadId(null);
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      {/* Top Banner: Grounding Guarantee */}
      <View style={styles.topBanner}>
        <View style={styles.bannerRow}>
          <ShieldCheck size={16} color={theme.colors.accent.emerald} />
          <Text style={styles.bannerText}>Grounded Assistant (Zero Hallucination Guarantee)</Text>
        </View>
        <Pressable onPress={handleClear} style={styles.clearBtn} hitSlop={8}>
          <RotateCcw size={14} color={theme.colors.text.muted} />
          <Text style={styles.clearBtnText}>New Thread</Text>
        </Pressable>
      </View>

      {/* Messages Scroll Area */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.chatArea}
        contentContainerStyle={styles.chatContent}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          return (
            <View
              key={msg.id}
              style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAssistant]}
            >
              {!isUser && (
                <View style={styles.avatarBot}>
                  <Bot size={16} color={theme.colors.accent.amber} />
                </View>
              )}

              <View
                style={[
                  styles.bubble,
                  isUser ? styles.bubbleUser : styles.bubbleAssistant,
                ]}
              >
                <Text style={[styles.msgText, isUser && styles.msgTextUser]}>
                  {msg.content}
                </Text>

                {/* Tool calls indicator */}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <View style={styles.toolCallsContainer}>
                    {msg.toolCalls.map((tc, idx) => (
                      <View key={idx} style={styles.toolCallBadge}>
                        <Zap size={11} color={theme.colors.accent.amber} />
                        <Text style={styles.toolCallText}>
                          {tc.summary || `${tc.tool}: ${tc.count ?? 0} records`}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Sources badge */}
                {msg.sources && msg.sources.length > 0 && (
                  <View style={styles.sourcesContainer}>
                    <Layers size={11} color={theme.colors.accent.emerald} />
                    <Text style={styles.sourcesText}>
                      Grounded in: {msg.sources.map((s) => s.title || s.type).join(", ")}
                    </Text>
                  </View>
                )}
              </View>

              {isUser && (
                <View style={styles.avatarUser}>
                  <UserIcon size={16} color={theme.colors.text.primary} />
                </View>
              )}
            </View>
          );
        })}

        {isLoading && (
          <View style={styles.msgRow}>
            <View style={styles.avatarBot}>
              <Bot size={16} color={theme.colors.accent.amber} />
            </View>
            <View style={[styles.bubble, styles.bubbleAssistant, styles.loadingBubble]}>
              <ActivityIndicator size="small" color={theme.colors.accent.amber} />
              <Text style={styles.loadingText}>Grounding response in SQL records...</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Quick Prompts Chips */}
      {messages.length <= 2 && (
        <View style={styles.quickPromptsSection}>
          <Text style={styles.quickPromptLabel}>Suggested questions:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickChips}>
            {QUICK_PROMPTS.map((prompt, idx) => (
              <Pressable
                key={idx}
                style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
                onPress={() => handleSend(prompt)}
              >
                <Sparkles size={12} color={theme.colors.accent.amber} />
                <Text style={styles.chipText}>{prompt}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Voice Mode Banner */}
      {isVoiceMode && (
        <View style={styles.voiceModeBanner}>
          <Mic size={14} color={theme.colors.accent.amber} />
          <Text style={styles.voiceModeText}>Speech dictation active: dictate your question naturally</Text>
        </View>
      )}

      {/* Input Bar */}
      <View style={styles.inputContainer}>
        <Pressable
          style={[styles.voiceBtn, isVoiceMode && styles.voiceBtnActive]}
          onPress={handleVoiceDictation}
          accessibilityLabel="Dictate question"
          hitSlop={8}
        >
          {isVoiceMode ? (
            <MicOff size={18} color={theme.colors.accent.amber} />
          ) : (
            <Mic size={18} color={theme.colors.text.secondary} />
          )}
        </Pressable>

        <TextInput
          style={styles.input}
          placeholder={isVoiceMode ? "Dictating question..." : "Ask your assistant about tasks, deadlines..."}
          placeholderTextColor={theme.colors.text.muted}
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={500}
        />

        <Pressable
          style={[
            styles.sendBtn,
            (!inputText.trim() || isLoading) && styles.sendBtnDisabled,
          ]}
          onPress={() => handleSend()}
          disabled={!inputText.trim() || isLoading}
        >
          <Send size={18} color={inputText.trim() ? theme.colors.background.base : theme.colors.text.muted} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.base,
  },
  topBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "rgba(16, 185, 129, 0.08)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(16, 185, 129, 0.2)",
  },
  bannerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  bannerText: {
    fontSize: 11,
    color: theme.colors.accent.emerald,
    fontWeight: "700",
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: theme.colors.surface.card,
  },
  clearBtnText: {
    fontSize: 11,
    color: theme.colors.text.secondary,
    fontWeight: "600",
  },
  chatArea: {
    flex: 1,
  },
  chatContent: {
    padding: 16,
    gap: 14,
  },
  msgRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-end",
  },
  msgRowUser: {
    justifyContent: "flex-end",
  },
  msgRowAssistant: {
    justifyContent: "flex-start",
  },
  avatarBot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarUser: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.surface.card,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    alignItems: "center",
    justifyContent: "center",
  },
  bubble: {
    maxWidth: "80%",
    padding: 14,
    borderRadius: 16,
  },
  bubbleUser: {
    backgroundColor: theme.colors.accent.amber,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: theme.colors.surface.card,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderBottomLeftRadius: 4,
  },
  loadingBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    fontSize: 12,
    color: theme.colors.text.secondary,
    fontStyle: "italic",
  },
  msgText: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.text.primary,
  },
  msgTextUser: {
    color: theme.colors.background.base,
    fontWeight: "600",
  },
  toolCallsContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    gap: 4,
  },
  toolCallBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  toolCallText: {
    fontSize: 11,
    color: theme.colors.accent.amber,
    fontWeight: "600",
  },
  sourcesContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  sourcesText: {
    fontSize: 10,
    color: theme.colors.accent.emerald,
    fontStyle: "italic",
  },
  quickPromptsSection: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  quickPromptLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.text.muted,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  quickChips: {
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.colors.surface.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  chipText: {
    fontSize: 12,
    color: theme.colors.text.primary,
    fontWeight: "500",
  },
  voiceModeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: "rgba(245, 158, 11, 0.3)",
  },
  voiceModeText: {
    fontSize: 11,
    color: theme.colors.accent.amber,
    fontWeight: "600",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.colors.surface.card,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.subtle,
    gap: 8,
  },
  voiceBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.colors.background.base,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  voiceBtnActive: {
    backgroundColor: "rgba(245, 158, 11, 0.2)",
    borderColor: theme.colors.accent.amber,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: theme.colors.background.base,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.colors.text.primary,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.accent.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: theme.colors.surface.elevated,
  },
});
