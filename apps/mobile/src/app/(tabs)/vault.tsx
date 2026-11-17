import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { BookOpen, FileText, Link as LinkIcon, Plus, Search, Send, Sparkles, X } from "lucide-react-native";
import theme from "../../lib/theme";
import { ensureAuthenticated } from "../../lib/auth";
import { getServerUrl } from "../../lib/config";
import { BrandHeader, SunriseArt } from "../../components/brand-ui";

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
  const [notes, setNotes] = useState<VaultNote[]>([]);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createVisible, setCreateVisible] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  // FR-KNOW-003/004: search and create notes through the authenticated Vault API.
  const loadNotes = useCallback(async () => {
    setError(null);
    try {
      const token = await ensureAuthenticated();
      const response = await fetch(`${getServerUrl()}/api/v1/vault/notes?limit=50`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("Could not load your vault. Try again.");
      setNotes(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect to your vault.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  const searchNotes = async () => {
    const text = query.trim();
    if (!text) { setResults(null); return; }
    setSearching(true);
    setError(null);
    try {
      const token = await ensureAuthenticated();
      const response = await fetch(`${getServerUrl()}/api/v1/vault/search`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: text, mode: "keyword", limit: 20 }),
      });
      if (!response.ok) throw new Error("Search could not finish. Try again.");
      setResults(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not search your vault.");
    } finally {
      setSearching(false);
    }
  };

  const createNote = async () => {
    if (!title.trim() || !body.trim() || saving) return;
    setSaving(true);
    try {
      const token = await ensureAuthenticated();
      const response = await fetch(`${getServerUrl()}/api/v1/vault/notes`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), source_type: "manual", privacy_class: "personal", occurred_on: localDateString() }),
      });
      if (!response.ok) throw new Error("Could not save this note. Try again.");
      setTitle(""); setBody(""); setCreateVisible(false); setResults(null); await loadNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this note.");
    } finally {
      setSaving(false);
    }
  };

  const shownItems = results ?? notes;
  return <View style={styles.container}>
    <SunriseArt height={180} />
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <BrandHeader />
      <View style={styles.heading}><Text style={styles.title}>Vault</Text><Text style={styles.subtitle}>Your knowledge space. Save, organize and find things quickly.</Text></View>
      <View style={styles.searchBox}><Search size={20} color={theme.colors.text.secondary} /><TextInput value={query} onChangeText={(value) => { setQuery(value); if (!value.trim()) setResults(null); }} onSubmitEditing={searchNotes} returnKeyType="search" placeholder="Search notes, tasks and meetings…" placeholderTextColor={theme.colors.text.muted} style={styles.searchInput} /><Pressable accessibilityRole="button" accessibilityLabel="Search your vault" onPress={searchNotes} style={styles.searchButton}>{searching ? <ActivityIndicator size="small" color="#fff" /> : <Search size={17} color="#fff" />}</Pressable></View>
      <View style={styles.shortcuts}>
        <Pressable style={styles.shortcut} onPress={() => setCreateVisible(true)}><View style={[styles.shortcutIcon, { backgroundColor: "#FFF0E6" }]}><FileText size={22} color="#F97316" /></View><Text style={styles.shortcutText}>New note</Text></Pressable>
        <Pressable style={styles.shortcut} onPress={() => router.push("/ai")}><View style={[styles.shortcutIcon, { backgroundColor: "#F3EEFF" }]}><Sparkles size={22} color="#8B5CF6" /></View><Text style={styles.shortcutText}>Ask ALIBI</Text></Pressable>
        <View style={styles.shortcut}><View style={[styles.shortcutIcon, { backgroundColor: "#EAF4FF" }]}><BookOpen size={22} color="#3986CE" /></View><Text style={styles.shortcutText}>Private notes</Text></View>
      </View>

      <View style={styles.sectionHead}><View><Text style={styles.sectionTitle}>{results ? "Search Results" : "Recent Items"}</Text><Text style={styles.sectionCaption}>{results ? "From your saved records" : "Your saved notes and records"}</Text></View>{results !== null && <Pressable onPress={() => { setResults(null); setQuery(""); }}><Text style={styles.clearText}>Clear</Text></Pressable>}</View>
      {error && <View style={styles.errorCard}><Text style={styles.errorText}>{error}</Text><Pressable onPress={loadNotes}><Text style={styles.retryText}>Retry</Text></Pressable></View>}
      {loading || searching ? <ActivityIndicator color={theme.colors.accent.amber} style={{ marginTop: 30 }} /> : shownItems.length === 0 ? <View style={styles.emptyCard}><BookOpen size={28} color="#E87935" /><Text style={styles.emptyTitle}>{results ? "No matching records" : "Your vault is ready"}</Text><Text style={styles.emptyText}>{results ? "Try another phrase or clear the search." : "Save a note to make it easy to find later."}</Text>{!results && <Pressable onPress={() => setCreateVisible(true)} style={styles.emptyButton}><Plus size={17} color="#fff" /><Text style={styles.emptyButtonText}>Create a note</Text></Pressable>}</View> : shownItems.map((item) => <View key={("note_id" in item ? item.note_id : item.id)} style={styles.noteCard}><View style={styles.noteIcon}><FileText size={20} color="#F47B36" /></View><View style={styles.noteCopy}><Text style={styles.noteTitle} numberOfLines={2}>{item.title}</Text><Text style={styles.noteSummary} numberOfLines={2}>{"snippet" in item ? item.snippet : item.body}</Text><View style={styles.noteMeta}><Text style={styles.metaText}>{item.source_type.replaceAll("_", " ")}</Text><View style={styles.metaDot} /><Text style={styles.metaText}>{item.occurred_on}</Text><View style={styles.metaDot} /><Text style={styles.metaText}>{item.privacy_class}</Text></View></View><LinkIcon size={17} color="#8B96A4" /></View>)}
      <Pressable style={styles.askCard} onPress={() => router.push("/ai")}><Sparkles size={22} color="#8759E8" /><View style={styles.askCopy}><Text style={styles.askTitle}>Ask ALIBI</Text><Text style={styles.askText}>Get grounded answers from your notes and work records.</Text></View><Send size={18} color="#53657A" /></Pressable>
    </ScrollView>
    <Modal visible={createVisible} animationType="slide" transparent onRequestClose={() => setCreateVisible(false)}><View style={styles.modalShade}><View style={styles.modal}><View style={styles.modalHandle} /><View style={styles.modalHeading}><Text style={styles.modalTitle}>New Note</Text><Pressable onPress={() => setCreateVisible(false)} accessibilityLabel="Close"><X size={22} color="#0B2030" /></Pressable></View><TextInput value={title} onChangeText={setTitle} placeholder="Give your note a title" placeholderTextColor="#929EAC" style={styles.titleInput} /><TextInput value={body} onChangeText={setBody} placeholder="Write something worth remembering…" placeholderTextColor="#929EAC" multiline textAlignVertical="top" style={styles.bodyInput} /><Text style={styles.privateHint}>This note is saved to your personal vault.</Text><Pressable disabled={!title.trim() || !body.trim() || saving} onPress={createNote} style={[styles.saveButton, (!title.trim() || !body.trim() || saving) && { opacity: .55 }]}><Text style={styles.saveButtonText}>{saving ? "Saving…" : "Save Note"}</Text></Pressable></View></View></Modal>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background.base }, content: { padding: 20, paddingBottom: 30, gap: 16 },
  heading: { paddingTop: 6, paddingBottom: 4 }, title: { color: theme.colors.text.primary, fontSize: 32, fontWeight: "800", letterSpacing: -.8 }, subtitle: { color: theme.colors.text.secondary, fontSize: 14, lineHeight: 20, marginTop: 3 },
  searchBox: { minHeight: 54, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border.subtle, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 13, shadowColor: "#18384D", shadowOpacity: .05, shadowRadius: 13, shadowOffset: { width: 0, height: 5 }, elevation: 2 }, searchInput: { flex: 1, color: theme.colors.text.primary, fontSize: 14, paddingVertical: 10 }, searchButton: { width: 38, height: 38, borderRadius: 13, backgroundColor: "#102E42", alignItems: "center", justifyContent: "center" },
  shortcuts: { flexDirection: "row", gap: 10 }, shortcut: { flex: 1, minHeight: 94, alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border.subtle, backgroundColor: "#FFFFFF" }, shortcutIcon: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center" }, shortcutText: { color: theme.colors.text.primary, fontSize: 11, fontWeight: "700" },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 7 }, sectionTitle: { color: theme.colors.text.primary, fontSize: 19, fontWeight: "800" }, sectionCaption: { color: theme.colors.text.secondary, fontSize: 12, marginTop: 3 }, clearText: { color: "#E97836", fontSize: 13, fontWeight: "700", padding: 8 },
  noteCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 19, borderWidth: 1, borderColor: theme.colors.border.subtle, backgroundColor: "#FFFFFF", shadowColor: "#19354A", shadowOpacity: .04, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 1 }, noteIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: "#FFF1E8", alignItems: "center", justifyContent: "center" }, noteCopy: { flex: 1, gap: 4 }, noteTitle: { color: theme.colors.text.primary, fontSize: 14, fontWeight: "700" }, noteSummary: { color: theme.colors.text.secondary, fontSize: 12, lineHeight: 17 }, noteMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }, metaText: { color: theme.colors.text.muted, fontSize: 10, textTransform: "capitalize" }, metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: "#A9B2BC" },
  askCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 19, backgroundColor: "#F5F1FF", borderWidth: 1, borderColor: "#EAE2FF", marginTop: 4 }, askCopy: { flex: 1 }, askTitle: { color: theme.colors.text.primary, fontSize: 15, fontWeight: "800" }, askText: { color: theme.colors.text.secondary, fontSize: 12, lineHeight: 17, marginTop: 3 },
  emptyCard: { minHeight: 210, borderRadius: 22, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: theme.colors.border.subtle, alignItems: "center", justifyContent: "center", padding: 24, gap: 9 }, emptyTitle: { color: theme.colors.text.primary, fontSize: 17, fontWeight: "800" }, emptyText: { color: theme.colors.text.secondary, fontSize: 13, textAlign: "center", lineHeight: 19 }, emptyButton: { backgroundColor: "#102E42", borderRadius: 13, minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 15, marginTop: 7 }, emptyButtonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 }, errorCard: { backgroundColor: "#FFF2F0", padding: 14, borderRadius: 14 }, errorText: { color: "#B42318", fontSize: 13 }, retryText: { color: "#B42318", fontWeight: "700", marginTop: 7 },
  modalShade: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(8,23,35,.42)" }, modal: { backgroundColor: "#FFFEFD", borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 22, paddingBottom: 28, gap: 13 }, modalHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 5, backgroundColor: "#B7BEC7", marginBottom: 5 }, modalHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, modalTitle: { color: theme.colors.text.primary, fontSize: 22, fontWeight: "800" }, titleInput: { minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: theme.colors.border.subtle, paddingHorizontal: 13, color: theme.colors.text.primary, fontSize: 15, backgroundColor: "#FFFFFF" }, bodyInput: { minHeight: 170, borderRadius: 15, borderWidth: 1, borderColor: theme.colors.border.subtle, padding: 13, color: theme.colors.text.primary, fontSize: 14, backgroundColor: "#FFFFFF" }, privateHint: { color: theme.colors.text.secondary, fontSize: 12 }, saveButton: { minHeight: 52, borderRadius: 15, backgroundColor: "#F97316", alignItems: "center", justifyContent: "center", marginTop: 3 }, saveButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
});
