package com.alibi.app

import android.content.Context
import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Runs the app's "AlibiQuickAdd" JavaScript task in the background so a task spoken from
 * the home-screen widget is saved without opening ALIBI (FR-PROD-012). The JS side writes
 * to the same on-device task store, syncs, refreshes the widget and schedules check-ins.
 */
class QuickAddTaskService : HeadlessJsTaskService() {
    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
        val text = intent?.getStringExtra(EXTRA_TEXT)?.trim().orEmpty()
        if (text.isEmpty()) return null
        val data = Arguments.createMap().apply { putString("text", text.take(500)) }
        return HeadlessJsTaskConfig(TASK_NAME, data, 30_000L, true)
    }

    companion object {
        const val TASK_NAME = "AlibiQuickAdd"
        private const val EXTRA_TEXT = "com.alibi.app.QUICK_ADD_TEXT"

        fun start(context: Context, text: String) {
            val intent = Intent(context, QuickAddTaskService::class.java).putExtra(EXTRA_TEXT, text)
            context.startService(intent)
            HeadlessJsTaskService.acquireWakeLockNow(context)
        }
    }
}
