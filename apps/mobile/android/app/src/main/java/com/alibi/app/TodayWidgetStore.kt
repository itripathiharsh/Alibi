package com.alibi.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import org.json.JSONObject
import java.util.Calendar

/**
 * Shared state for the "Today" ring widget and its quick menu (FR-PROD-010, ADR-028).
 *
 * The React Native app writes a snapshot of today's real counts here; the widget and the
 * quick menu only read it. A snapshot from another day is treated as missing, so the
 * widget never shows yesterday's numbers as today's.
 */
object TodayWidgetStore {
    private const val PREFS = "alibi_today_widget"
    private const val KEY_SNAPSHOT = "snapshot"
    private const val KEY_OPTIONS_PREFIX = "options_"

    data class Snapshot(
        val done: Int,
        val total: Int,
        val currentTitle: String?,
        val currentKind: String?,
        val currentStartedAt: Long?,
        val currentDueAt: Long?,
    )

    /** A quick action the user can put in the menu. */
    data class Option(val key: String, val label: String, val glyph: String)

    val ALL_OPTIONS = listOf(
        Option("current_task", "Current task", "▶"),
        Option("say_task", "Say a task", "●"),
        Option("add_task", "Add task", "+"),
        Option("capture_note", "Capture note", "✎"),
        Option("tell_ai", "Brain dump", "✦"),
        Option("voice_dump", "Say it all", "≋"),
        Option("open_app", "Open app", "↗"),
    )
    val DEFAULT_OPTIONS = listOf("current_task", "say_task", "add_task", "tell_ai", "open_app")

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun saveSnapshot(context: Context, json: String) {
        prefs(context).edit().putString(KEY_SNAPSHOT, json).apply()
    }

    fun todayKey(now: Calendar = Calendar.getInstance()): String =
        String.format(
            "%04d-%02d-%02d",
            now.get(Calendar.YEAR),
            now.get(Calendar.MONTH) + 1,
            now.get(Calendar.DAY_OF_MONTH),
        )

    /** Today's snapshot, or null when there is none or it belongs to another day. */
    fun readSnapshot(context: Context): Snapshot? {
        val raw = prefs(context).getString(KEY_SNAPSHOT, null) ?: return null
        return try {
            val json = JSONObject(raw)
            if (json.optString("date") != todayKey()) return null
            Snapshot(
                done = json.optInt("done", 0).coerceAtLeast(0),
                total = json.optInt("total", 0).coerceAtLeast(0),
                currentTitle = json.optString("current_title").takeIf { !json.isNull("current_title") && it.isNotBlank() },
                currentKind = json.optString("current_kind").takeIf { !json.isNull("current_kind") && it.isNotBlank() },
                currentStartedAt = if (json.isNull("current_started_at")) null else json.optLong("current_started_at"),
                currentDueAt = if (json.isNull("current_due_at")) null else json.optLong("current_due_at"),
            )
        } catch (_: Exception) {
            null
        }
    }

    fun options(context: Context, widgetId: Int): List<String> {
        val saved = prefs(context).getString(KEY_OPTIONS_PREFIX + widgetId, null)
        val keys = saved?.split(",")?.map { it.trim() }?.filter { key -> ALL_OPTIONS.any { it.key == key } }
        return if (keys.isNullOrEmpty()) DEFAULT_OPTIONS else keys
    }

    fun saveOptions(context: Context, widgetId: Int, keys: List<String>) {
        prefs(context).edit().putString(KEY_OPTIONS_PREFIX + widgetId, keys.joinToString(",")).apply()
    }

    fun forgetWidget(context: Context, widgetId: Int) {
        prefs(context).edit().remove(KEY_OPTIONS_PREFIX + widgetId).apply()
    }

    /** Intent that opens the app at the screen for an option (deep links handled by expo-router). */
    fun intentFor(context: Context, key: String): Intent {
        val uri: Uri? = when (key) {
            "current_task" -> Uri.parse("alibi://tasks")
            "add_task" -> Uri.parse("alibi://capture?mode=task")
            "capture_note" -> Uri.parse("alibi://capture?mode=idea")
            "tell_ai" -> Uri.parse("alibi://capture?mode=dump")
            "voice_dump" -> Uri.parse("alibi://capture?mode=dump&voice=1")
            else -> null
        }
        return if (uri != null) {
            Intent(Intent.ACTION_VIEW, uri, context, MainActivity::class.java)
        } else {
            Intent(context, MainActivity::class.java).setAction(Intent.ACTION_MAIN)
        }.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
}
