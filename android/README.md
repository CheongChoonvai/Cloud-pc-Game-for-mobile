# Cloud Game for Mobile - Android App

Native Android app for cloud gaming with 60fps low-latency streaming.

## Setup

1. Open `android/` folder in Android Studio
2. Sync Gradle dependencies
3. Build and run on device

## Features

- **WebRTC Video**: 60fps low-latency game streaming
- **Virtual Gamepad**: Dual joysticks + ABXY + Shoulder buttons
- **QR Code Scan**: Quick server connection
- **Auto-reconnect**: Handles connection drops

## Dependencies

- stream-webrtc-android (WebRTC)
- Java-WebSocket (Input)
- MLKit (QR scanning)

## Building

```bash
cd android
./gradlew assembleDebug
```

APK will be in `app/build/outputs/apk/debug/`
