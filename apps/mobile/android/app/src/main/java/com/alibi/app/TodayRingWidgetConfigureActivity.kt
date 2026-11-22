package com.alibi.app

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.widget.Button
import android.widget.CheckBox
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast

/** Lets the user pick which quick actions the Today ring widget shows (FR-PROD-010). */
class TodayRingWidgetConfigureActivity : Activity() {
    companion object {
        const val EXTRA_FROM_MENU = "com.alibi.app.FROM_MENU"
        private const val MAX_OPTIONS = 5
    }

    private var widgetId = AppWidgetManager.INVALID_APPWIDGET_ID

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        widgetId = intent?.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
            ?: AppWidgetManager.INVALID_APPWIDGET_ID
        // Backing out of first-time setup cancels adding the widget (Android contract).
        setResult(RESULT_CANCELED, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish()
            return
        }
        setContentView(buildContent())
    }

    private fun dp(value: Int): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics).toInt()

    private fun buildContent(): ScrollView {
        val selected = TodayWidgetStore.options(this, widgetId).toMutableSet()
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(32), dp(24), dp(24))
            setBackgroundColor(Color.parseColor("#FBF9F8"))
        }
        column.addView(TextView(this).apply {
            text = "Quick actions"
            setTextColor(Color.parseColor("#102E42"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 24f)
            typeface = Typeface.DEFAULT_BOLD
        })
        column.addView(TextView(this).apply {
            text = "Choose up to $MAX_OPTIONS actions to show when you tap the ALIBI widget."
            setTextColor(Color.parseColor("#5B6B7A"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            setPadding(0, dp(6), 0, dp(18))
        })

        val boxes = TodayWidgetStore.ALL_OPTIONS.map { option ->
            CheckBox(this).apply {
                text = option.label
                textSize = 17f
                setTextColor(Color.parseColor("#102E42"))
                isChecked = option.key in selected
                minHeight = dp(52)
                tag = option.key
            }.also { column.addView(it) }
        }

        val save = Button(this).apply {
            text = "Save"
            setTextColor(Color.WHITE)
            isAllCaps = false
            textSize = 16f
            background = GradientDrawable().apply {
                cornerRadius = dp(10).toFloat()
                setColor(Color.parseColor("#F47B25"))
            }
            gravity = Gravity.CENTER
            setOnClickListener {
                val keys = boxes.filter { it.isChecked }.map { it.tag as String }
                when {
                    keys.isEmpty() -> Toast.makeText(context, "Pick at least one action", Toast.LENGTH_SHORT).show()
                    keys.size > MAX_OPTIONS -> Toast.makeText(context, "Pick at most $MAX_OPTIONS actions", Toast.LENGTH_SHORT).show()
                    else -> saveAndClose(keys)
                }
            }
        }
        column.addView(save, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(52)).apply {
            topMargin = dp(20)
        })
        return ScrollView(this).apply { addView(column) }
    }

    private fun saveAndClose(keys: List<String>) {
        // Keep the catalogue order so the menu stays predictable.
        val ordered = TodayWidgetStore.ALL_OPTIONS.map { it.key }.filter { it in keys }
        TodayWidgetStore.saveOptions(this, widgetId, ordered)
        TodayRingWidget.render(this, AppWidgetManager.getInstance(this), widgetId)
        setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
        if (intent?.getBooleanExtra(EXTRA_FROM_MENU, false) == true) {
            Toast.makeText(this, "Quick actions saved", Toast.LENGTH_SHORT).show()
        }
        finish()
    }
}
