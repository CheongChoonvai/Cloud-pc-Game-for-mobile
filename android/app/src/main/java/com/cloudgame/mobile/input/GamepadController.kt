package com.cloudgame.mobile.input

import android.os.Handler
import android.os.Looper
import android.util.Log
import org.java_websocket.client.WebSocketClient
import org.java_websocket.handshake.ServerHandshake
import org.json.JSONObject
import java.net.URI

/**
 * Handles gamepad input and sends to server via WebSocket
 */
class GamepadController(
    private val onConnectionChange: (Boolean) -> Unit
) {
    companion object {
        private const val TAG = "GamepadController"
    }
    
    private var websocket: WebSocketClient? = null
    private val handler = Handler(Looper.getMainLooper())
    private var isConnected = false
    
    fun connect(serverUrl: String) {
        try {
            websocket = object : WebSocketClient(URI(serverUrl)) {
                override fun onOpen(handshakedata: ServerHandshake?) {
                    Log.d(TAG, "WebSocket connected")
                    isConnected = true
                    handler.post { onConnectionChange(true) }
                }
                
                override fun onMessage(message: String?) {
                    Log.d(TAG, "Message: $message")
                }
                
                override fun onClose(code: Int, reason: String?, remote: Boolean) {
                    Log.d(TAG, "WebSocket closed: $reason")
                    isConnected = false
                    handler.post { onConnectionChange(false) }
                    
                    // Auto-reconnect after 3 seconds
                    handler.postDelayed({
                        if (!isConnected) {
                            connect(serverUrl)
                        }
                    }, 3000)
                }
                
                override fun onError(ex: Exception?) {
                    Log.e(TAG, "WebSocket error: ${ex?.message}")
                    isConnected = false
                    handler.post { onConnectionChange(false) }
                }
            }
            websocket?.connect()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to connect: ${e.message}")
        }
    }
    
    fun disconnect() {
        websocket?.close()
        websocket = null
    }
    
    fun sendLeftStick(x: Float, y: Float) {
        if (!isConnected) return
        
        val json = JSONObject().apply {
            put("type", "left_stick")
            put("x", x)
            put("y", y)
        }
        send(json)
    }
    
    fun sendRightStick(x: Float, y: Float) {
        if (!isConnected) return
        
        val json = JSONObject().apply {
            put("type", "right_stick")
            put("x", x)
            put("y", y)
        }
        send(json)
    }
    
    fun sendButton(button: String, pressed: Boolean) {
        if (!isConnected) return
        
        val json = JSONObject().apply {
            put("type", "button")
            put("button", button)
            put("pressed", pressed)
        }
        send(json)
        
        Log.d(TAG, "Button $button: ${if (pressed) "pressed" else "released"}")
    }
    
    fun sendDpad(direction: String, pressed: Boolean) {
        if (!isConnected) return
        
        val json = JSONObject().apply {
            put("type", "dpad")
            put("direction", direction)
            put("pressed", pressed)
        }
        send(json)
    }
    
    private fun send(json: JSONObject) {
        try {
            websocket?.send(json.toString())
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send: ${e.message}")
        }
    }
}
