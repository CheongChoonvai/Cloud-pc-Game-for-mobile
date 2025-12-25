# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /sdk/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.kts.

# Keep WebRTC classes
-keep class org.webrtc.** { *; }

# Keep Java-WebSocket classes
-keep class org.java_websocket.** { *; }
