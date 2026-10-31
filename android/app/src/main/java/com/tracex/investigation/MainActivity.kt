package com.tracex.investigation

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.tracex.investigation.databinding.ActivityMainBinding
import kotlinx.coroutines.launch

/**
 * Project TraceX — Investigator Enrollment & Monitoring Interface
 * Displays explicit Case ID, permission center, and live diagnostics.
 * Server endpoint is configured securely via BuildConfig and not exposed in normal UI.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var deviceId: String
    private var serverUrl: String = BuildConfig.DEFAULT_SERVER_URL

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val locationGranted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true
        if (locationGranted) {
            Toast.makeText(this, "Location permission granted for authorized forensic collection", Toast.LENGTH_SHORT).show()
        } else {
            Toast.makeText(this, "TraceX needs location permission to record authorized device location during the active collection session.", Toast.LENGTH_LONG).show()
        }
        updatePermissionStatusUI()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        deviceId = DeviceIdentity.getDeviceId(this)
        binding.tvDeviceId.text = deviceId

        loadSavedPreferences()
        setupListeners()
        updatePermissionStatusUI()
        updateServiceUI()
    }

    override fun onResume() {
        super.onResume()
        updatePermissionStatusUI()
        updateServiceUI()

        // Attach live telemetry listener to ongoing foreground collection service
        LiveTelemetryService.telemetryListener = { payload, hash, queueSize, syncedCount ->
            runOnUiThread {
                if (payload.latitude != 0.0 || payload.longitude != 0.0) {
                    binding.tvLastLocation.text = "Last Coordinates: ${"%.6f".format(payload.latitude)}, ${"%.6f".format(payload.longitude)} (±${payload.accuracy}m)"
                    val speedKmH = (payload.speed * 3.6f)
                    binding.tvMovementState.text = if (speedKmH > 1.0f) "Movement: Moving (${"%.1f".format(speedKmH)} km/h)" else "Movement: Stationary"
                }
                if (hash.isNotEmpty()) {
                    binding.tvLastHash.text = "Evidence Hash: ${hash.take(16)}..."
                }
                binding.tvQueueCount.text = "Queue: $queueSize pending"
                binding.tvSyncedCount.text = "Synced: $syncedCount events"
                binding.tvSmsDiagnostic.text = LiveTelemetryService.messageCollectionDiagnostic
            }
        }
    }

    override fun onPause() {
        super.onPause()
        LiveTelemetryService.telemetryListener = null
    }

    private fun setupListeners() {
        // Update & Bind Case ID
        binding.btnUpdateCase.setOnClickListener {
            val caseId = binding.etCaseId.text.toString().trim()
            if (caseId.isEmpty()) {
                Toast.makeText(this, "Please enter an authorized Case ID", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            saveCasePreference(caseId)

            lifecycleScope.launch {
                binding.btnUpdateCase.isEnabled = false
                val result = ApiClient.registerDevice(
                    baseUrl = serverUrl,
                    deviceId = deviceId,
                    caseId = caseId,
                    deviceModel = DeviceIdentity.getDeviceModel(),
                    androidVersion = DeviceIdentity.getAndroidVersion()
                )
                binding.btnUpdateCase.isEnabled = true
                Toast.makeText(this@MainActivity, result.message, Toast.LENGTH_LONG).show()
            }
        }

        // Permission Center Review Button
        binding.btnGrantPermissions.setOnClickListener {
            requestRequiredPermissions()
        }

        // Start Authorized Collection
        binding.btnStartService.setOnClickListener {
            if (!hasLocationPermission()) {
                Toast.makeText(this, "TraceX needs location permission to record authorized device location during the active collection session.", Toast.LENGTH_LONG).show()
                requestRequiredPermissions()
                return@setOnClickListener
            }

            val caseId = binding.etCaseId.text.toString().trim().ifEmpty { "CASE-2026-001" }
            saveCasePreference(caseId)

            // Mark collection as actively authorized for restart persistence
            getSharedPreferences("tracex_device_prefs", Context.MODE_PRIVATE)
                .edit()
                .putBoolean("KEY_COLLECTION_ENABLED", true)
                .apply()

            val serviceIntent = Intent(this, LiveTelemetryService::class.java).apply {
                action = LiveTelemetryService.ACTION_START
                putExtra(LiveTelemetryService.EXTRA_CASE_ID, caseId)
                putExtra(LiveTelemetryService.EXTRA_SERVER_URL, serverUrl)
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent)
            } else {
                startService(serviceIntent)
            }

            Toast.makeText(this, "Authorized Collection Started • Foreground Service Active", Toast.LENGTH_SHORT).show()
            updateServiceUI()
        }

        // Stop Authorized Collection
        binding.btnStopService.setOnClickListener {
            getSharedPreferences("tracex_device_prefs", Context.MODE_PRIVATE)
                .edit()
                .putBoolean("KEY_COLLECTION_ENABLED", false)
                .apply()

            val serviceIntent = Intent(this, LiveTelemetryService::class.java).apply {
                action = LiveTelemetryService.ACTION_STOP
            }
            startService(serviceIntent)

            Toast.makeText(this, "Authorized Collection Halted", Toast.LENGTH_SHORT).show()
            updateServiceUI()
        }
    }

    private fun updatePermissionStatusUI() {
        val hasLoc = hasLocationPermission()
        val hasCall = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED
        val hasSms = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED
        val hasNotif = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }

        // Location
        if (hasLoc) {
            binding.tvPermLocation.text = "GRANTED"
            binding.tvPermLocation.setTextColor(ContextCompat.getColor(this, R.color.status_green))
        } else {
            binding.tvPermLocation.text = "REQUIRED"
            binding.tvPermLocation.setTextColor(ContextCompat.getColor(this, R.color.status_red))
        }

        // Notification
        if (hasNotif) {
            binding.tvPermNotification.text = "GRANTED"
            binding.tvPermNotification.setTextColor(ContextCompat.getColor(this, R.color.status_green))
        } else {
            binding.tvPermNotification.text = "REQUIRED"
            binding.tvPermNotification.setTextColor(ContextCompat.getColor(this, R.color.status_red))
        }

        // Call Log
        if (hasCall) {
            binding.tvPermCall.text = "GRANTED"
            binding.tvPermCall.setTextColor(ContextCompat.getColor(this, R.color.status_green))
        } else {
            binding.tvPermCall.text = "NOT GRANTED"
            binding.tvPermCall.setTextColor(ContextCompat.getColor(this, R.color.text_muted))
        }

        // SMS
        if (hasSms) {
            binding.tvPermSms.text = "GRANTED"
            binding.tvPermSms.setTextColor(ContextCompat.getColor(this, R.color.status_green))
        } else {
            binding.tvPermSms.text = "NOT GRANTED"
            binding.tvPermSms.setTextColor(ContextCompat.getColor(this, R.color.text_muted))
        }

        binding.tvSmsDiagnostic.text = LiveTelemetryService.messageCollectionDiagnostic
    }

    private fun requestRequiredPermissions() {
        val permissions = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
            Manifest.permission.READ_CALL_LOG,
            Manifest.permission.READ_SMS
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }

        permissionLauncher.launch(permissions.toTypedArray())

        val enabledListeners = NotificationManagerCompat.getEnabledListenerPackages(this)
        if (!enabledListeners.contains(packageName)) {
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
            startActivity(intent)
        }
    }

    private fun hasLocationPermission(): Boolean {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    }

    private fun updateServiceUI() {
        val running = LiveTelemetryService.isRunning
        if (running) {
            binding.tvCollectionStatus.text = "COLLECTION ACTIVE"
            binding.tvCollectionStatus.setTextColor(ContextCompat.getColor(this, R.color.status_green))
            binding.btnStartService.isEnabled = false
            binding.btnStopService.isEnabled = true
        } else {
            binding.tvCollectionStatus.text = "COLLECTION STOPPED"
            binding.tvCollectionStatus.setTextColor(ContextCompat.getColor(this, R.color.status_red))
            binding.btnStartService.isEnabled = true
            binding.btnStopService.isEnabled = false
        }
    }

    private fun saveCasePreference(caseId: String) {
        getSharedPreferences("tracex_device_prefs", Context.MODE_PRIVATE)
            .edit()
            .putString("KEY_CASE_ID", caseId)
            .apply()
    }

    private fun loadSavedPreferences() {
        val prefs = getSharedPreferences("tracex_device_prefs", Context.MODE_PRIVATE)
        val caseId = prefs.getString("KEY_CASE_ID", "CASE-2026-001") ?: "CASE-2026-001"
        binding.etCaseId.setText(caseId)
        val customServerUrl = prefs.getString("KEY_SERVER_URL", null)
        if (!customServerUrl.isNullOrBlank()) {
            serverUrl = ApiClient.normalizeUrl(customServerUrl)
        }
    }
}
