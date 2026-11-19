package com.alibi.app

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max
import kotlin.random.Random

/** Small locally generated ambient loops. No audio files or network access are used. */
object FocusAmbientAudio {
    private const val SAMPLE_RATE = 22_050
    private const val FRAMES = 2_048
    private val active = AtomicBoolean(false)
    @Volatile private var track: AudioTrack? = null
    @Volatile private var worker: Thread? = null

    @Synchronized
    fun start(context: Context, style: String) {
        stop()
        val selected = style.lowercase()
        if (selected !in setOf("rain", "white", "brown")) return
        val minBuffer = AudioTrack.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_OUT_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        if (minBuffer <= 0) return
        val audio = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build(),
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(SAMPLE_RATE)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build(),
            )
            .setBufferSizeInBytes(max(minBuffer, FRAMES * 2))
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()
        track = audio
        active.set(true)
        audio.play()
        worker = Thread({
            val samples = ShortArray(FRAMES)
            var lowPass = 0.0
            var brown = 0.0
            while (active.get() && !Thread.currentThread().isInterrupted) {
                for (index in samples.indices) {
                    val noise = Random.nextDouble(-1.0, 1.0)
                    val sample = when (selected) {
                        "rain" -> {
                            lowPass = lowPass * 0.94 + noise * 0.06
                            val droplets = if (Random.nextDouble() > 0.997) Random.nextDouble(-0.45, 0.45) else 0.0
                            lowPass * 0.72 + droplets
                        }
                        "brown" -> {
                            brown = (brown + 0.02 * noise).coerceIn(-1.0, 1.0)
                            brown * 2.0
                        }
                        else -> noise * 0.34
                    }
                    samples[index] = (sample.coerceIn(-1.0, 1.0) * 2_200).toInt().toShort()
                }
                val current = track ?: break
                if (current.write(samples, 0, samples.size) < 0) break
            }
        }, "alibi-ambient-audio").also { it.start() }
    }

    @Synchronized
    fun stop() {
        active.set(false)
        worker?.interrupt()
        worker = null
        track?.let { audio ->
            runCatching { audio.pause() }
            runCatching { audio.flush() }
            runCatching { audio.stop() }
            audio.release()
        }
        track = null
    }
}
