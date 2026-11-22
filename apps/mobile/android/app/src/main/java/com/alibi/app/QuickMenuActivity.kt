package com.alibi.app

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Translucent quick-action menu opened from the Today ring widget (FR-PROD-010).
 * Blurs the home screen on Android 12+ and dims it on older versions.
 */
class QuickMenuActivity : Activity() {
    private var widgetId = AppWidgetManager.INVALID_APPWIDGET_ID

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        widgetId = intent?.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
            ?: AppWidgetManager.INVALID_APPWIDGET_ID

        window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
        window.setDimAmount(0.45f)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            window.addFlags(WindowManager.LayoutParams.FLAG_BLUR_BEHIND)
            window.attributes = window.attributes.apply { blurBehindRadius = dp(28) }
        }

        setContentView(buildContent())
    }

    private fun dp(value: Int): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics).toInt()

    private fun buildContent(): View {
        val root = FrameLayout(this).apply {
            setOnClickListener { finish() }
            contentDescription = "Close quick actions"
        }

        val snapshot = TodayWidgetStore.readSnapshot(this)
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            isClickable = true // taps between pills do not close the menu
        }

        val ringSize = dp(132)
        val ring = ImageView(this).apply {
            setImageBitmap(TodayRingRenderer.render(this@QuickMenuActivity, ringSize, snapshot))
            contentDescription = if (snapshot == null) "ALIBI" else "${snapshot.done} of ${snapshot.total} done today"
            setOnClickListener { open("open_app") }
        }
        row.addView(ring, LinearLayout.LayoutParams(ringSize, ringSize).apply { marginEnd = dp(14) })

        val column = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val keys = TodayWidgetStore.options(this, widgetId)
        keys.forEachIndexed { index, key ->
            val option = TodayWidgetStore.ALL_OPTIONS.firstOrNull { it.key == key } ?: return@forEachIndexed
            val pill = pill(option, subtitleFor(option.key, snapshot))
            column.addView(
                pill,
                LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(56)).apply {
                    topMargin = if (index == 0) 0 else dp(10)
                },
            )
            pill.alpha = 0f
            pill.translationX = dp(24).toFloat()
            pill.animate().alpha(1f).translationX(0f).setStartDelay(40L * index).setDuration(180)
                .setInterpolator(DecelerateInterpolator()).start()
        }
        if (widgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
            val edit = TextView(this).apply {
                text = "Edit actions"
                setTextColor(Color.parseColor("#D9E1E8"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
                setPadding(dp(12), dp(10), dp(12), dp(6))
                setOnClickListener {
                    startActivity(
                        Intent(this@QuickMenuActivity, TodayRingWidgetConfigureActivity::class.java)
                            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
                            .putExtra(TodayRingWidgetConfigureActivity.EXTRA_FROM_MENU, true),
                    )
                    finish()
                }
            }
            column.addView(edit)
        }
        row.addView(column)

        root.addView(
            row,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER,
            ).apply { setMargins(dp(16), dp(16), dp(16), dp(16)) },
        )
        return root
    }

    private fun subtitleFor(key: String, snapshot: TodayWidgetStore.Snapshot?): String? {
        if (key != "current_task") return null
        if (snapshot?.currentTitle == null) return "Nothing due next"
        val started = snapshot.currentStartedAt
        return if (snapshot.currentKind == "running" && started != null) {
            val minutes = ((System.currentTimeMillis() - started) / 60_000L).coerceAtLeast(0)
            "${snapshot.currentTitle} (${minutes} min)"
        } else {
            "Next: ${snapshot.currentTitle}"
        }
    }

    private fun pill(option: TodayWidgetStore.Option, subtitle: String?): View {
        val pill = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(10), 0, dp(20), 0)
            background = GradientDrawable().apply {
                cornerRadius = dp(28).toFloat()
                setColor(Color.parseColor("#E6122233"))
                setStroke(dp(1), Color.parseColor("#80F6B48A"))
            }
            minimumWidth = dp(190)
            isClickable = true
            isFocusable = true
            contentDescription = if (subtitle != null) "${option.label}: $subtitle" else option.label
            setOnClickListener { open(option.key) }
        }
        val icon = TextView(this).apply {
            text = option.glyph
            gravity = Gravity.CENTER
            setTextColor(Color.parseColor("#F47B25"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            typeface = Typeface.DEFAULT_BOLD
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setStroke(dp(2), Color.parseColor("#F47B25"))
            }
        }
        pill.addView(icon, LinearLayout.LayoutParams(dp(36), dp(36)).apply { marginEnd = dp(12) })

        val texts = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        texts.addView(TextView(this).apply {
            text = option.label
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            typeface = Typeface.DEFAULT_BOLD
        })
        if (subtitle != null) {
            texts.addView(TextView(this).apply {
                text = subtitle
                setTextColor(Color.parseColor("#C9D3DC"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
                maxLines = 1
                ellipsize = TextUtils.TruncateAt.END
                maxWidth = dp(170)
            })
        }
        pill.addView(texts)
        return pill
    }

    private fun open(key: String) {
        startActivity(TodayWidgetStore.intentFor(this, key))
        finish()
    }

    override fun finish() {
        super.finish()
        @Suppress("DEPRECATION")
        overridePendingTransition(0, android.R.anim.fade_out)
    }
}
