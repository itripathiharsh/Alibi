package com.alibi.app

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.widget.Toast
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.ViewManager
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * In-app updates for the sideloaded APK (FR-PROD-013, ADR-031).
 *
 * Android never lets a sideloaded app replace itself silently: the system always shows its
 * own install confirmation. This module downloads the new APK, checks its SHA-256 against
 * the release manifest, and hands it to the system installer (PackageInstaller session, so
 * no FileProvider is needed). Android also refuses an APK signed with a different key.
 */
class AppUpdateModule(private val context: ReactApplicationContext) :
    ReactContextBaseJavaModule(context) {

    override fun getName(): String = "AlibiUpdater"

    @ReactMethod
    fun getInstalledVersion(promise: Promise) {
        try {
            val info = context.packageManager.getPackageInfo(context.packageName, 0)
            val code = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode
            else @Suppress("DEPRECATION") info.versionCode.toLong()
            promise.resolve(Arguments.createMap().apply {
                putDouble("versionCode", code.toDouble())
                putString("versionName", info.versionName ?: "")
            })
        } catch (error: Exception) {
            promise.reject("version_unavailable", error)
        }
    }

    @ReactMethod
    fun canInstallUpdates(promise: Promise) {
        promise.resolve(
            Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.packageManager.canRequestPackageInstalls(),
        )
    }

    /** Opens Android's "Install unknown apps" switch for ALIBI. */
    @ReactMethod
    fun openInstallPermissionSettings() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }

    @ReactMethod
    fun downloadAndInstall(url: String, expectedSha256: String, promise: Promise) {
        if (!url.startsWith("https://")) {
            promise.reject("insecure_url", "Updates are only downloaded over HTTPS")
            return
        }
        Thread {
            try {
                val file = download(url)
                val actual = sha256(file)
                if (!actual.equals(expectedSha256.trim(), ignoreCase = true)) {
                    file.delete()
                    promise.reject("checksum_mismatch", "The downloaded update did not match the release checksum")
                    return@Thread
                }
                install(file)
                promise.resolve(true)
            } catch (error: Exception) {
                promise.reject("update_failed", error.message ?: "Update failed", error)
            }
        }.start()
    }

    private fun emitProgress(done: Long, total: Long) {
        try {
            context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("AlibiUpdaterProgress", Arguments.createMap().apply {
                    putDouble("done", done.toDouble())
                    putDouble("total", total.toDouble())
                })
        } catch (_: Exception) {
            // Progress is cosmetic.
        }
    }

    private fun download(url: String): File {
        val dir = File(context.cacheDir, "updates").apply { mkdirs() }
        val target = File(dir, "alibi-update.apk")
        val part = File(dir, "alibi-update.apk.part")
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 20_000
            readTimeout = 60_000
            instanceFollowRedirects = true
        }
        try {
            if (connection.responseCode !in 200..299) throw IllegalStateException("Download failed (HTTP ${connection.responseCode})")
            val total = connection.contentLengthLong
            var done = 0L
            var lastEmit = 0L
            connection.inputStream.use { input ->
                part.outputStream().use { output ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        output.write(buffer, 0, read)
                        done += read
                        if (done - lastEmit > 512 * 1024) {
                            lastEmit = done
                            emitProgress(done, total)
                        }
                    }
                }
            }
            emitProgress(done, total)
        } finally {
            connection.disconnect()
        }
        target.delete()
        if (!part.renameTo(target)) throw IllegalStateException("Could not save the update")
        return target
    }

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private fun install(file: File) {
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(context.packageName)
        }
        val sessionId = installer.createSession(params)
        installer.openSession(sessionId).use { session ->
            session.openWrite("alibi.apk", 0, file.length()).use { output ->
                file.inputStream().use { it.copyTo(output) }
                session.fsync(output)
            }
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
            val callback = PendingIntent.getBroadcast(
                context,
                sessionId,
                Intent(context, UpdateInstallReceiver::class.java),
                flags,
            )
            session.commit(callback.intentSender)
        }
    }
}

/** Receives the installer's status; shows Android's confirmation screen when it asks for it. */
class UpdateInstallReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT) ?: return
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(confirm)
            }
            PackageInstaller.STATUS_SUCCESS -> Unit // the app restarts as the new version
            else -> {
                val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "Update was not installed"
                Toast.makeText(context, message, Toast.LENGTH_LONG).show()
            }
        }
    }
}

class AppUpdatePackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(AppUpdateModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
