package com.alibi.app

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager

/** JS bridge: the app pushes today's snapshot; the widget redraws (FR-PROD-010). */
class AlibiWidgetModule(private val context: ReactApplicationContext) :
    ReactContextBaseJavaModule(context) {

    override fun getName(): String = "AlibiWidget"

    @ReactMethod
    fun updateSnapshot(json: String, promise: Promise) {
        try {
            if (json.length > 8_192) {
                promise.reject("snapshot_too_large", "Widget snapshot is too large")
                return
            }
            TodayWidgetStore.saveSnapshot(context, json)
            TodayRingWidget.refreshAll(context)
            promise.resolve(true)
        } catch (error: Exception) {
            promise.reject("widget_update_failed", error)
        }
    }
}

class AlibiWidgetPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(AlibiWidgetModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
