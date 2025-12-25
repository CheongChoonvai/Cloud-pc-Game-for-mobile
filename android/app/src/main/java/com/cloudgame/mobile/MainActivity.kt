package com.cloudgame.mobile

import android.app.Dialog
import android.content.Context
import android.content.SharedPreferences
import android.os.Bundle
import android.view.View
import android.view.Window
import android.view.WindowManager
import android.widget.Button
import android.widget.SeekBar
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.cloudgame.mobile.databinding.ActivityMainBinding
import com.cloudgame.mobile.input.GamepadController
import com.cloudgame.mobile.webrtc.WebRTCClient
import org.webrtc.VideoTrack

/**
 * Main game streaming activity
 * Displays video stream and customizable Xbox-style virtual gamepad controls
 */
class MainActivity : AppCompatActivity() {
    
    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: SharedPreferences
    private var webRTCClient: WebRTCClient? = null
    private var gamepadController: GamepadController? = null
    
    // Connection info
    private var serverIp: String = ""
    private var wsPort: Int = 8765
    private var webrtcPort: Int = 8889
    
    // Controller settings
    private var controllerOpacity: Float = 0.6f
    private var controllerScale: Float = 1.0f
    private var showController: Boolean = true
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Fullscreen immersive mode
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        hideSystemUI()
        
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        // Load preferences
        prefs = getSharedPreferences("controller_prefs", Context.MODE_PRIVATE)
        loadSettings()
        
        // Get connection info from intent
        serverIp = intent.getStringExtra("SERVER_IP") ?: ""
        wsPort = intent.getIntExtra("WS_PORT", 8765)
        webrtcPort = intent.getIntExtra("WEBRTC_PORT", 8889)
        
        if (serverIp.isEmpty()) {
            showConnectionUI()
        } else {
            connectToServer()
        }
        
        setupGamepad()
        applyControllerSettings()
    }
    
    private fun loadSettings() {
        controllerOpacity = prefs.getFloat("opacity", 0.6f)
        controllerScale = prefs.getFloat("scale", 1.0f)
        showController = prefs.getBoolean("show_controller", true)
    }
    
    private fun saveSettings() {
        prefs.edit()
            .putFloat("opacity", controllerOpacity)
            .putFloat("scale", controllerScale)
            .putBoolean("show_controller", showController)
            .apply()
    }
    
    private fun applyControllerSettings() {
        binding.gamepadOverlay.alpha = controllerOpacity
        binding.gamepadOverlay.scaleX = controllerScale
        binding.gamepadOverlay.scaleY = controllerScale
        binding.gamepadOverlay.visibility = if (showController) View.VISIBLE else View.GONE
    }
    
    private fun showSettingsDialog() {
        val dialog = Dialog(this)
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE)
        dialog.setContentView(R.layout.dialog_settings)
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)
        
        val opacitySeekBar = dialog.findViewById<SeekBar>(R.id.opacitySeekBar)
        val opacityValue = dialog.findViewById<TextView>(R.id.opacityValue)
        val sizeSeekBar = dialog.findViewById<SeekBar>(R.id.sizeSeekBar)
        val sizeValue = dialog.findViewById<TextView>(R.id.sizeValue)
        val showSwitch = dialog.findViewById<Switch>(R.id.showControllerSwitch)
        val closeButton = dialog.findViewById<Button>(R.id.closeSettingsButton)
        
        // Set current values
        opacitySeekBar.progress = (controllerOpacity * 100).toInt()
        opacityValue.text = "${(controllerOpacity * 100).toInt()}%"
        sizeSeekBar.progress = (controllerScale * 100).toInt()
        sizeValue.text = "${(controllerScale * 100).toInt()}%"
        showSwitch.isChecked = showController
        
        // Opacity listener
        opacitySeekBar.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
                controllerOpacity = progress / 100f
                opacityValue.text = "$progress%"
                applyControllerSettings()
            }
            override fun onStartTrackingTouch(seekBar: SeekBar?) {}
            override fun onStopTrackingTouch(seekBar: SeekBar?) { saveSettings() }
        })
        
        // Size listener
        sizeSeekBar.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
                controllerScale = progress / 100f
                sizeValue.text = "$progress%"
                applyControllerSettings()
            }
            override fun onStartTrackingTouch(seekBar: SeekBar?) {}
            override fun onStopTrackingTouch(seekBar: SeekBar?) { saveSettings() }
        })
        
        // Show/hide listener
        showSwitch.setOnCheckedChangeListener { _, isChecked ->
            showController = isChecked
            applyControllerSettings()
            saveSettings()
        }
        
        closeButton.setOnClickListener {
            dialog.dismiss()
        }
        
        dialog.show()
    }
    
    private fun hideSystemUI() {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_FULLSCREEN
        )
    }
    
    private fun setupGamepad() {
        gamepadController = GamepadController(
            onConnectionChange = { connected ->
                runOnUiThread {
                    binding.gamepadStatus.text = if (connected) "🎮" else "❌"
                }
            }
        )
        
        // Setup virtual joysticks
        setupJoystick(binding.leftTouchArea, true)
        setupJoystick(binding.rightTouchArea, false)
        
        // ABXY buttons
        binding.btnA.setOnTouchListener { _, event ->
            gamepadController?.sendButton("A", event.action == android.view.MotionEvent.ACTION_DOWN)
            true
        }
        binding.btnB.setOnTouchListener { _, event ->
            gamepadController?.sendButton("B", event.action == android.view.MotionEvent.ACTION_DOWN)
            true
        }
        binding.btnX.setOnTouchListener { _, event ->
            gamepadController?.sendButton("X", event.action == android.view.MotionEvent.ACTION_DOWN)
            true
        }
        binding.btnY.setOnTouchListener { _, event ->
            gamepadController?.sendButton("Y", event.action == android.view.MotionEvent.ACTION_DOWN)
            true
        }
        
        // Shoulder buttons
        binding.btnLB.setOnTouchListener { _, event ->
            gamepadController?.sendButton("LB", event.action == android.view.MotionEvent.ACTION_DOWN)
            true
        }
        binding.btnRB.setOnTouchListener { _, event ->
            gamepadController?.sendButton("RB", event.action == android.view.MotionEvent.ACTION_DOWN)
            true
        }
        binding.btnLT.setOnTouchListener { _, event ->
            gamepadController?.sendButton("LT", event.action == android.view.MotionEvent.ACTION_DOWN)
            true
        }
        binding.btnRT.setOnTouchListener { _, event ->
            gamepadController?.sendButton("RT", event.action == android.view.MotionEvent.ACTION_DOWN)
            true
        }
        
        // D-Pad
        binding.btnDpadUp.setOnTouchListener { _, event ->
            gamepadController?.sendDpad("UP", event.action == android.view.MotionEvent.ACTION_DOWN)
            true
        }
        binding.btnDpadDown.setOnTouchListener { _, event ->
            gamepadController?.sendDpad("DOWN", event.action == android.view.MotionEvent.ACTION_DOWN)
            true
        }
        binding.btnDpadLeft.setOnTouchListener { _, event ->
            gamepadController?.sendDpad("LEFT", event.action == android.view.MotionEvent.ACTION_DOWN)
            true
        }
        binding.btnDpadRight.setOnTouchListener { _, event ->
            gamepadController?.sendDpad("RIGHT", event.action == android.view.MotionEvent.ACTION_DOWN)
            true
        }
        
        // Menu buttons
        binding.btnSelect.setOnTouchListener { _, event ->
            gamepadController?.sendButton("SELECT", event.action == android.view.MotionEvent.ACTION_DOWN)
            true
        }
        binding.btnStart.setOnTouchListener { _, event ->
            gamepadController?.sendButton("START", event.action == android.view.MotionEvent.ACTION_DOWN)
            true
        }
        
        // Settings button
        binding.btnSettings.setOnClickListener {
            showSettingsDialog()
        }
    }
    
    private fun setupJoystick(view: View, isLeft: Boolean) {
        view.setOnTouchListener { v, event ->
            val center = v.width / 2f
            val radius = v.width / 2f
            
            when (event.action) {
                android.view.MotionEvent.ACTION_DOWN,
                android.view.MotionEvent.ACTION_MOVE -> {
                    var dx = event.x - center
                    var dy = event.y - center
                    
                    val distance = kotlin.math.sqrt(dx * dx + dy * dy)
                    if (distance > radius) {
                        val ratio = radius / distance
                        dx *= ratio
                        dy *= ratio
                    }
                    
                    val x = dx / radius
                    val y = dy / radius
                    
                    if (isLeft) {
                        gamepadController?.sendLeftStick(x, y)
                    } else {
                        gamepadController?.sendRightStick(x, y)
                    }
                }
                android.view.MotionEvent.ACTION_UP,
                android.view.MotionEvent.ACTION_CANCEL -> {
                    if (isLeft) {
                        gamepadController?.sendLeftStick(0f, 0f)
                    } else {
                        gamepadController?.sendRightStick(0f, 0f)
                    }
                }
            }
            true
        }
    }

    private fun showConnectionUI() {
        binding.connectionOverlay.visibility = View.VISIBLE
        binding.gamepadOverlay.visibility = View.GONE
        binding.videoView.visibility = View.GONE
        
        binding.connectButton.setOnClickListener {
            val ip = binding.ipInput.text.toString()
            if (ip.isNotEmpty()) {
                serverIp = ip
                connectToServer()
            }
        }
        
        // QR button - show message that QR is not available
        binding.scanQrButton.setOnClickListener {
            Toast.makeText(this, "QR scanning coming soon!", Toast.LENGTH_SHORT).show()
        }
    }
    
    private fun connectToServer() {
        binding.connectionOverlay.visibility = View.GONE
        binding.gamepadOverlay.visibility = if (showController) View.VISIBLE else View.GONE
        binding.videoView.visibility = View.VISIBLE
        binding.statusText.text = "Connecting to $serverIp..."
        binding.statusText.visibility = View.VISIBLE
        
        applyControllerSettings()
        
        webRTCClient = WebRTCClient(
            context = this,
            serverUrl = "http://$serverIp:$webrtcPort",
            onConnected = {
                runOnUiThread {
                    binding.statusText.visibility = View.GONE
                }
            },
            onDisconnected = {
                runOnUiThread {
                    binding.statusText.text = "Disconnected"
                    binding.statusText.visibility = View.VISIBLE
                }
            },
            onVideoTrack = { videoTrack ->
                runOnUiThread {
                    // Attach video track to the renderer
                    videoTrack.addSink(binding.videoView)
                }
            }
        )
        
        // Initialize the video renderer
        webRTCClient?.initSurfaceViewRenderer(binding.videoView)
        
        webRTCClient?.connect()
        gamepadController?.connect("ws://$serverIp:$wsPort")
    }
    
    override fun onDestroy() {
        super.onDestroy()
        webRTCClient?.disconnect()
        gamepadController?.disconnect()
    }
    
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemUI()
    }
}
