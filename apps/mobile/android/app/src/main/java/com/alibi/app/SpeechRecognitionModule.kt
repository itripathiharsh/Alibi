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

    private val recognitionListener = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {
            sendEvent("onSpeechStart", Arguments.createMap())
        }

        override fun onBeginningOfSpeech() {
            sendEvent("onSpeechBegan", Arguments.createMap())
        }

        override fun onRmsChanged(rmsdB: Float) {
            val map = Arguments.createMap().apply {
                putDouble("rms", rmsdB.toDouble())
            }
            sendEvent("onSpeechRmsChanged", map)
        }

        override fun onBufferReceived(buffer: ByteArray?) {}

        override fun onEndOfSpeech() {
            sendEvent("onSpeechEnd", Arguments.createMap())
        }

        override fun onError(error: Int) {
            val errorMessage = when (error) {
                SpeechRecognizer.ERROR_AUDIO -> "Audio recording error"
                SpeechRecognizer.ERROR_CLIENT -> "Client side error"
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission not granted"
                SpeechRecognizer.ERROR_NETWORK -> "Network error occurred during recognition"
                SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Network timed out"
                SpeechRecognizer.ERROR_NO_MATCH -> "No speech recognized"
                SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Speech recognition engine is busy"
                SpeechRecognizer.ERROR_SERVER -> "Recognition server error"
                SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No speech input detected"
                else -> "Speech recognition error code: $error"
            }
            val map = Arguments.createMap().apply {
                putInt("code", error)
                putString("message", errorMessage)
            }
            sendEvent("onSpeechError", map)
        }

        override fun onResults(results: Bundle?) {
            val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            val text = matches?.firstOrNull() ?: ""
            val map = Arguments.createMap().apply {
                putString("text", text)
                putBoolean("isFinal", true)
            }
            sendEvent("onSpeechResults", map)
            sendEvent("onSpeechEnd", Arguments.createMap())
        }

        override fun onPartialResults(partialResults: Bundle?) {
            val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            val text = matches?.firstOrNull() ?: ""
            if (text.isNotEmpty()) {
                val map = Arguments.createMap().apply {
                    putString("text", text)
                    putBoolean("isFinal", false)
                }
                sendEvent("onSpeechResults", map)
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

    @ReactMethod
    fun startListening(promise: Promise) {
        UiThreadUtil.runOnUiThread {
            try {
                if (speechRecognizer != null) {
                    try {
                        speechRecognizer?.cancel()
                        speechRecognizer?.destroy()
                    } catch (_: Exception) {}
                    speechRecognizer = null
                }

                if (!SpeechRecognizer.isRecognitionAvailable(reactContext)) {
                    promise.reject("SPEECH_UNAVAILABLE", "Speech recognition service is not available on this device")
                    return@runOnUiThread
                }

                speechRecognizer = SpeechRecognizer.createSpeechRecognizer(reactContext)
                speechRecognizer?.setRecognitionListener(recognitionListener)

                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
                    putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, reactContext.packageName)
                }

                speechRecognizer?.startListening(intent)
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
                speechRecognizer?.destroy()
                speechRecognizer = null
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

