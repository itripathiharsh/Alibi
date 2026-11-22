package com.alibi.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.widget.RemoteViews

/**
 * Round home-screen widget: today's done / total ring (FR-PROD-010, ADR-028).
 *
 * Android launchers own long-press on every widget (move / resize / remove), so the
 * quick-action menu opens on a tap instead.
 */
class TodayRingWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, widgetIds: IntArray) {
        widgetIds.forEach { render(context, manager, it) }
    }

    override fun onAppWidgetOptionsChanged(
        context: Context,
        manager: AppWidgetManager,
        widgetId: Int,
        newOptions: Bundle,
    ) {
        render(context, manager, widgetId)
    }

    override fun onDeleted(context: Context, widgetIds: IntArray) {
        widgetIds.forEach { TodayWidgetStore.forgetWidget(context, it) }
    }

    companion object {
        fun refreshAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, TodayRingWidget::class.java))
            ids.forEach { render(context, manager, it) }
        }

        fun render(context: Context, manager: AppWidgetManager, widgetId: Int) {
            val options = manager.getAppWidgetOptions(widgetId)
            val minDp = listOf(
                options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 120),
                options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 120),
            ).filter { it > 0 }.minOrNull() ?: 120
            val density = context.resources.displayMetrics.density
            val sizePx = (minDp * density).toInt()

            val snapshot = TodayWidgetStore.readSnapshot(context)
            val views = RemoteViews(context.packageName, R.layout.today_ring_widget)
            views.setImageViewBitmap(R.id.today_ring_image, TodayRingRenderer.render(sizePx, snapshot))
            val description = if (snapshot == null) {
                "ALIBI. Open the app to load today's tasks."
            } else {
                "ALIBI. ${snapshot.done} of ${snapshot.total} tasks done today. Tap for quick actions."
            }
            views.setContentDescription(R.id.today_ring_image, description)

            val intent = Intent(context, QuickMenuActivity::class.java).apply {
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION)
            }
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
            views.setOnClickPendingIntent(
                R.id.today_ring_root,
                PendingIntent.getActivity(context, 7000 + widgetId, intent, flags),
            )
            manager.updateAppWidget(widgetId, views)
        }
    }
}
