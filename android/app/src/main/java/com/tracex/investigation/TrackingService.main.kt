package com.tracex.investigation

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.os.Handler
import android.os.Looper
import android.util.Log
import org.json.JSONObject

class TrackingService : Service() {
    private lateinit var wsClient: CommandWebSocketClient
    private val handler = Handler(Looper.getMainLooper())
    private var syncIntervalMillis: Long = 60000 // Default 60 seconds

    private val periodicRunnable = object : Runnable {
        override fun run() {
            collectAndTransmitData()
            handler.postDelayed(this, syncIntervalMillis)
        }
    }

    override fun onCreate() {
        super.onCreate()

        wsClient = CommandWebSocketClient("ws://10.0.2.2:8000/ws") { commandJson ->
            handleServerCommand(commandJson)
        }
        wsClient.connect()

        handler.post(periodicRunnable)
    }

    private fun collectAndTransmitData() {
        val telemetry = JSONObject().apply {
            put("type", "telemetry_sync")
            put("timestamp", System.currentTimeMillis())
            put("status", "active")
        }
        wsClient.sendTelemetry(telemetry)
        Log.d("TrackingService", "Telemetry dispatched to server.")
    }

    private fun handleServerCommand(command: JSONObject) {
        val action = command.optString("action")
        when (action) {
            "update_interval" -> {
                syncIntervalMillis = command.optLong("interval", 60) * 1000
                handler.removeCallbacks(periodicRunnable)
                handler.post(periodicRunnable)
                Log.d("TrackingService", "Interval updated to ${syncIntervalMillis}ms")
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(periodicRunnable)
        wsClient.disconnect()
    }
}