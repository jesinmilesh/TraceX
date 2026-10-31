package com.tracex.investigation

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.provider.CallLog
import android.provider.Telephony
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.UUID

/**
 * Project TraceX — Authorized Foreground Telemetry & Evidence Collection Service
 * Android 16 compatible with visible truthful notification, background continuity,
 * incremental call log sync, authorized message collection, and offline queueing.
 */
class LiveTelemetryService : Service() {

    companion object {
        const val TAG = "TraceXService"
        const val ACTION_START = "com.tracex.action.START_COLLECTION"
        const val ACTION_STOP = "com.tracex.action.STOP_COLLECTION"

        const val EXTRA_CASE_ID = "extra_case_id"
        const val EXTRA_SERVER_URL = "extra_server_url"

        const val NOTIFICATION_CHANNEL_ID = "tracex_collection_channel"
        const val NOTIFICATION_ID = 20261

        @Volatile
        var isRunning: Boolean = false
            private set

        @Volatile
        var currentCaseId: String = "CASE-2026-001"
            private set

        @Volatile
        var messageCollectionDiagnostic: String = "Standby"
            private set

        // Listener for active UI activity updates
        var telemetryListener: ((payload: TelemetryPayload, hash: String, queueSize: Int, syncedCount: Int) -> Unit)? = null
    }

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var locationCallback: LocationCallback
    private lateinit var queueManager: OfflineQueueManager

    private var deviceId: String = ""
    private var serverUrl: String = ""
    private var activeSessionId: String = ""
    private var wakeLock: PowerManager.WakeLock? = null

    private var syncedEventsCount: Int = 0
    private var lastCallDateChecked: Long = 0L
    private var lastSmsDateChecked: Long = 0L

    override fun onCreate() {
        super.onCreate()
        deviceId = DeviceIdentity.getDeviceId(this) ?: ("DEV-" + DeviceIdentity.getInstallationId(this).takeLast(6))
        queueManager = OfflineQueueManager(this)
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)

        createNotificationChannel()
        initLocationCallback()

        // Restore timestamp tracking for incremental sync
        val prefs = getSharedPreferences("tracex_device_prefs", Context.MODE_PRIVATE)
        lastCallDateChecked = prefs.getLong("KEY_LAST_CALL_SYNC", System.currentTimeMillis() - 86400000L) // last 24h on first run
        lastSmsDateChecked = prefs.getLong("KEY_LAST_SMS_SYNC", System.currentTimeMillis() - 86400000L)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START

        when (action) {
            ACTION_STOP -> {
                Log.i(TAG, "Stop collection requested by user or action intent")
                stopCollectionSession()
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_START -> {
                val intentCaseId = intent?.getStringExtra(EXTRA_CASE_ID)?.trim()
                val intentServerUrl = intent?.getStringExtra(EXTRA_SERVER_URL)?.trim()

                val prefs = getSharedPreferences("tracex_device_prefs", Context.MODE_PRIVATE)
                currentCaseId = if (!intentCaseId.isNullOrEmpty()) intentCaseId else prefs.getString("KEY_CASE_ID", "CASE-2026-001") ?: "CASE-2026-001"
                serverUrl = if (!intentServerUrl.isNullOrEmpty()) intentServerUrl else prefs.getString("KEY_SERVER_URL", BuildConfig.DEFAULT_SERVER_URL) ?: BuildConfig.DEFAULT_SERVER_URL

                if (!isRunning) {
                    startForegroundCollection()
                } else {
                    updateNotification()
                }
            }
        }

        return START_STICKY
    }

    private fun startForegroundCollection() {
        isRunning = true
        activeSessionId = "SESS-${UUID.randomUUID().toString().take(8).uppercase()}"

        // Foreground Service Notification (Truthful, non-disguised)
        val notification = buildForegroundNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION or ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        // Notify backend of session start asynchronously
        serviceScope.launch {
            val grantedPermissions = mutableListOf<String>()
            if (ContextCompat.checkSelfPermission(this@LiveTelemetryService, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                grantedPermissions.add("ACCESS_FINE_LOCATION")
            }
            if (ContextCompat.checkSelfPermission(this@LiveTelemetryService, Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED) {
                grantedPermissions.add("READ_CALL_LOG")
            }
            if (ContextCompat.checkSelfPermission(this@LiveTelemetryService, Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED) {
                grantedPermissions.add("READ_SMS")
            }

            val sessionRes = ApiClient.startCollectionSession(serverUrl, deviceId, currentCaseId, grantedPermissions)
            if (sessionRes.success && sessionRes.sessionId.isNotEmpty()) {
                activeSessionId = sessionRes.sessionId
            }
        }

        startLocationTracking()
        startPeriodicSyncLoop()

        // Acquire partial wake lock for reliability across screen sleep
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "TraceX::TelemetryWakeLock")
        wakeLock?.acquire(30 * 60 * 1000L) // 30 min max safety guard
    }

    private fun initLocationCallback() {
        locationCallback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                val loc = result.lastLocation ?: return
                serviceScope.launch {
                    processLocationUpdate(loc)
                }
            }
        }
    }

    private fun startLocationTracking() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "Location permission not granted. Cannot track coordinates.")
            return
        }

        val locationRequest = LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, 15000L)
            .setMinUpdateIntervalMillis(8000L)
            .setMinUpdateDistanceMeters(3.0f) // Only trigger if moved at least 3m to conserve battery
            .build()

        try {
            fusedLocationClient.requestLocationUpdates(locationRequest, locationCallback, Looper.getMainLooper())
        } catch (e: SecurityException) {
            Log.e(TAG, "SecurityException requesting location updates: ${e.message}")
        }
    }

    private suspend fun processLocationUpdate(location: Location) {
        val now = System.currentTimeMillis()

        // 1. Collect Incremental Call Logs
        val callLogs = collectIncrementalCallLogs()

        // 2. Collect Incremental SMS Messages
        val messages = collectIncrementalMessages()

        // 3. Assemble Telemetry Payload
        val payload = TelemetryPayload(
            case_id = currentCaseId,
            device_id = deviceId,
            session_id = activeSessionId,
            timestamp = now,
            latitude = location.latitude,
            longitude = location.longitude,
            event_type = "LOCATION_UPDATE",
            accuracy = location.accuracy,
            speed = if (location.hasSpeed()) location.speed else 0.0f,
            altitude = if (location.hasAltitude()) location.altitude else 0.0,
            bearing = if (location.hasBearing()) location.bearing else 0.0f,
            battery_level = getBatteryLevel(),
            network_state = getNetworkType(),
            call_logs = callLogs,
            messages = messages
        )

        // 4. Compute cryptographic evidence hash
        val hashInput = "${payload.case_id}:${payload.device_id}:${payload.session_id}:${payload.timestamp}:${payload.latitude}:${payload.longitude}"
        val evidenceHash = ApiClient.computeSha256(hashInput)

        // 5. Send or Queue
        val uploaded = ApiClient.sendTelemetry(serverUrl, payload)
        if (uploaded) {
            syncedEventsCount++
            flushOfflineQueue()
        } else {
            queueManager.enqueue(payload)
        }

        // Notify active UI
        telemetryListener?.invoke(payload, evidenceHash, queueManager.getCount(), syncedEventsCount)
    }

    private fun collectIncrementalCallLogs(): List<CallLogPayload> {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) {
            return emptyList()
        }

        val results = mutableListOf<CallLogPayload>()
        var highestTimestamp = lastCallDateChecked

        try {
            val cursor = contentResolver.query(
                CallLog.Calls.CONTENT_URI,
                arrayOf(CallLog.Calls.NUMBER, CallLog.Calls.TYPE, CallLog.Calls.DATE, CallLog.Calls.DURATION),
                "${CallLog.Calls.DATE} > ?",
                arrayOf(lastCallDateChecked.toString()),
                "${CallLog.Calls.DATE} ASC"
            )

            cursor?.use { c ->
                val numIdx = c.getColumnIndex(CallLog.Calls.NUMBER)
                val typeIdx = c.getColumnIndex(CallLog.Calls.TYPE)
                val dateIdx = c.getColumnIndex(CallLog.Calls.DATE)
                val durIdx = c.getColumnIndex(CallLog.Calls.DURATION)

                while (c.moveToNext()) {
                    val number = if (numIdx >= 0) c.getString(numIdx) ?: "UNKNOWN" else "UNKNOWN"
                    val typeCode = if (typeIdx >= 0) c.getInt(typeIdx) else CallLog.Calls.INCOMING_TYPE
                    val date = if (dateIdx >= 0) c.getLong(dateIdx) else System.currentTimeMillis()
                    val duration = if (durIdx >= 0) c.getInt(durIdx) else 0

                    val typeStr = when (typeCode) {
                        CallLog.Calls.INCOMING_TYPE -> "INCOMING"
                        CallLog.Calls.OUTGOING_TYPE -> "OUTGOING"
                        CallLog.Calls.MISSED_TYPE -> "MISSED"
                        CallLog.Calls.REJECTED_TYPE -> "REJECTED"
                        else -> "CALL"
                    }

                    val callEventId = "CAL-" + ApiClient.computeSha256("$deviceId:$number:$date").take(12).uppercase()

                    results.add(
                        CallLogPayload(
                            phone_number = number,
                            call_type = typeStr,
                            date = date,
                            duration_seconds = duration,
                            call_event_id = callEventId
                        )
                    )

                    if (date > highestTimestamp) {
                        highestTimestamp = date
                    }
                }
            }

            if (highestTimestamp > lastCallDateChecked) {
                lastCallDateChecked = highestTimestamp
                getSharedPreferences("tracex_device_prefs", Context.MODE_PRIVATE)
                    .edit()
                    .putLong("KEY_LAST_CALL_SYNC", lastCallDateChecked)
                    .apply()
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error querying call logs: ${e.message}")
        }

        return results
    }

    private fun collectIncrementalMessages(): List<MessagePayload> {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
            messageCollectionDiagnostic = "Permission Required (READ_SMS)"
            return emptyList()
        }

        val results = mutableListOf<MessagePayload>()
        var highestTimestamp = lastSmsDateChecked

        try {
            val cursor = contentResolver.query(
                Telephony.Sms.CONTENT_URI,
                arrayOf(Telephony.Sms._ID, Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE, Telephony.Sms.TYPE),
                "${Telephony.Sms.DATE} > ?",
                arrayOf(lastSmsDateChecked.toString()),
                "${Telephony.Sms.DATE} ASC"
            )

            if (cursor == null) {
                messageCollectionDiagnostic = "Message collection unavailable on this device/configuration"
                return emptyList()
            }

            cursor.use { c ->
                val addrIdx = c.getColumnIndex(Telephony.Sms.ADDRESS)
                val bodyIdx = c.getColumnIndex(Telephony.Sms.BODY)
                val dateIdx = c.getColumnIndex(Telephony.Sms.DATE)
                val typeIdx = c.getColumnIndex(Telephony.Sms.TYPE)

                while (c.moveToNext()) {
                    val address = if (addrIdx >= 0) c.getString(addrIdx) ?: "UNKNOWN" else "UNKNOWN"
                    val body = if (bodyIdx >= 0) c.getString(bodyIdx) ?: "" else ""
                    val date = if (dateIdx >= 0) c.getLong(dateIdx) else System.currentTimeMillis()
                    val typeCode = if (typeIdx >= 0) c.getInt(typeIdx) else Telephony.Sms.MESSAGE_TYPE_INBOX

                    val typeStr = if (typeCode == Telephony.Sms.MESSAGE_TYPE_SENT) "OUTGOING" else "INCOMING"
                    val messageId = "MSG-" + ApiClient.computeSha256("$deviceId:$address:$date").take(12).uppercase()

                    results.add(
                        MessagePayload(
                            sender = address,
                            body = body,
                            date = date,
                            msg_type = typeStr,
                            message_id = messageId
                        )
                    )

                    if (date > highestTimestamp) {
                        highestTimestamp = date
                    }
                }
            }

            messageCollectionDiagnostic = "Active Synchronization"

            if (highestTimestamp > lastSmsDateChecked) {
                lastSmsDateChecked = highestTimestamp
                getSharedPreferences("tracex_device_prefs", Context.MODE_PRIVATE)
                    .edit()
                    .putLong("KEY_LAST_SMS_SYNC", lastSmsDateChecked)
                    .apply()
            }
        } catch (e: SecurityException) {
            // Android 16 or device policy restriction
            messageCollectionDiagnostic = "Message collection unavailable on this device/configuration (Security Policy)"
            Log.w(TAG, "SMS provider restricted: ${e.message}")
        } catch (e: Exception) {
            messageCollectionDiagnostic = "SMS Query Error: ${e.message}"
            Log.w(TAG, "Error querying SMS: ${e.message}")
        }

        return results
    }

    private suspend fun flushOfflineQueue() {
        val queued = queueManager.getAll()
        if (queued.isEmpty()) return

        var sentCount = 0
        for (event in queued) {
            val ok = ApiClient.sendTelemetry(serverUrl, event)
            if (ok) {
                sentCount++
                syncedEventsCount++
            } else {
                break
            }
        }
        if (sentCount > 0) {
            queueManager.removeFirstN(sentCount)
        }
    }

    private fun startPeriodicSyncLoop() {
        serviceScope.launch {
            while (isActive && isRunning) {
                delay(20000L) // Check every 20 seconds
                if (queueManager.getCount() > 0 && isNetworkAvailable()) {
                    flushOfflineQueue()
                    telemetryListener?.invoke(
                        TelemetryPayload(currentCaseId, deviceId, activeSessionId, System.currentTimeMillis(), 0.0, 0.0),
                        "",
                        queueManager.getCount(),
                        syncedEventsCount
                    )
                }
            }
        }
    }

    private fun stopCollectionSession() {
        isRunning = false
        try {
            fusedLocationClient.removeLocationUpdates(locationCallback)
        } catch (e: Exception) {}

        serviceScope.launch {
            if (activeSessionId.isNotEmpty()) {
                ApiClient.stopCollectionSession(serverUrl, deviceId, activeSessionId)
            }
        }

        if (wakeLock?.isHeld == true) {
            wakeLock?.release()
        }

        stopForeground(STOP_FOREGROUND_REMOVE)
    }

    override fun onDestroy() {
        stopCollectionSession()
        serviceScope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ----------------- Notification & Helpers -----------------
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "TraceX Authorized Collection",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows visible notification while authorized forensic telemetry is actively recorded."
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildForegroundNotification(): Notification {
        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val contentPendingIntent = PendingIntent.getActivity(
            this,
            0,
            openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val stopIntent = Intent(this, LiveTelemetryService::class.java).apply {
            action = ACTION_STOP
        }
        val stopPendingIntent = PendingIntent.getService(
            this,
            1,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("TraceX")
            .setContentText("Authorized collection active • Case: $currentCaseId")
            .setSubText("Forensic Telemetry")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(contentPendingIntent)
            .setOngoing(true)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop Collection", stopPendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    private fun updateNotification() {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, buildForegroundNotification())
    }

    private fun getBatteryLevel(): Int {
        val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        return bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
    }

    private fun getNetworkType(): String {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val net = cm.activeNetwork ?: return "OFFLINE"
        val caps = cm.getNetworkCapabilities(net) ?: return "OFFLINE"
        return when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WIFI"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "CELLULAR"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ETHERNET"
            else -> "CONNECTED"
        }
    }

    private fun isNetworkAvailable(): Boolean {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val net = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(net) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }
}

// Subclass for architectural standard specified in Section 3
typealias TraceXCollectionService = LiveTelemetryService