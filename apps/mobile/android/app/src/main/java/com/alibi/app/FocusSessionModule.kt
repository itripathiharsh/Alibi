package com.alibi.app

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class FocusSessionModule(private val context: ReactApplicationContext) :
    ReactContextBaseJavaModule(context) {

    override fun getName(): String = "FocusSession"

    @ReactMethod
    fun start(
        taskId: String,
        title: String,
        startedAtMillis: Double,
        durationMinutes: Double,
        showTaskTitle: Boolean,
    ) {
        val intent = Intent(context, FocusSessionService::class.java).apply {
            action = FocusSessionService.ACTION_START
            putExtra(FocusSessionService.EXTRA_TASK_ID, taskId)
            putExtra(FocusSessionService.EXTRA_TITLE, title)
            putExtra(FocusSessionService.EXTRA_STARTED_AT, startedAtMillis.toLong())
            putExtra(FocusSessionService.EXTRA_DURATION_MIN, durationMinutes.toInt())
            putExtra(FocusSessionService.EXTRA_SHOW_TITLE, showTaskTitle)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
        else context.startService(intent)
    }

    @ReactMethod
    fun stop() {
        context.startService(Intent(context, FocusSessionService::class.java).apply {
            action = FocusSessionService.ACTION_STOP
        })
    }

    @ReactMethod
    fun startAmbient(style: String) {
        FocusAmbientAudio.start(context.applicationContext, style)
    }

    @ReactMethod
    fun stopAmbient() {
        FocusAmbientAudio.stop()
    }
}
