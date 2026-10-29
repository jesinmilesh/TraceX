package com.tracex.investigation

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Recovers authorized collection session after device reboot using Android-supported foreground service.
 * Resumes collection ONLY if an authorized session was actively enabled prior to reboot.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == "android.intent.action.QUICKBOOT_POWERON"
        ) {
            val prefs = context.getSharedPreferences("tracex_device_prefs", Context.MODE_PRIVATE)
            val isEnabled = prefs.getBoolean("KEY_COLLECTION_ENABLED", false)

            if (isEnabled) {
                val caseId = prefs.getString("KEY_CASE_ID", "CASE-2026-001") ?: "CASE-2026-001"
                val serverUrl = prefs.getString("KEY_SERVER_URL", BuildConfig.DEFAULT_SERVER_URL) ?: BuildConfig.DEFAULT_SERVER_URL

                val serviceIntent = Intent(context, LiveTelemetryService::class.java).apply {
                    action = LiveTelemetryService.ACTION_START
                    putExtra(LiveTelemetryService.EXTRA_CASE_ID, caseId)
                    putExtra(LiveTelemetryService.EXTRA_SERVER_URL, serverUrl)
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }
            }
        }
    }
}
