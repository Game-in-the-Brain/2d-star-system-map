# Wrapper Build Instructions

This project is configured to build as a desktop app (via Tauri v2) and an Android app (via Capacitor 6).

## Prerequisites

- Node.js 18+ (Capacitor 6 requires Node >= 18)
- Rust + Cargo (for Tauri)
- Android SDK (for Android builds)

## Build Scripts

```bash
# Build for wrapper (sets base path to relative)
npm run build:wrapper

# Desktop builds (Windows .msi, Linux .AppImage)
npm run tauri:dev       # Development mode
npm run tauri:build     # Production build

# Android builds
npm run capacitor:sync         # Sync web assets to Android
npm run capacitor:build:android # Build APK
```

## Full Build Workflows

### Windows (.msi) and Linux (.AppImage)
```bash
npm install
npm run wrapper:build:desktop
```
Built artifacts will be in `src-tauri/target/release/bundle/`.

### Android (.apk)
```bash
npm install
npm run wrapper:build:android
```
Built APK will be in `android/app/build/outputs/apk/`.

## Service Worker & IndexedDB

- The app uses `vite-plugin-pwa` for service worker caching.
- Both Tauri (WebView2 / WebKitGTK) and Capacitor (Android System WebView) support Service Workers.
- IndexedDB (Dexie.js / idb) data persists across app restarts automatically in both wrappers.
- No special configuration is required for storage persistence.

## Platform-Specific Notes

### Tauri v2
- Uses `https://tauri.localhost` (secure context) — Service Workers work natively.
- Window size defaults to 1280x800, resizable.

### Capacitor (Android)
- Uses `http://localhost` scheme (secure context) — Service Workers work natively.
- Offline WebView does not require HTTPS or Play Store signing.
