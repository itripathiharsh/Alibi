import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { BookOpen, CheckSquare, FileText, Link as LinkIcon, Mic, Plus, Search, Send, Sparkles, Square, Trash2, X } from "lucide-react-native";
import theme from "../../lib/theme";
import { ensureAuthenticated, getUserProfile, setCachedIsOffline, useOfflineStatus } from "../../lib/auth";
import { getServerUrl } from "../../lib/config";
import { BrandHeader, OfflineNoticeCard, SunriseArt } from "../../components/brand-ui";
import { startSpeechRecognition, stopSpeechRecognition } from "../../lib/speech";
import { triggerHaptic } from "../../lib/focus-session-notification";
import { deleteLocalNote, getLocalNotes, makeOfflineId, saveLocalNote } from "../../lib/offline-sync";

type VaultNote = { id: string; title: string; body: string; source_type: string; occurred_on: string; privacy_class: string };
type SearchResult = { note_id: string; title: string; snippet: string; source_type: string; occurred_on: string; privacy_class: string };

function localDateString() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export default function VaultScreen() {
  const router = useRouter();
  const { noteId } = useLocalSearchParams<{ noteId?: string }>();
  const [notes, setNotes] = useState<VaultNote[]>([]);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const { isOffline } = useOfflineStatus();
  const [error, setError] = useState<string | null>(null);
  const [createVisible, setCreateVisible] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [privateOnly, setPrivateOnly] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState<VaultNote | null>(null);
  const [taskText, setTaskText] = useState("");
  const [convertingTask, setConvertingTask] = useState(false);
  const [createdTaskTitle, setCreatedTaskTitle] = useState<string | null>(null);
  const voiceBase = useRef("");
  const routeNoteLoaded = useRef<string | null>(null);

  // Local-first note loading: load SQLite first, then sync with server if online
  const loadNotes = useCallback(async () => {
    setError(null);
    let userId = "local_user";
    try {
      const profile = await getUserProfile();
      if (profile?.id) userId = profile.id;

      // 1. Load SQLite local notes first
      const local = await getLocalNotes(userId);
      const mappedLocal: VaultNote[] = local.map((n) => ({
        id: String(n.id),
        title: String(n.title || "Untitled Note"),
        body: String(n.body || ""),
        source_type: String(n.source_type || "manual"),
        occurred_on: String(n.occurred_on || localDateString()),
        privacy_class: String(n.privacy_class || "personal"),
      }));
      setNotes(mappedLocal);

      // 2. Try online fetch if authenticated
      const token = await ensureAuthenticated();
      if (token) {
        const response = await fetch(`${getServerUrl()}/api/v1/vault/notes?limit=50`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const remoteNotes = (await response.json()) as VaultNote[];
          if (Array.isArray(remoteNotes)) {
            for (const rn of remoteNotes) {
              await saveLocalNote(userId, rn);
            }
            setNotes(remoteNotes);
            setCachedIsOffline(false);
            return;
          }
        }
      }
      setCachedIsOffline(true);
    } catch {
      setCachedIsOffline(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadNotes(); }, [loadNotes]);
  useEffect(() => () => { void stopSpeechRecognition(); }, []);

  const openNote = useCallback(async (id: string) => {
    // 1. Check if note is already loaded in local memory
    const existing = notes.find((item) => item.id === id);
    if (existing) {
      setSelectedNote(existing);
      setTaskText(existing.title);
      setCreatedTaskTitle(null);
      return;
    }

    try {
      const token = await ensureAuthenticated();
      if (token) {
        const response = await fetch(`${getServerUrl()}/api/v1/vault/notes/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const note: VaultNote = await response.json();
          setSelectedNote(note);
          setTaskText(note.title);
          setCreatedTaskTitle(null);
          return;
        }
      }
    } catch {
      // ignore
    }
    Alert.alert("Note", "This note is not currently available locally.");
  }, [notes]);

  useEffect(() => {
    if (noteId && routeNoteLoaded.current !== noteId) {
      routeNoteLoaded.current = noteId;
      void openNote(noteId);
    }
  }, [noteId, openNote]);

  const toggleVoice = async () => {
    setVoiceError(null);
    if (listening) {
      await stopSpeechRecognition();
      setListening(false);
      return;
    }
    voiceBase.current = body.trim();
    const started = await startSpeechRecognition({
      onStart: () => setListening(true),
      onResults: (transcript) => setBody(`${voiceBase.current}${voiceBase.current ? " " : ""}${transcript}`),
      onError: (message) => { setVoiceError(message); setListening(false); },
      onEnd: () => setListening(false),
    });
    if (!started) setListening(false);
  };

  const searchNotes = async () => {
    const text = query.trim();
    if (!text) { setResults(null); return; }
    setSearching(true);
    setError(null);

    // 1. Local keyword search
    const q = text.toLowerCase();
    const localMatches: SearchResult[] = notes
      .filter((n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q))
      .map((n) => ({
        note_id: n.id,
        title: n.title,
        snippet: n.body.slice(0, 140),
        source_type: n.source_type,
        occurred_on: n.occurred_on,
        privacy_class: n.privacy_class,
      }));
    setResults(localMatches);

    // 2. If online, also search backend
    try {
      const token = await ensureAuthenticated();
      if (token) {
        const response = await fetch(`${getServerUrl()}/api/v1/vault/search`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query: text, mode: "keyword", limit: 20 }),
        });
        if (response.ok) {
          const serverResults = await response.json();
          if (Array.isArray(serverResults) && serverResults.length > 0) {
            setResults(serverResults);
          }
        }
      }
    } catch {
      // offline: keep local results
    } finally {
      setSearching(false);
    }
  };

  // Local-first note creation: saves to SQLite, queues in outbox, pushes to server if online
  const createNote = async () => {
    if (!title.trim() || !body.trim() || saving) return;
    setSaving(true);
    try {
      const profile = await getUserProfile();
      const userId = profile?.id ?? "local_user";
      const newNote: VaultNote = {
        id: makeOfflineId(),
        title: title.trim(),
        body: body.trim(),
        source_type: "manual",
        privacy_class: "personal",
        occurred_on: localDateString(),
      };

      // Save to local SQLite & sync outbox
      await saveLocalNote(userId, newNote);

      // Best-effort online sync
      const token = await ensureAuthenticated();
      if (token) {
        try {
          await fetch(`${getServerUrl()}/api/v1/vault/notes`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(newNote),
          });
        } catch {
          // Will sync via outbox later
        }
      }

      setTitle("");
      setBody("");
      setCreateVisible(false);
      setResults(null);
      await loadNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this note.");
    } finally {
      setSaving(false);
    }
  };

  const deleteNote = async (noteIdToDelete: string) => {
    Alert.alert("Delete Note", "Are you sure you want to remove this note?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const profile = await getUserProfile();
            const userId = profile?.id ?? "local_user";
            await deleteLocalNote(userId, noteIdToDelete);
            setSelectedNote(null);
            await loadNotes();
          } catch (err) {
            Alert.alert("Error", err instanceof Error ? err.message : "Could not delete note.");
          }
        },
      },
    ]);
  };

  const convertNoteToTask = async (note: VaultNote, rawTaskText: string) => {
    const cleanTaskText = rawTaskText.trim();
    if (!cleanTaskText || convertingTask) return;
    setConvertingTask(true);
    try {
      triggerHaptic("complete");
      const token = await ensureAuthenticated();
      if (!token) {
        Alert.alert("Sign In", "Sign in to convert notes to active tasks.");
        return;
      }
      const response = await fetch(`${getServerUrl()}/api/v1/vault/notes/${note.id}/convert-task`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ task_text: cleanTaskText }),
      });
      if (!response.ok) throw new Error("Could not create and link this task.");
      const result: { task_title: string } = await response.json();
      setCreatedTaskTitle(result.task_title);
      triggerHaptic("complete");
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to convert note to task.");
    } finally {
      setConvertingTask(false);
    }
  };

  const uncheckedChecklistItems = selectedNote?.body
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*[-*+]\s+\[\s\]\s+(.+?)\s*$/)?.[1]?.trim())
    .filter((line): line is string => Boolean(line)) ?? [];

  const shownItems = results ?? (privateOnly ? notes.filter((item) => item.privacy_class === "personal" || item.privacy_class === "private") : notes);
  return (
    <View style={styles.container}>
      <SunriseArt height={175} />
      <BrandHeader
        showOfflineBadge={isOffline}
        onOfflineBadgePress={() => router.push("/login")}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.heading}><Text style={styles.title}>Vault</Text><Text style={styles.subtitle}>Your knowledge space. Save, organize and find things quickly.</Text></View>
        {isOffline && (
          <OfflineNoticeCard
            featureName="Vault"
            description="Notes are saved locally in SQLite and available offline. They will sync automatically when connected."
            actionText="Sign in to sync"
            onAction={() => router.push("/login")}
          />
        )}
        <View style={styles.searchBox}><Search size={20} color={theme.colors.text.secondary} /><TextInput value={query} onChangeText={(value) => { setQuery(value); if (!value.trim()) setResults(null); }} onSubmitEditing={searchNotes} returnKeyType="search" placeholder="Search notes, tasks and meetings…" placeholderTextColor={theme.colors.text.muted} style={styles.searchInput} /><Pressable accessibilityRole="button" accessibilityLabel="Search your vault" onPress={searchNotes} style={styles.searchButton}>{searching ? <ActivityIndicator size="small" color="#fff" /> : <Search size={17} color="#fff" />}</Pressable></View>
        <View style={styles.shortcuts}>
          <Pressable style={styles.shortcut} onPress={() => setCreateVisible(true)}><View style={[styles.shortcutIcon, { backgroundColor: "#FFF0E6" }]}><FileText size={22} color="#F97316" /></View><Text style={styles.shortcutText}>New note</Text></Pressable>
          <Pressable style={styles.shortcut} onPress={() => router.push("/ai")}><View style={[styles.shortcutIcon, { backgroundColor: "#F3EEFF" }]}><Sparkles size={22} color="#8B5CF6" /></View><Text style={styles.shortcutText}>Ask ALIBI</Text></Pressable>
          <Pressable style={[styles.shortcut, privateOnly && styles.shortcutActive]} onPress={() => { setPrivateOnly((active) => !active); setResults(null); setQuery(""); }} accessibilityRole="button" accessibilityLabel={privateOnly ? "Show all vault items" : "Open private notes"}><View style={[styles.shortcutIcon, { backgroundColor: "#EAF4FF" }]}><BookOpen size={22} color="#3986CE" /></View><Text style={styles.shortcutText}>{privateOnly ? "All items" : "Private notes"}</Text></Pressable>
        </View>

        <View style={styles.sectionHead}><View><Text style={styles.sectionTitle}>{results ? "Search Results" : privateOnly ? "Private Notes" : "Recent Items"}</Text><Text style={styles.sectionCaption}>{results ? "From your saved records" : privateOnly ? "Personal notes saved in your private vault" : "Your saved notes and records"}</Text></View>{(results !== null || privateOnly) && <Pressable onPress={() => { setResults(null); setPrivateOnly(false); setQuery(""); }}><Text style={styles.clearText}>Show all</Text></Pressable>}</View>
        {error && <View style={styles.errorCard}><Text style={styles.errorText}>{error}</Text><Pressable onPress={loadNotes}><Text style={styles.retryText}>Retry</Text></Pressable></View>}
        {loading || searching ? <ActivityIndicator color={theme.colors.accent.amber} style={{ marginTop: 30 }} /> : shownItems.length === 0 ? <View style={styles.emptyCard}><BookOpen size={28} color="#E87935" /><Text style={styles.emptyTitle}>{results ? "No matching records" : "Your vault is ready"}</Text><Text style={styles.emptyText}>{results ? "Try another phrase or clear the search." : "Save a note to make it easy to find later."}</Text>{!results && <Pressable onPress={() => setCreateVisible(true)} style={styles.emptyButton}><Plus size={17} color="#fff" /><Text style={styles.emptyButtonText}>Create a note</Text></Pressable>}</View> : shownItems.map((item) => { const id = "note_id" in item ? item.note_id : item.id; return <Pressable key={id} onPress={() => openNote(id)} style={styles.noteCard} accessibilityRole="button" accessibilityLabel={`Open note ${item.title}`}><View style={styles.noteIcon}><FileText size={20} color="#F47B36" /></View><View style={styles.noteCopy}><Text style={styles.noteTitle} numberOfLines={2}>{item.title}</Text><Text style={styles.noteSummary} numberOfLines={2}>{"snippet" in item ? item.snippet : item.body}</Text><View style={styles.noteMeta}><Text style={styles.metaText}>{item.source_type.replaceAll("_", " ")}</Text><View style={styles.metaDot} /><Text style={styles.metaText}>{item.occurred_on}</Text><View style={styles.metaDot} /><Text style={styles.metaText}>{item.privacy_class}</Text></View></View><View style={styles.openNote}><LinkIcon size={17} color="#64748B" /></View></Pressable>; })}
        <Pressable style={styles.askCard} onPress={() => router.push("/ai")}><Sparkles size={22} color="#8759E8" /><View style={styles.askCopy}><Text style={styles.askTitle}>Ask ALIBI</Text><Text style={styles.askText}>Get grounded answers from your notes and work records.</Text></View><Send size={18} color="#53657A" /></Pressable>
      </ScrollView>
      <Modal visible={selectedNote !== null} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setSelectedNote(null)}>
        <View style={styles.modalShade}>
          <View style={styles.detailModal}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeading}>
              <Text style={styles.modalTitle} numberOfLines={2}>{selectedNote?.title}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Pressable
                  onPress={() => selectedNote && void deleteNote(selectedNote.id)}
                  accessibilityRole="button"
                  accessibilityLabel="Delete note"
                  hitSlop={10}
                >
                  <Trash2 size={20} color="#DC2626" />
                </Pressable>
                <Pressable onPress={() => setSelectedNote(null)} accessibilityRole="button" accessibilityLabel="Close note" hitSlop={10}>
                  <X size={22} color="#0B2030" />
                </Pressable>
              </View>
            </View>
            <Text style={styles.detailMeta}>{selectedNote?.occurred_on} · {selectedNote?.privacy_class}</Text>
            <ScrollView style={styles.noteBodyScroll}><Text style={styles.noteBodyText}>{selectedNote?.body}</Text></ScrollView>
            <View style={styles.taskFromNote}><Text style={styles.taskFromNoteTitle}>Turn a note item into a task</Text><Text style={styles.taskFromNoteHint}>Choose an unfinished checklist item, or edit the task text below.</Text>{uncheckedChecklistItems.length > 0 && <ScrollView style={styles.checklistChoices} nestedScrollEnabled>{uncheckedChecklistItems.map((line, index) => <Pressable key={`${index}-${line}`} onPress={() => { setTaskText(line); setCreatedTaskTitle(null); }} style={[styles.checklistChoice, taskText === line && styles.checklistChoiceActive]}><CheckSquare size={16} color={taskText === line ? "#F97316" : "#83909D"} /><Text style={styles.checklistChoiceText}>{line}</Text></Pressable>)}</ScrollView>}<TextInput value={taskText} onChangeText={(value) => { setTaskText(value); setCreatedTaskTitle(null); }} placeholder="Task title" placeholderTextColor="#929EAC" style={styles.titleInput} /><Pressable disabled={!taskText.trim() || convertingTask} onPress={() => selectedNote && void convertNoteToTask(selectedNote, taskText)} style={[styles.saveButton, (!taskText.trim() || convertingTask) && { opacity: .55 }]}><Text style={styles.saveButtonText}>{convertingTask ? "Creating task…" : "Create linked task"}</Text></Pressable>{createdTaskTitle && <Text style={styles.createdTaskText}>Linked task: {createdTaskTitle}</Text>}</View>
          </View>
        </View>
      </Modal>
      <Modal visible={createVisible} animationType="slide" transparent statusBarTranslucent onRequestClose={() => { void stopSpeechRecognition(); setListening(false); setCreateVisible(false); }}><View style={styles.modalShade}><View style={styles.modal}><View style={styles.modalHandle} /><View style={styles.modalHeading}><Text style={styles.modalTitle}>New Note</Text><Pressable onPress={() => { void stopSpeechRecognition(); setListening(false); setCreateVisible(false); }} accessibilityLabel="Close"><X size={22} color="#0B2030" /></Pressable></View><TextInput value={title} onChangeText={setTitle} placeholder="Give your note a title" placeholderTextColor="#929EAC" style={styles.titleInput} /><TextInput value={body} onChangeText={setBody} placeholder="Write or dictate something worth remembering…" placeholderTextColor="#929EAC" multiline textAlignVertical="top" style={styles.bodyInput} /><Pressable onPress={toggleVoice} style={[styles.voiceButton, listening && styles.voiceButtonActive]} accessibilityRole="button" accessibilityLabel={listening ? "Stop voice note" : "Dictate note"}>{listening ? <Square size={17} color="#FFFFFF" fill="#FFFFFF" /> : <Mic size={18} color="#F97316" />}<Text style={[styles.voiceButtonText, listening && { color: "#FFFFFF" }]}>{listening ? "Listening · tap to finish" : "Dictate in real time"}</Text></Pressable>{voiceError && <Text style={styles.voiceError}>{voiceError}</Text>}<Text style={styles.privateHint}>This note is saved to your personal vault in SQLite. Review before saving.</Text><Pressable disabled={!title.trim() || !body.trim() || saving || listening} onPress={createNote} style={[styles.saveButton, (!title.trim() || !body.trim() || saving || listening) && { opacity: .55 }]}><Text style={styles.saveButtonText}>{saving ? "Saving…" : listening ? "Finish dictation to save" : "Save Note"}</Text></Pressable></View></View></Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background.base }, content: { padding: 20, paddingBottom: 30, gap: 16 },
  heading: { paddingTop: 4, paddingBottom: 8 }, title: { color: theme.colors.text.primary, fontSize: 32, fontWeight: "800", letterSpacing: -.8 }, subtitle: { color: theme.colors.text.secondary, fontSize: 14, lineHeight: 20, marginTop: 3 },
  searchBox: { minHeight: 52, borderRadius: theme.radius.cardSecondary, borderWidth: 1, borderColor: theme.colors.border.subtle, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 13, shadowColor: theme.colors.brand.navy, shadowOpacity: .05, shadowRadius: 13, shadowOffset: { width: 0, height: 5 }, elevation: 2 }, searchInput: { flex: 1, color: theme.colors.text.primary, fontSize: 14, paddingVertical: 10 }, searchButton: { width: 38, height: 38, borderRadius: theme.radius.control, backgroundColor: theme.colors.brand.navy, alignItems: "center", justifyContent: "center" },
  shortcuts: { flexDirection: "row", gap: 10 }, shortcut: { flex: 1, minHeight: 94, alignItems: "center", justifyContent: "center", gap: 8, borderRadius: theme.radius.cardSecondary, borderWidth: 1, borderColor: theme.colors.border.subtle, backgroundColor: "#FFFFFF" }, shortcutActive: { borderColor: theme.colors.accent.primary, backgroundColor: "#FFF8F3" }, shortcutIcon: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center" }, shortcutText: { color: theme.colors.text.primary, fontSize: 11, fontWeight: "700" },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 7 }, sectionTitle: { color: theme.colors.text.primary, fontSize: 19, fontWeight: "800" }, sectionCaption: { color: theme.colors.text.secondary, fontSize: 12, marginTop: 3 }, clearText: { color: theme.colors.accent.primary, fontSize: 13, fontWeight: "700", padding: 8 },
  noteCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: theme.radius.cardSecondary, borderWidth: 1, borderColor: theme.colors.border.subtle, backgroundColor: "#FFFFFF", shadowColor: theme.colors.brand.navy, shadowOpacity: .04, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 1 }, noteIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: "#FFF1E8", alignItems: "center", justifyContent: "center" }, noteCopy: { flex: 1, gap: 4 }, noteTitle: { color: theme.colors.text.primary, fontSize: 14, fontWeight: "700" }, noteSummary: { color: theme.colors.text.secondary, fontSize: 12, lineHeight: 17 }, noteMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }, metaText: { color: theme.colors.text.muted, fontSize: 10, textTransform: "capitalize" }, metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: "#A9B2BC" }, openNote: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: theme.radius.cardSecondary, backgroundColor: "#F3F6F8" },
  askCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: theme.radius.cardSecondary, backgroundColor: "#F5F1FF", borderWidth: 1, borderColor: "#EAE2FF", marginTop: 4 }, askCopy: { flex: 1 }, askTitle: { color: theme.colors.text.primary, fontSize: 15, fontWeight: "800" }, askText: { color: theme.colors.text.secondary, fontSize: 12, lineHeight: 17, marginTop: 3 },
  emptyCard: { minHeight: 210, borderRadius: theme.radius.card, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: theme.colors.border.subtle, alignItems: "center", justifyContent: "center", padding: 24, gap: 9 }, emptyTitle: { color: theme.colors.text.primary, fontSize: 17, fontWeight: "800" }, emptyText: { color: theme.colors.text.secondary, fontSize: 13, textAlign: "center", lineHeight: 19 }, emptyButton: { backgroundColor: theme.colors.brand.navy, borderRadius: theme.radius.control, minHeight: 46, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 15, marginTop: 7 }, emptyButtonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 }, errorCard: { backgroundColor: "#FFF2F0", padding: 14, borderRadius: theme.radius.cardSecondary }, errorText: { color: "#B42318", fontSize: 13 }, retryText: { color: "#B42318", fontWeight: "700", marginTop: 7 },
  modalShade: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(8,23,35,.42)" }, modal: { backgroundColor: "#FFFEFD", borderTopLeftRadius: theme.radius.sheet, borderTopRightRadius: theme.radius.sheet, padding: 22, paddingBottom: 28, gap: 13 }, modalHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 5, backgroundColor: "#B7BEC7", marginBottom: 5 }, modalHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, modalTitle: { flex: 1, color: theme.colors.text.primary, fontSize: 22, fontWeight: "800", marginRight: 12 }, titleInput: { minHeight: 48, borderRadius: theme.radius.control, borderWidth: 1, borderColor: theme.colors.border.subtle, paddingHorizontal: 13, color: theme.colors.text.primary, fontSize: 15, backgroundColor: "#FFFFFF" }, bodyInput: { minHeight: 150, borderRadius: theme.radius.control, borderWidth: 1, borderColor: theme.colors.border.subtle, padding: 13, color: theme.colors.text.primary, fontSize: 14, backgroundColor: "#FFFFFF" }, voiceButton: { minHeight: 48, borderRadius: theme.radius.control, borderWidth: 1, borderColor: "#F4C7A8", backgroundColor: "#FFF7F1", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 }, voiceButtonActive: { backgroundColor: theme.colors.brand.navy, borderColor: theme.colors.brand.navy }, voiceButtonText: { color: "#B84E0B", fontWeight: "700", fontSize: 13 }, voiceError: { color: "#B42318", fontSize: 12 }, privateHint: { color: theme.colors.text.secondary, fontSize: 12 }, saveButton: { minHeight: 50, borderRadius: theme.radius.control, backgroundColor: theme.colors.accent.primary, alignItems: "center", justifyContent: "center", marginTop: 3 }, saveButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
  detailModal: { maxHeight: "92%", backgroundColor: "#FFFEFD", borderTopLeftRadius: theme.radius.sheet, borderTopRightRadius: theme.radius.sheet, padding: 22, paddingBottom: 28, gap: 12 }, detailMeta: { color: theme.colors.text.muted, fontSize: 12 }, noteBodyScroll: { maxHeight: 220, borderRadius: theme.radius.cardSecondary, backgroundColor: "#F7F8F9", padding: 13 }, noteBodyText: { color: theme.colors.text.primary, fontSize: 14, lineHeight: 21 }, taskFromNote: { gap: 9, borderTopWidth: 1, borderTopColor: "#E8EDF1", paddingTop: 13 }, taskFromNoteTitle: { color: theme.colors.text.primary, fontSize: 15, fontWeight: "800" }, taskFromNoteHint: { color: theme.colors.text.secondary, fontSize: 12, lineHeight: 17 }, checklistChoices: { maxHeight: 112 }, checklistChoice: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 1, borderColor: "#E3E8ED", backgroundColor: "#FFFFFF", borderRadius: theme.radius.control, paddingHorizontal: 11, marginBottom: 6 }, checklistChoiceActive: { borderColor: theme.colors.accent.primary, backgroundColor: "#FFF7F1" }, checklistChoiceText: { flex: 1, color: theme.colors.text.primary, fontSize: 13 }, createdTaskText: { color: "#167A50", fontSize: 13, fontWeight: "700" },
});
