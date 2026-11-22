package com.alibi.app

import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class SpeechRecognitionModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var speechRecognizer: SpeechRecognizer? = null

    // Each startListening() is a new session. Callbacks from an older, destroyed recognizer
    // (for example ERROR_SERVER_DISCONNECTED = 11 after a restart) are ignored so they can't
    // show an error or old words in the new session.
    private var session = 0
    private var retriedThisSession = false
    private var gotResultThisSession = false

    override fun getName(): String = "SpeechRecognition"

    private fun sendEvent(eventName: String, params: WritableMap?) {
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                ?.emit(eventName, params)
        } catch (_: Exception) {
            // Ignored if JS context is tear down
        }
    }

    private fun friendlyError(error: Int): String? = when (error) {
        SpeechRecognizer.ERROR_AUDIO -> "The microphone could not record. Try again."
        SpeechRecognizer.ERROR_CLIENT -> null // follows a normal stop; not a real failure
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Allow microphone access for ALIBI in Android settings."
        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Voice typing needs a connection right now. Try again or type instead."
        SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Didn't catch that. Tap the mic and speak again."
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Voice typing is busy. Wait a moment and try again."
        SpeechRecognizer.ERROR_SERVER -> "Google's voice service had a problem. Try again."
        10 -> "Too many voice requests. Wait a moment and try again." // ERROR_TOO_MANY_REQUESTS
        11 -> "Voice typing was interrupted. Tap the mic to try again." // ERROR_SERVER_DISCONNECTED
        12, 13 -> "This language isn't available for voice typing on this phone." // LANGUAGE_NOT_SUPPORTED / UNAVAILABLE
        else -> "Voice typing stopped (code $error). Tap the mic to try again."
    }

    private fun listenerFor(token: Int) = object : RecognitionListener {
        private fun current() = token == session

        override fun onReadyForSpeech(params: Bundle?) {
            if (current()) sendEvent("onSpeechStart", Arguments.createMap())
        }

        override fun onBeginningOfSpeech() {
            if (current()) sendEvent("onSpeechBegan", Arguments.createMap())
        }

        override fun onRmsChanged(rmsdB: Float) {
            if (!current()) return
            sendEvent("onSpeechRmsChanged", Arguments.createMap().apply { putDouble("rms", rmsdB.toDouble()) })
        }

        override fun onBufferReceived(buffer: ByteArray?) {}

        override fun onEndOfSpeech() {
            if (current()) sendEvent("onSpeechEnd", Arguments.createMap())
        }

        override fun onError(error: Int) {
            if (!current()) return
            // A disconnect or missing language pack before any words: retry once with the
            // phone's default language before telling the user.
            if (!retriedThisSession && !gotResultThisSession && (error == 11 || error == 12 || error == 13)) {
                retriedThisSession = true
                UiThreadUtil.runOnUiThread { startSession(useIndianEnglish = false) }
                return
            }
            // After words were heard, a late "no match"/client error is just the session ending.
            if (gotResultThisSession && (error == SpeechRecognizer.ERROR_NO_MATCH ||
                    error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT || error == SpeechRecognizer.ERROR_CLIENT || error == 11)) {
                sendEvent("onSpeechEnd", Arguments.createMap())
                return
            }
            val message = friendlyError(error)
            if (message == null) {
                sendEvent("onSpeechEnd", Arguments.createMap())
                return
            }
            sendEvent("onSpeechError", Arguments.createMap().apply {
                putInt("code", error)
                putString("message", message)
            })
        }

        override fun onResults(results: Bundle?) {
            if (!current()) return
            val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: ""
            if (text.isNotEmpty()) gotResultThisSession = true
            sendEvent("onSpeechResults", Arguments.createMap().apply {
                putString("text", text)
                putBoolean("isFinal", true)
            })
            sendEvent("onSpeechEnd", Arguments.createMap())
        }

        override fun onPartialResults(partialResults: Bundle?) {
            if (!current()) return
            val text = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: ""
            if (text.isNotEmpty()) {
                gotResultThisSession = true
                sendEvent("onSpeechResults", Arguments.createMap().apply {
                    putString("text", text)
                    putBoolean("isFinal", false)
                })
            }
        }

        override fun onEvent(eventType: Int, params: Bundle?) {}
    }

    @ReactMethod
    fun isRecognitionAvailable(promise: Promise) {
        try {
            val available = SpeechRecognizer.isRecognitionAvailable(reactContext)
            promise.resolve(available)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    private fun releaseRecognizer() {
        speechRecognizer?.let {
            try { it.cancel() } catch (_: Exception) {}
            try { it.destroy() } catch (_: Exception) {}
        }
        speechRecognizer = null
    }

    /** Must run on the UI thread. */
    private fun startSession(useIndianEnglish: Boolean) {
        releaseRecognizer()
        session += 1
        val recognizer = SpeechRecognizer.createSpeechRecognizer(reactContext)
        recognizer.setRecognitionListener(listenerFor(session))
        speechRecognizer = recognizer
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, reactContext.packageName)
            if (useIndianEnglish) {
                // English as spoken in India; Google's recognizer also handles Hinglish well here.
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-IN")
            }
            // Keep listening through short pauses while someone lists several tasks.
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 2000L)
        }
        recognizer.startListening(intent)
    }

    @ReactMethod
    fun startListening(promise: Promise) {
        UiThreadUtil.runOnUiThread {
            try {
                if (!SpeechRecognizer.isRecognitionAvailable(reactContext)) {
                    promise.reject("SPEECH_UNAVAILABLE", "Voice typing isn't available on this phone")
                    return@runOnUiThread
                }
                retriedThisSession = false
                gotResultThisSession = false
                startSession(useIndianEnglish = true)
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("SPEECH_START_FAILED", e.message ?: "Failed to start speech recognition", e)
            }
        }
    }

    @ReactMethod
    fun stopListening(promise: Promise) {
        UiThreadUtil.runOnUiThread {
            try {
                speechRecognizer?.stopListening()
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("SPEECH_STOP_FAILED", e.message ?: "Failed to stop speech recognition", e)
            }
        }
    }

    @ReactMethod
    fun cancelListening(promise: Promise) {
        UiThreadUtil.runOnUiThread {
            try {
                speechRecognizer?.cancel()
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("SPEECH_CANCEL_FAILED", e.message ?: "Failed to cancel speech recognition", e)
            }
        }
    }

    @ReactMethod
    fun destroy(promise: Promise) {
        UiThreadUtil.runOnUiThread {
            try {
                session += 1 // ignore anything the destroyed recognizer still reports
                releaseRecognizer()
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("SPEECH_DESTROY_FAILED", e.message ?: "Failed to destroy speech recognizer", e)
            }
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN built-in Event Emitter Calls
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RN built-in Event Emitter Calls
    }
}

