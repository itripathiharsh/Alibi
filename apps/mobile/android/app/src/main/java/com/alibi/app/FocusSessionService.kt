package com.alibi.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import java.util.Locale

class FocusSessionService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private var taskId: String = ""
    private var taskTitle: String = ""
    private var startedAt: Long = 0L
    private var durationMinutes: Int = 0
    private var showTaskTitle: Boolean = false

    private val refreshNotification = object : Runnable {
        override fun run() {
            publishNotification()
            handler.postDelayed(this, 30_000L)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> stopSession()
            ACTION_START -> {
                taskId = intent.getStringExtra(EXTRA_TASK_ID).orEmpty()
                taskTitle = intent.getStringExtra(EXTRA_TITLE).orEmpty()
                startedAt = intent.getLongExtra(EXTRA_STARTED_AT, System.currentTimeMillis())
                durationMinutes = intent.getIntExtra(EXTRA_DURATION_MIN, 0).coerceAtLeast(0)
                showTaskTitle = intent.getBooleanExtra(EXTRA_SHOW_TITLE, false)
                ensureChannel()
                publishNotification(startImmediately = true)
                handler.removeCallbacks(refreshNotification)
                handler.postDelayed(refreshNotification, 30_000L)
            }
        }
        return START_NOT_STICKY
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Active focus", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Shows the timer while a focus session is running."
                lockscreenVisibility = Notification.VISIBILITY_PRIVATE
                setShowBadge(false)
            },
        )
    }

    private fun publishNotification(startImmediately: Boolean = false) {
        val notification = buildNotification()
        if (startImmediately && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
            )
        } else if (startImmediately) {
            startForeground(NOTIFICATION_ID, notification)
        } else {
            getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification)
        }
    }

    private fun buildNotification(): Notification {
        val elapsed = ((System.currentTimeMillis() - startedAt).coerceAtLeast(0L) / 1000L).toInt()
        val minutesLeft = ((durationMinutes * 60 - elapsed).coerceAtLeast(0) + 59) / 60
        val visibleTitle = if (showTaskTitle && taskTitle.isNotBlank()) taskTitle else "Focus session"
        val subtitle = if (durationMinutes > 0) {
            if (minutesLeft > 0) "$minutesLeft min remaining" else "Focus block complete"
        } else {
            "Timer running · ${formatElapsed(elapsed)} elapsed"
        }

        val pauseIntent = actionIntent("pause")
        val completeIntent = actionIntent("done")
        val openIntent = actionIntent("open")
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            Notification.Builder(this)
        }
        builder
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(visibleTitle)
            .setContentText(subtitle)
            .setContentIntent(openIntent)
            .setCategory(Notification.CATEGORY_SERVICE)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .setShowWhen(true)
            .setWhen(startedAt)
            .addAction(Notification.Action.Builder(null, "Pause", pauseIntent).build())
            .addAction(Notification.Action.Builder(null, "Mark done", completeIntent).build())

        if (durationMinutes > 0) {
            val totalSeconds = durationMinutes * 60
            builder.setProgress(totalSeconds, elapsed.coerceAtMost(totalSeconds), false)
        } else {
            builder.setUsesChronometer(true)
        }
        return builder.build()
    }

    private fun actionIntent(action: String): PendingIntent {
        val uri = Uri.Builder()
            .scheme("alibi")
            .authority("focus")
            .appendQueryParameter("action", action)
            .appendQueryParameter("task_id", taskId)
            .build()
        val intent = Intent(Intent.ACTION_VIEW, uri, this, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
        return PendingIntent.getActivity(this, (taskId + action).hashCode(), intent, flags)
    }

    private fun stopSession() {
        handler.removeCallbacks(refreshNotification)
        FocusAmbientAudio.stop()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        handler.removeCallbacks(refreshNotification)
        super.onDestroy()
    }

    private fun formatElapsed(seconds: Int): String =
        String.format(Locale.getDefault(), "%02d:%02d", seconds / 3600, (seconds / 60) % 60)

    companion object {
        const val ACTION_START = "com.alibi.app.focus.START"
        const val ACTION_STOP = "com.alibi.app.focus.STOP"
        const val EXTRA_TASK_ID = "task_id"
        const val EXTRA_TITLE = "task_title"
        const val EXTRA_STARTED_AT = "started_at"
        const val EXTRA_DURATION_MIN = "duration_min"
        const val EXTRA_SHOW_TITLE = "show_task_title"
        private const val CHANNEL_ID = "alibi-focus-session"
        private const val NOTIFICATION_ID = 4102
    }
}
