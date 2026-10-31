package com.tracex.investigation

import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

object ApiClient {
    private val client = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(12, TimeUnit.SECONDS)
        .writeTimeout(12, TimeUnit.SECONDS)
        .build()

    private val gson = Gson()
    private val JSON = "application/json; charset=utf-8".toMediaType()

    fun normalizeUrl(rawUrl: String): String {
        val trimmed = rawUrl.trim().trimEnd('/')
        return if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
            trimmed
        } else {
            "https://$trimmed"
        }
    }

    data class RegistrationResult(
        val success: Boolean,
        val message: String,
        val assignedDeviceId: String? = null,
        val assignedDeviceNumber: String? = null,
        val assignedCaseId: String? = null
    )

    data class SessionResult(
        val success: Boolean,
        val sessionId: String,
        val message: String
    )

    suspend fun registerDevice(
        baseUrl: String,
        deviceId: String? = null,
        installationId: String,
        caseId: String,
        deviceModel: String,
        androidVersion: String
    ): RegistrationResult = withContext(Dispatchers.IO) {
        val cleanUrl = normalizeUrl(baseUrl)
        try {
            val payload = mapOf(
                "device_id" to (deviceId?.takeIf { it.isNotEmpty() } ?: "NEW"),
                "client_uuid" to installationId.trim(),
                "case_id" to caseId.trim(),
                "device_model" to deviceModel,
                "android_version" to androidVersion,
                "app_version" to "1.0.0"
            )
            val jsonBody = gson.toJson(payload)
            val request = Request.Builder()
                .url("$cleanUrl/api/v1/devices/register")
                .post(jsonBody.toRequestBody(JSON))
                .build()

            val response = client.newCall(request).execute()
            val code = response.code
            val body = response.body?.string() ?: ""

            if (response.isSuccessful) {
                var assignedId = deviceId
                var assignedNum: String? = null
                var assignedCase = caseId
                try {
                    val jsonObj = gson.fromJson(body, com.google.gson.JsonObject::class.java)
                    if (jsonObj.has("device_id")) assignedId = jsonObj.get("device_id").asString
                    if (jsonObj.has("device_number") && !jsonObj.get("device_number").isJsonNull) {
                        assignedNum = jsonObj.get("device_number").asString
                    }
                    if (jsonObj.has("case_id")) assignedCase = jsonObj.get("case_id").asString
                } catch (ignored: Exception) {}

                val numSuffix = if (!assignedNum.isNullOrEmpty()) " ($assignedNum)" else ""
                RegistrationResult(
                    success = true,
                    message = "Device registered as $assignedId$numSuffix",
                    assignedDeviceId = assignedId,
                    assignedDeviceNumber = assignedNum,
                    assignedCaseId = assignedCase
                )
            } else {
                RegistrationResult(false, "Server error HTTP $code: $body")
            }
        } catch (e: Exception) {
            RegistrationResult(false, "Cannot connect to server: ${e.message}")
        }
    }

    suspend fun startCollectionSession(
        baseUrl: String,
        deviceId: String,
        caseId: String,
        permissions: List<String>
    ): SessionResult = withContext(Dispatchers.IO) {
        val cleanUrl = normalizeUrl(baseUrl)
        try {
            val payload = mapOf(
                "case_id" to caseId.trim(),
                "device_id" to deviceId.trim(),
                "permissions_at_start" to permissions
            )
            val jsonBody = gson.toJson(payload)
            val request = Request.Builder()
                .url("$cleanUrl/api/v1/devices/${deviceId.trim()}/collection/start")
                .post(jsonBody.toRequestBody(JSON))
                .build()

            val response = client.newCall(request).execute()
            val body = response.body?.string() ?: ""
            if (response.isSuccessful) {
                val map = gson.fromJson(body, Map::class.java)
                val sessId = map["session_id"]?.toString() ?: "SESS-ACTIVE"
                SessionResult(true, sessId, "Collection session initiated")
            } else {
                SessionResult(false, "", "HTTP ${response.code}")
            }
        } catch (e: Exception) {
            SessionResult(false, "", "Connection failed: ${e.message}")
        }
    }

    suspend fun stopCollectionSession(
        baseUrl: String,
        deviceId: String,
        sessionId: String
    ): Boolean = withContext(Dispatchers.IO) {
        val cleanUrl = normalizeUrl(baseUrl)
        try {
            val request = Request.Builder()
                .url("$cleanUrl/api/v1/devices/${deviceId.trim()}/collection/stop?session_id=$sessionId")
                .post("{}".toRequestBody(JSON))
                .build()

            val response = client.newCall(request).execute()
            response.isSuccessful
        } catch (e: Exception) {
            false
        }
    }

    suspend fun sendTelemetry(
        baseUrl: String,
        event: TelemetryPayload
    ): Boolean = withContext(Dispatchers.IO) {
        val cleanUrl = normalizeUrl(baseUrl)
        try {
            val jsonBody = gson.toJson(event)
            val request = Request.Builder()
                .url("$cleanUrl/api/v1/telemetry/ingest")
                .post(jsonBody.toRequestBody(JSON))
                .build()

            val response = client.newCall(request).execute()
            response.isSuccessful
        } catch (e: Exception) {
            false
        }
    }

    fun computeSha256(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val bytes = digest.digest(input.toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { "%02x".format(it) }
    }
}

data class CallLogPayload(
    val phone_number: String,
    val call_type: String, // INCOMING, OUTGOING, MISSED
    val date: Long,
    val duration_seconds: Int,
    val call_event_id: String? = null
)

data class MessagePayload(
    val sender: String,
    val body: String,
    val date: Long,
    val msg_type: String, // INCOMING, OUTGOING
    val message_id: String? = null
)

data class TelemetryPayload(
    val case_id: String,
    val device_id: String,
    val session_id: String,
    val timestamp: Long,
    val latitude: Double,
    val longitude: Double,
    val event_type: String = "LOCATION_UPDATE",
    val accuracy: Float = 0f,
    val speed: Float = 0f,
    val altitude: Double = 0.0,
    val bearing: Float = 0f,
    val battery_level: Int = 100,
    val network_state: String = "WIFI",
    val call_logs: List<CallLogPayload> = emptyList(),
    val messages: List<MessagePayload> = emptyList()
)
