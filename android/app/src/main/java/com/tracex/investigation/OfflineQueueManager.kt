package com.tracex.investigation

import android.content.Context
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.io.File

class OfflineQueueManager(private val context: Context) {
    private val gson = Gson()
    private val queueFile = File(context.filesDir, "tracex_telemetry_queue.json")
    private val lock = Any()

    fun enqueue(event: TelemetryPayload) {
        synchronized(lock) {
            val list = loadQueue().toMutableList()
            if (list.size >= 100) {
                list.removeAt(0)
            }
            list.add(event)
            saveQueue(list)
        }
    }

    fun getAll(): List<TelemetryPayload> {
        synchronized(lock) {
            return loadQueue()
        }
    }

    fun removeFirstN(count: Int) {
        synchronized(lock) {
            val list = loadQueue().toMutableList()
            val toRemove = count.coerceAtMost(list.size)
            for (i in 0 until toRemove) {
                if (list.isNotEmpty()) list.removeAt(0)
            }
            saveQueue(list)
        }
    }

    fun getCount(): Int {
        synchronized(lock) {
            return loadQueue().size
        }
    }

    private fun loadQueue(): List<TelemetryPayload> {
        if (!queueFile.exists()) return emptyList()
        return try {
            val json = queueFile.readText()
            val type = object : TypeToken<List<TelemetryPayload>>() {}.type
            gson.fromJson(json, type) ?: emptyList()
        } catch (e: Exception) {
            emptyList()
        }
    }

    private fun saveQueue(list: List<TelemetryPayload>) {
        try {
            val json = gson.toJson(list)
            queueFile.writeText(json)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
