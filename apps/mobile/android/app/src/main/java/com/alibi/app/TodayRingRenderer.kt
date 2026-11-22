package com.alibi.app

import android.graphics.Bitmap
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface

/** Draws the round "ALIBI · done / total · Today" badge used by the widget and quick menu. */
object TodayRingRenderer {
    private val ORANGE = Color.parseColor("#F47B25")
    private val PEACH = Color.parseColor("#F6B48A")
    private val NAVY_LIGHT = Color.parseColor("#1B3247")
    private val NAVY_DARK = Color.parseColor("#0A1522")
    private val TRACK = Color.parseColor("#33FFFFFF")
    private val SOFT_WHITE = Color.parseColor("#D9E1E8")

    fun render(sizePx: Int, snapshot: TodayWidgetStore.Snapshot?): Bitmap {
        val size = sizePx.coerceIn(96, 560)
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val s = size.toFloat()
        val cx = s / 2f
        val cy = s / 2f
        val glowPad = s * 0.06f
        val radius = s / 2f - glowPad

        // Soft orange glow behind the badge.
        val glow = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = ORANGE
            alpha = 90
            maskFilter = BlurMaskFilter(glowPad, BlurMaskFilter.Blur.NORMAL)
        }
        canvas.drawCircle(cx, cy, radius, glow)

        // Navy face with a light centre.
        val face = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = RadialGradient(cx, cy * 0.85f, radius, NAVY_LIGHT, NAVY_DARK, Shader.TileMode.CLAMP)
        }
        canvas.drawCircle(cx, cy, radius, face)

        // Thin peach rim.
        val rim = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = s * 0.012f
            color = PEACH
            alpha = 200
        }
        canvas.drawCircle(cx, cy, radius, rim)

        // Progress track and arc.
        val ringWidth = s * 0.045f
        val inset = radius * 0.86f
        val arcRect = RectF(cx - inset, cy - inset, cx + inset, cy + inset)
        val track = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = ringWidth
            color = TRACK
        }
        canvas.drawArc(arcRect, 0f, 360f, false, track)
        if (snapshot != null && snapshot.total > 0 && snapshot.done > 0) {
            val sweep = 360f * snapshot.done.coerceAtMost(snapshot.total) / snapshot.total
            val arc = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeWidth = ringWidth
                strokeCap = Paint.Cap.ROUND
                color = ORANGE
            }
            canvas.drawArc(arcRect, -90f, sweep, false, arc)
        }

        // Mountain mark.
        val mark = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = s * 0.018f
            strokeJoin = Paint.Join.ROUND
            strokeCap = Paint.Cap.ROUND
            color = ORANGE
        }
        val mw = s * 0.15f
        val mTop = cy - s * 0.30f
        val mBottom = cy - s * 0.21f
        val path = Path().apply {
            moveTo(cx - mw / 2f, mBottom)
            lineTo(cx - mw / 6f, mTop)
            lineTo(cx + mw / 12f, mBottom - (mBottom - mTop) * 0.35f)
            lineTo(cx + mw / 4f, mTop + (mBottom - mTop) * 0.15f)
            lineTo(cx + mw / 2f, mBottom)
        }
        canvas.drawPath(path, mark)

        val brand = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textSize = s * 0.085f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            letterSpacing = 0.18f
            textAlign = Paint.Align.CENTER
        }
        canvas.drawText("ALIBI", cx, cy - s * 0.10f, brand)

        // Count: "2 / 10" with the done number in orange.
        val bigSize = s * 0.20f
        val doneText = snapshot?.done?.toString() ?: "–"
        val restText = if (snapshot != null) " / ${snapshot.total}" else ""
        val donePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = ORANGE
            textSize = bigSize
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val restPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textSize = bigSize
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val doneWidth = donePaint.measureText(doneText)
        val totalWidth = doneWidth + restPaint.measureText(restText)
        val baseline = cy + s * 0.12f
        val startX = cx - totalWidth / 2f
        canvas.drawText(doneText, startX, baseline, donePaint)
        canvas.drawText(restText, startX + doneWidth, baseline, restPaint)

        val sub = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = SOFT_WHITE
            textSize = s * 0.085f
            textAlign = Paint.Align.CENTER
        }
        val subtitle = when {
            snapshot == null -> "Open ALIBI"
            snapshot.total == 0 -> "Nothing due"
            else -> "Today"
        }
        canvas.drawText(subtitle, cx, cy + s * 0.27f, sub)
        return bitmap
    }
}
