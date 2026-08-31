# FireClock — CONTINUE / RESUME FILE
Last updated: 2026-08-30

---

## 1. WHERE WE ARE (verified current state)

- **Self-Contained Standalone Fire TV App (v1.0.9)**:
  - Completely eliminates dependency on TrueNAS and Fully Kiosk Browser.
  - WebView request interception in `MainActivity.kt` serves HTML/CSS/JS from packaged assets and proxies feeds/weather.
  - Native proxying for Open-Meteo weather (`/weather`) and all 4 `.ics` calendar feeds (`/cal/0..3`).
  - Native JSON storage for `/user.json` and `/api/` (GET/PUT) in app internal storage (`filesDir/user.json`), with default fallback to `fireclock_user.json`.
  - Continuous screen-on (`FLAG_KEEP_SCREEN_ON`) + sticky immersive fullscreen for 1080p wall-clock display.
  - OTA Auto-updater (`AppUpdater.kt`) checks GitHub Releases on launch.
  - Keystore `app/keystore.jks` pinned for deterministic release signing across local builds and CI.
  - Gradle `copyWebAssets` task automatically packages latest web files into APK assets before build.
  - Verified local build: `gradle assembleRelease` -> `app/build/outputs/apk/release/app-release.apk` (SUCCESS).

- **CI/CD Pipeline**:
  - `.github/workflows/release.yml` builds, signs, and creates GitHub releases with `app-release-signed.apk`.

- **Web / TrueNAS Stack (Legacy / Optional)**:
  - Can be decommissioned once the APK is installed on the Fire TV.

---

## 2. HOW TO INSTALL ON FIRE TV

1. Connect ADB to Fire TV:
   ```bash
   adb connect <FIRE_TV_IP>:5555
   ```
2. Install the signed release APK:
   ```bash
   adb install -r /Users/lucasdespot/Documents/Projects/web/fireclock/app/build/outputs/apk/release/app-release.apk
   ```
3. Launch FireClock from the Fire TV home screen or app grid.

---

## 3. DECOMMISSIONING TRUENAS PROCESS

Once the Fire TV is running the native APK standalone:
- SSH to TrueNAS:
  ```bash
  ssh root@100.111.217.42 'cd /mnt/indiana/apps/stacks/fireclock && docker compose down'
  ```
- The Fire TV will continue running independently, proxying all feeds and weather directly over its own Wi-Fi connection.
