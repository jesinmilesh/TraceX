package com.tracex.investigation

import android.util.Log
import okhttp3.*
import org.json.JSONObject

class CommandWebSocketClient(private val serverUrl: String, private val onCommandReceived: (JSONObject) -> Unit) {
    private val client = OkHttpClient()
    private var webSocket: WebSocket? = null

    fun connect() {
        val request = Request.Builder().url(serverUrl).build()
        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.d("WebSocket", "Connected to C2/Backend Server")
                val initMsg = JSONObject().apply {
                    put("event", "client_connect")
                    put("device", android.os.Build.MODEL)
                }
                webSocket.send(initMsg.toString())
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val json = JSONObject(text)
                    onCommandReceived(json)
                } catch (e: Exception) {
                    Log.e("WebSocket", "Failed to parse incoming command", e)
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e("WebSocket", "Connection failure: ${t.message}")
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.d("WebSocket", "Connection closed: $reason")
            }
        })
    }

    fun sendTelemetry(payload: JSONObject) {
        webSocket?.send(payload.toString())
    }

    fun disconnect() {
        webSocket?.close(1000, "Client shutting down")
        client.dispatcher.executorService.shutdown()
    }
}