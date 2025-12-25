package com.cloudgame.mobile.webrtc

import android.content.Context
import android.util.Log
import kotlinx.coroutines.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import org.webrtc.*
import java.io.IOException

/**
 * WebRTC client for receiving video stream from PC
 */
class WebRTCClient(
    private val context: Context,
    private val serverUrl: String,
    private val onConnected: () -> Unit,
    private val onDisconnected: () -> Unit,
    private val onVideoTrack: (VideoTrack) -> Unit
) {
    companion object {
        private const val TAG = "WebRTCClient"
    }
    
    private val httpClient = OkHttpClient()
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    private var peerConnectionFactory: PeerConnectionFactory? = null
    private var peerConnection: PeerConnection? = null
    private var eglBase: EglBase? = null
    
    init {
        initWebRTC()
    }
    
    private fun initWebRTC() {
        try {
            // Initialize WebRTC
            val options = PeerConnectionFactory.InitializationOptions.builder(context)
                .setEnableInternalTracer(false)
                .createInitializationOptions()
            PeerConnectionFactory.initialize(options)
            
            // Create EGL context
            eglBase = EglBase.create()
            
            // Create PeerConnectionFactory
            val factoryOptions = PeerConnectionFactory.Options()
            peerConnectionFactory = PeerConnectionFactory.builder()
                .setOptions(factoryOptions)
                .setVideoDecoderFactory(DefaultVideoDecoderFactory(eglBase?.eglBaseContext))
                .setVideoEncoderFactory(DefaultVideoEncoderFactory(eglBase?.eglBaseContext, true, true))
                .createPeerConnectionFactory()
            
            Log.d(TAG, "WebRTC initialized successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize WebRTC: ${e.message}")
        }
    }
    
    fun initSurfaceViewRenderer(renderer: SurfaceViewRenderer) {
        try {
            renderer.init(eglBase?.eglBaseContext, null)
            renderer.setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FIT)
            renderer.setEnableHardwareScaler(true)
            Log.d(TAG, "SurfaceViewRenderer initialized")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to init renderer: ${e.message}")
        }
    }
    
    fun connect() {
        Log.d(TAG, "Connecting to $serverUrl")
        
        scope.launch {
            try {
                // Create PeerConnection
                val iceServers = listOf(
                    PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer()
                )
                val rtcConfig = PeerConnection.RTCConfiguration(iceServers)
                
                val observer = object : PeerConnection.Observer {
                    override fun onIceCandidate(candidate: IceCandidate?) {
                        Log.d(TAG, "ICE candidate: ${candidate?.sdp}")
                    }
                    
                    override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) {}
                    
                    override fun onSignalingChange(state: PeerConnection.SignalingState?) {
                        Log.d(TAG, "Signaling state: $state")
                    }
                    
                    override fun onIceConnectionChange(state: PeerConnection.IceConnectionState?) {
                        Log.d(TAG, "ICE connection state: $state")
                        when (state) {
                            PeerConnection.IceConnectionState.CONNECTED -> {
                                scope.launch(Dispatchers.Main) { onConnected() }
                            }
                            PeerConnection.IceConnectionState.DISCONNECTED,
                            PeerConnection.IceConnectionState.FAILED -> {
                                scope.launch(Dispatchers.Main) { onDisconnected() }
                            }
                            else -> {}
                        }
                    }
                    
                    override fun onIceConnectionReceivingChange(receiving: Boolean) {}
                    
                    override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) {
                        Log.d(TAG, "ICE gathering state: $state")
                    }
                    
                    override fun onAddStream(stream: MediaStream?) {
                        Log.d(TAG, "Stream added: ${stream?.id}")
                        stream?.videoTracks?.firstOrNull()?.let { track ->
                            Log.d(TAG, "Video track received!")
                            scope.launch(Dispatchers.Main) {
                                onVideoTrack(track)
                            }
                        }
                    }
                    
                    override fun onRemoveStream(stream: MediaStream?) {}
                    override fun onDataChannel(channel: DataChannel?) {}
                    override fun onRenegotiationNeeded() {}
                    override fun onAddTrack(receiver: RtpReceiver?, streams: Array<out MediaStream>?) {
                        Log.d(TAG, "Track added: ${receiver?.track()?.kind()}")
                        val track = receiver?.track()
                        if (track is VideoTrack) {
                            Log.d(TAG, "Video track received via onAddTrack!")
                            scope.launch(Dispatchers.Main) {
                                onVideoTrack(track)
                            }
                        }
                    }
                }
                
                peerConnection = peerConnectionFactory?.createPeerConnection(rtcConfig, observer)
                
                // Add receive-only video transceiver
                peerConnection?.addTransceiver(
                    MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO,
                    RtpTransceiver.RtpTransceiverInit(RtpTransceiver.RtpTransceiverDirection.RECV_ONLY)
                )
                
                // Create offer
                val mediaConstraints = MediaConstraints().apply {
                    mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "true"))
                    mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "false"))
                }
                
                peerConnection?.createOffer(object : SdpObserver {
                    override fun onCreateSuccess(sdp: SessionDescription?) {
                        Log.d(TAG, "Offer created")
                        peerConnection?.setLocalDescription(object : SdpObserver {
                            override fun onCreateSuccess(p0: SessionDescription?) {}
                            override fun onSetSuccess() {
                                Log.d(TAG, "Local description set")
                                // Send offer to server
                                sendOfferToServer(sdp)
                            }
                            override fun onCreateFailure(error: String?) {}
                            override fun onSetFailure(error: String?) {
                                Log.e(TAG, "Set local description failed: $error")
                            }
                        }, sdp)
                    }
                    
                    override fun onSetSuccess() {}
                    override fun onCreateFailure(error: String?) {
                        Log.e(TAG, "Create offer failed: $error")
                    }
                    override fun onSetFailure(error: String?) {}
                }, mediaConstraints)
                
            } catch (e: Exception) {
                Log.e(TAG, "Connection error: ${e.message}")
                withContext(Dispatchers.Main) { onDisconnected() }
            }
        }
    }
    
    private fun sendOfferToServer(sdp: SessionDescription?) {
        if (sdp == null) return
        
        scope.launch {
            try {
                val json = JSONObject().apply {
                    put("sdp", sdp.description)
                    put("type", sdp.type.canonicalForm())
                }
                
                val request = Request.Builder()
                    .url("$serverUrl/offer")
                    .post(json.toString().toRequestBody("application/json".toMediaType()))
                    .build()
                
                Log.d(TAG, "Sending offer to $serverUrl/offer")
                
                httpClient.newCall(request).enqueue(object : Callback {
                    override fun onFailure(call: Call, e: IOException) {
                        Log.e(TAG, "Failed to send offer: ${e.message}")
                        scope.launch(Dispatchers.Main) { onDisconnected() }
                    }
                    
                    override fun onResponse(call: Call, response: Response) {
                        if (response.isSuccessful) {
                            val body = response.body?.string()
                            Log.d(TAG, "Answer received")
                            handleAnswer(body)
                        } else {
                            Log.e(TAG, "Server error: ${response.code}")
                            scope.launch(Dispatchers.Main) { onDisconnected() }
                        }
                    }
                })
            } catch (e: Exception) {
                Log.e(TAG, "Error sending offer: ${e.message}")
            }
        }
    }
    
    private fun handleAnswer(jsonString: String?) {
        if (jsonString == null) return
        
        try {
            val json = JSONObject(jsonString)
            val sdp = json.getString("sdp")
            val type = json.getString("type")
            
            val sessionDescription = SessionDescription(
                SessionDescription.Type.fromCanonicalForm(type),
                sdp
            )
            
            peerConnection?.setRemoteDescription(object : SdpObserver {
                override fun onCreateSuccess(p0: SessionDescription?) {}
                override fun onSetSuccess() {
                    Log.d(TAG, "Remote description set successfully!")
                }
                override fun onCreateFailure(error: String?) {}
                override fun onSetFailure(error: String?) {
                    Log.e(TAG, "Set remote description failed: $error")
                }
            }, sessionDescription)
            
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing answer: ${e.message}")
        }
    }
    
    fun disconnect() {
        Log.d(TAG, "Disconnecting")
        scope.cancel()
        peerConnection?.close()
        peerConnection = null
        peerConnectionFactory?.dispose()
        peerConnectionFactory = null
        eglBase?.release()
        eglBase = null
    }
}
