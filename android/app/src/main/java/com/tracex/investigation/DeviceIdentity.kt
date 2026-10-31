package com.tracex.investigation

import android.content.Context
import android.os.Build
import java.util.UUID

object DeviceIdentity {
    private const val PREFS_NAME = "tracex_device_prefs"
    private const val KEY_INSTALLATION_ID = "tracex_installation_id"
    private const val KEY_DEVICE_ID = "tracex_device_id"

    /**
     * Unique, persistent installation identifier generated upon first install.
     * Differentiates physical installations and prevents duplicate counter consumption on reconnects.
     */
    fun getInstallationId(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        var installId = prefs.getString(KEY_INSTALLATION_ID, null)
        if (installId == null) {
            installId = "INST-" + UUID.randomUUID().toString().replace("-", "").take(12).uppercase()
            prefs.edit().putString(KEY_INSTALLATION_ID, installId).apply()
        }
        return installId
    }

    /**
     * Server-assigned atomic Device ID (e.g. DEV-001, DEV-002).
     * Returns null if device has not yet registered with the FastAPI backend.
     */
    fun getDeviceId(context: Context): String? {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getString(KEY_DEVICE_ID, null)
    }

    /**
     * Store the server-assigned atomic sequential Device ID received from backend.
     */
    fun setDeviceId(context: Context, deviceId: String) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(KEY_DEVICE_ID, deviceId).apply()
    }

    fun getDeviceModel(): String {
        val manufacturer = Build.MANUFACTURER.replaceFirstChar { it.uppercase() }
        val model = Build.MODEL
        return if (model.startsWith(manufacturer)) model else "$manufacturer $model"
    }

    fun getAndroidVersion(): String {
        return Build.VERSION.RELEASE ?: "Unknown"
    }
}
