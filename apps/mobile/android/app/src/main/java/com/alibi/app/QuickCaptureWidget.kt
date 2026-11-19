package com.alibi.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import com.alibi.app.R

class QuickCaptureWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, widgetIds: IntArray) {
        widgetIds.forEach { widgetId ->
            val views = RemoteViews(context.packageName, R.layout.quick_capture_widget)
            views.setOnClickPendingIntent(R.id.capture_field, captureIntent(context, widgetId, false))
            views.setOnClickPendingIntent(R.id.capture_voice, captureIntent(context, widgetId, true))
            manager.updateAppWidget(widgetId, views)
        }
    }

    private fun captureIntent(context: Context, widgetId: Int, voice: Boolean): PendingIntent {
        val uri = Uri.Builder()
            .scheme("alibi")
            .authority("capture")
            .apply { if (voice) appendQueryParameter("voice", "1") }
            .build()
        val intent = Intent(Intent.ACTION_VIEW, uri, context, MainActivity::class.java)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
        return PendingIntent.getActivity(context, widgetId * 2 + if (voice) 1 else 0, intent, flags)
    }

    companion object {
        fun refreshAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val component = ComponentName(context, QuickCaptureWidget::class.java)
            val ids = manager.getAppWidgetIds(component)
            QuickCaptureWidget().onUpdate(context, manager, ids)
        }
    }
}
