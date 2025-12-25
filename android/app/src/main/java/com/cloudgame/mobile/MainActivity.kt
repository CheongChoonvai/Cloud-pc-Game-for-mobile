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
import com.cloudgame.mobile.video.MjpegPlayer

/**
 * Main game streaming activity
 * Displays video stream and customizable Xbox-style virtual gamepad controls
 */
class MainActivity : AppCompatActivity() {
    
    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: SharedPreferences
    private var gamepadController: GamepadController? = null
    private var mjpegPlayer: MjpegPlayer? = null
    private var isVideoShowing: Boolean = false
    
    // Connection info
    private var serverIp: String = ""
    private var wsPort: Int = 8765
    private var mjpegPort: Int = 8888
    
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
        mjpegPort = intent.getIntExtra("MJPEG_PORT", 8888)
        
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
        
        // Video settings
        val videoQualitySeekBar = dialog.findViewById<SeekBar>(R.id.videoQualitySeekBar)
        val videoQualityValue = dialog.findViewById<TextView>(R.id.videoQualityValue)
        val videoScaleSeekBar = dialog.findViewById<SeekBar>(R.id.videoScaleSeekBar)
        val videoScaleValue = dialog.findViewById<TextView>(R.id.videoScaleValue)
        
        // Set current values
        opacitySeekBar.progress = (controllerOpacity * 100).toInt()
        opacityValue.text = "${(controllerOpacity * 100).toInt()}%"
        sizeSeekBar.progress = (controllerScale * 100).toInt()
        sizeValue.text = "${(controllerScale * 100).toInt()}%"
        showSwitch.isChecked = showController
        
        // Video quality listener
        videoQualitySeekBar.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
                videoQualityValue.text = "$progress%"
            }
            override fun onStartTrackingTouch(seekBar: SeekBar?) {}
            override fun onStopTrackingTouch(seekBar: SeekBar?) {
                sendVideoSettings(videoQualitySeekBar.progress, videoScaleSeekBar.progress)
            }
        })
        
        // Video scale listener
        videoScaleSeekBar.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
                videoScaleValue.text = "$progress%"
            }
            override fun onStartTrackingTouch(seekBar: SeekBar?) {}
            override fun onStopTrackingTouch(seekBar: SeekBar?) {
                sendVideoSettings(videoQualitySeekBar.progress, videoScaleSeekBar.progress)
            }
        })
        
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
    
    private fun sendVideoSettings(quality: Int, scale: Int) {
        Thread {
            try {
                val url = java.net.URL("http://$serverIp:$mjpegPort/config")
                val conn = url.openConnection() as java.net.HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.doOutput = true
                
                val json = """{"jpeg_quality": $quality, "scale_factor": ${scale / 100.0}}"""
                conn.outputStream.write(json.toByteArray())
                conn.outputStream.close()
                
                val response = conn.responseCode
                runOnUiThread {
                    if (response == 200) {
                        Toast.makeText(this, "Video: Q=$quality% S=$scale%", Toast.LENGTH_SHORT).show()
                    }
                }
                conn.disconnect()
            } catch (e: Exception) {
                runOnUiThread {
                    Toast.makeText(this, "Failed to update video settings", Toast.LENGTH_SHORT).show()
                }
            }
        }.start()
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
        
        // Video toggle button
        binding.btnVideo.setOnClickListener {
            toggleVideoStream()
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
        binding.videoImageView.visibility = View.GONE
        
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
        binding.statusText.text = "Connected! Tap 📺 for video"
        binding.statusText.visibility = View.VISIBLE
        
        applyControllerSettings()
        setupVideoPlayer()
        
        gamepadController?.connect("ws://$serverIp:$wsPort")
    }
    
    private fun setupVideoPlayer() {
        mjpegPlayer = MjpegPlayer(
            onFrame = { bitmap ->
                binding.videoImageView.setImageBitmap(bitmap)
            },
            onError = { error ->
                Toast.makeText(this, "Video error: $error", Toast.LENGTH_SHORT).show()
                binding.statusText.text = "Video error: $error"
                binding.statusText.visibility = View.VISIBLE
            }
        )
    }
    
    private fun toggleVideoStream() {
        isVideoShowing = !isVideoShowing
        if (isVideoShowing) {
            val mjpegUrl = "http://$serverIp:$mjpegPort/"
            mjpegPlayer?.start(mjpegUrl)
            binding.videoImageView.visibility = View.VISIBLE
            binding.statusText.visibility = View.GONE
            Toast.makeText(this, "Starting video stream...", Toast.LENGTH_SHORT).show()
        } else {
            mjpegPlayer?.stop()
            binding.videoImageView.visibility = View.GONE
            binding.videoImageView.setImageBitmap(null)
            binding.statusText.text = "Video hidden"
            binding.statusText.visibility = View.VISIBLE
        }
    }
    
    override fun onDestroy() {
        super.onDestroy()
        mjpegPlayer?.stop()
        gamepadController?.disconnect()
    }
    
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemUI()
    }
}
