package com.cloudgame.mobile.video

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Log
import kotlinx.coroutines.*
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Native MJPEG stream player for fast local network streaming
 * Parses multipart/x-mixed-replace JPEG stream directly
 */
class MjpegPlayer(
    private val onFrame: (Bitmap) -> Unit,
    private val onError: (String) -> Unit
) {
    companion object {
        private const val TAG = "MjpegPlayer"
        private const val BUFFER_SIZE = 65536 // 64KB buffer for fast reading
    }
    
    private var job: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    @Volatile private var isRunning = false
    
    fun start(url: String) {
        if (isRunning) return
        isRunning = true
        
        job = scope.launch {
            var connection: HttpURLConnection? = null
            try {
                Log.d(TAG, "Connecting to MJPEG stream: $url")
                
                val urlConnection = URL(url)
                connection = urlConnection.openConnection() as HttpURLConnection
                connection.apply {
                    connectTimeout = 5000
                    readTimeout = 0 // No timeout for streaming
                    doInput = true
                    useCaches = false
                    setRequestProperty("Connection", "keep-alive")
                }
                
                if (connection.responseCode != HttpURLConnection.HTTP_OK) {
                    withContext(Dispatchers.Main) {
                        onError("HTTP ${connection.responseCode}")
                    }
                    return@launch
                }
                
                Log.d(TAG, "Connected! Content-Type: ${connection.contentType}")
                
                val inputStream = BufferedInputStream(connection.inputStream, BUFFER_SIZE)
                val buffer = ByteArray(BUFFER_SIZE)
                val frameBuffer = ByteArrayOutputStream(BUFFER_SIZE)
                
                // State machine for parsing MJPEG
                var inFrame = false
                var prevByte = 0
                
                while (isRunning && isActive) {
                    val bytesRead = inputStream.read(buffer)
                    if (bytesRead == -1) break
                    
                    for (i in 0 until bytesRead) {
                        val b = buffer[i].toInt() and 0xFF
                        
                        if (inFrame) {
                            frameBuffer.write(b)
                            
                            // Check for JPEG end marker (FFD9)
                            if (prevByte == 0xFF && b == 0xD9) {
                                // Complete frame received
                                val frameData = frameBuffer.toByteArray()
                                frameBuffer.reset()
                                inFrame = false
                                
                                // Decode bitmap on IO thread
                                val bitmap = BitmapFactory.decodeByteArray(frameData, 0, frameData.size)
                                if (bitmap != null) {
                                    withContext(Dispatchers.Main) {
                                        if (isRunning) onFrame(bitmap)
                                    }
                                }
                            }
                        } else {
                            // Look for JPEG start marker (FFD8)
                            if (prevByte == 0xFF && b == 0xD8) {
                                frameBuffer.reset()
                                frameBuffer.write(0xFF)
                                frameBuffer.write(0xD8)
                                inFrame = true
                            }
                        }
                        
                        prevByte = b
                    }
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "Stream error: ${e.message}")
                if (isRunning) {
                    withContext(Dispatchers.Main) {
                        onError(e.message ?: "Unknown error")
                    }
                }
            } finally {
                connection?.disconnect()
                Log.d(TAG, "Stream disconnected")
            }
        }
    }
    
    fun stop() {
        isRunning = false
        job?.cancel()
        job = null
        Log.d(TAG, "Player stopped")
    }
    
    fun isPlaying(): Boolean = isRunning
}
