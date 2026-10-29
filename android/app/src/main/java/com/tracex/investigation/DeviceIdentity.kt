package com.tracex.investigation

import android.content.Context
import android.os.Build
import java.util.UUID

object DeviceIdentity {
    private const val PREFS_NAME = "tracex_device_prefs"
    private const val KEY_DEVICE_ID = "tracex_device_id"

    fun getDeviceId(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        var deviceId = prefs.getString(KEY_DEVICE_ID, null)

        if (deviceId == null) {
            val randomSegment = UUID.randomUUID().toString().replace("-", "").take(8).uppercase()
            deviceId = "DEV-$randomSegment"
            prefs.edit().putString(KEY_DEVICE_ID, deviceId).apply()
        }
        return deviceId
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
