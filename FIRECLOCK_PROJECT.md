# FireClock — Project Reference (CANONICAL)

> Preserve this file as the single source of truth for the FireClock project.
> Last updated: 2026-08-15. Add to it as features evolve.

---

## 1. What it is
A **Fire TV clock + schedule dashboard** (running in Fully Kiosk Browser), 16:9 / 1080p, **no scrolling**. Pure static **HTML/CSS/JS**, served by **Dockerized Nginx (Alpine)** on the user's **TrueNAS** box. Calendar data comes from live `.ics` feeds (proxied same-origin to avoid CORS) **plus a static merged camp itinerary**, and a **live editable `user.json`** (special days, events, chips, day-window) edited via the on-screen ⚙ Settings panel or by hand.

**Deployment target:** TrueNAS at `100.111.217.42` (reachable over Tailscale from the Mac), stack dir `/mnt/indiana/apps/stacks/fireclock/`, served on **`http://100.111.217.42:8081/`**.

## 2. Files (in `/Users/lucasdespot/fireclock/`)
- `index.html` — markup: glare/noise overlays, `.stage` (clock band → next-up → calendar → watchbar) + settings gear.
- `style.css` — the whole "Ethereal Glass" design + all feature styles.
- `script.js` — all logic (clock, feeds, static schedule, ambience, weather, countdowns, screensaver, settings editor…).
- `nginx.conf` — static host + `/cal/N` same-origin proxies to the 4 `.ics` feeds + **`/weather` proxy** (Open-Meteo) + **`/api/` proxy** → config API.
- `config_api.py` — tiny python:alpine service (port 8787) that GET/PUTs `user.json` (the live editable config). Written **in-place** (atomic `os.replace` would fail on a bind-mount — "Resource busy").
- `fireclock_user.json` — **editable config** (mounts to `/usr/share/nginx/html/user.json`), read by `loadUserConfig()`.
- `Dockerfile`, `docker-compose.yml` — two services: `fireclock` (nginx:alpine) + `fireclock-api` (python). Host port `100.111.217.42:8081:80`.
- `FIRECLOCK_PROJECT.md` — this file.
- `TRUENAS_APP_SETUP.md` — how to register FireClock as a TrueNAS Custom App (only relevant if you enable the Apps layer; current setup is raw Docker Compose).

> **Deploy gotcha:** `script.js`/`style.css`/`index.html`/`nginx.conf` are **baked into the image** (Dockerfile COPY → `/usr/share/nginx/html` — only `user.json` is bind-mounted). So after editing them you MUST **rebuild** (`docker compose up --build -d`); a mere file copy/restart serves stale pages.

## 3. Architecture notes
- 4 feeds proxied under `/cal/{0..3}`: arms (0), firebase (1), despotlucas gmail (2), chloe gmail (3, currently 404 — handled silently).
- `.ics` parsed with **ical.js 1.5.0** (CDN + cdnjs fallback).
- Static **camp itinerary Aug 14–30** lives in `STATIC_SCHEDULE`, merged + **deduped** vs feeds by `minute|title`, re-sorted.
- Feeds/net fail silently — the clock always runs.

## 4. All implemented features (current)
**Layout / design**
- Auto-fit: `.screen` fills **100vw×100vh** responsively (no letterbox/clipping) on any screen.
- "Ethereal Glass": OLED black, Double-Bezel (shell/core) cards, ambient orbs, film grain, glass glare; premium **Plus Jakarta Sans + Space Grotesk** (no Inter/Roboto/Arial/Open Sans/Helvetica).
- Header justified: date + nearest milestone (left), clock (right); bottom watchbar = milestone + weather.

**Calendar / schedule**
- 3-day window today+next2; today column larger + accent; **empty days dimmed** (`is-empty` ghost "—").
- Full camp schedule (all day events) merged+deduped; recurring all-day "football camp" filtered out.
- "Now" marker (highlights active slot, dims past), **practice progress bar** (session % or "Day · %" fallback).
- "Next up" line under clock; **"starting soon"** when ≤10 min out.
- Special/game-day glow + badge (`Scrimmage`, `Game review`, `Last day of camp` Aug 31).

**Clock & ambience**
- 12h clock, amber seconds, minute-change fade.
- Sunrise/sunset-driven tint (real local), evening warm, deep-sleep dim 00–06, **rainy-day blue tint**.
- Idle screensaver → **true black** after inactivity (best-effort Fully Kiosk `fully.start/stopScreensaver`).
- Midnight rollover: soft fade + refreshed "today".

**Info / countdowns**
- Nearest milestone: "N days · Sep 28" (targets: Oct 8 fly out, Oct 11 fly back to Manchester NH, Sep 28 anniversary) — auto-rolls next-year.
- "N days of camp left" → Aug 31.
- Weather (Manchester, NH 03102): condition glyph, temp °F, hi/lo, next-6h rain %.

## 5. Config knobs (edit `script.js` or `fireclock_user.json`)
| Constant | Meaning | Value now |
|---|---|---|
| `CALENDAR_URLS` | same-origin feed proxies | `/cal/0..3` |
| `DAYS_AHEAD` | columns = today + N (overridable in Settings via `days`) | `2` (3 cols) |
| `REFRESH_MINUTES` | web-cal re-sync | `5` |
| `STATIC_SCHEDULE` | static camp days | Aug 14–30 |
| `COUNTDOWN_TARGETS` | milestone dates | Oct 8 / Oct 11 / Sep 28 |
| `CAMP_END` | camp end date | Aug 31 |
| `SPECIAL_DAYS` | date→label for glow/badge | 08-15/19/23/28 Off Day (via user.json), 08-26 Scrimmage, 08-29 Game review, 08-31 Last day |
| `WEATHER_LOC` | Open-Meteo coords | Manchester NH ~42.99,-71.48 |
| `IDLE_SCREENSAVER_MS` | idle before screensaver | 5 min |
| `MAX_PER_DAY` | max events/column | 20 |
| `DATE_CHIPS` | bottom-left date pills | configurable in `user.json` (`chips`) |

### `fireclock_user.json` (live, no rebuild)
- **`events`** → `"YYYY-MM-DD": [["h:mm AM/PM","Title"],…]` (day-column entries)
- **`specialDays`** → `"YYYY-MM-DD": "Label"` (accent glow + badge)
- **`chips`** → list of `[month, day, "Label"]` replacing the default date pills
- **`days`** → number of day-columns shown (day-window setting)

`nginx.conf` holds the real feed URLs under each `/cal/N`, and the Open-Meteo target under `/weather`.

## 6. Deploy (when TrueNAS reachable)
```bash
cd /Users/lucasdespot/fireclock
node --check script.js                          # validate first
scp index.html style.css script.js root@100.111.217.42:/mnt/indiana/apps/stacks/fireclock/
ssh root@100.111.217.42 'cd /mnt/indiana/apps/stacks/fireclock && nohup docker compose up --build -d > /tmp/fc.log 2>&1 &'
# verify:
curl -s -o /dev/null -w "%{http_code}" http://100.111.217.42:8081/   # → 200
```

## 7. Key decisions (don't re-litigate)
- No horizontal scroll on TV; calendar is the hero; slim clock band.
- Removed "Today's schedule" eyebrow + "Upcoming" title (clock + calendar only).
- Screensaver = true black (user: a lit faint clock was a flaw).
- 3-day window keeps columns readable on a 40" TV; user can widen if desired.
- Heat-strip (weekly index) was added then **removed** at user request; countdown wording is **"44 days · Sep 28"**.

## 8. Related TrueNAS facts
- Pool `indiana` (raidz1, 4 disks) — was DEGRADED after a failed disk; **user replaced the drive (reboot + resilver) — pool now ONLINE, 0 errors**.
- Separate concerns previously handled: media server (Radarr/Sonarr/qBittorrent via Tailscale exit node), ZFS snapshot cleanup, a `movies` stripe-pool idea (sdc) — stored separately from FireClock work.
- Tailscale IPs: truenas = `100.111.217.42`; redbull (exit node) = `100.118.179.76`.

## 9. Open / future ideas (not yet done)
1. Auto day-shift crossfade at midnight — done. Pending: personal-vs-camp feed toggle, lights-out/bedtime countdown, feels-like+wind, long-press settings panel, and the **Fire TV 6:50 AM auto-launch** (needs FireClock on the LAN IP so Fully Kiosk + an Alexa routine can open it).

## 10. Media → film pool migration (2026-08-15)
- Created separate ZFS **`film`** pool (1.81T, mounted `/mnt/film`) for the media workflow, freeing `indiana` for documents.
- Moved `indiana/media` (141G: movies + `downloads/`) to **`film/media`** via `zfs send indiana/media@mig | zfs receive -u film/media`; mounted at `/mnt/film/media` (use `zfs inherit mountpoint`; do NOT `zfs set mountpoint` — it corrupts to `/mnt/mnt/...`).
- Copied app configs to `/mnt/film/apps/{radarr,sonarr,prowlarr,jellyseerr,qbittorrent,qbittorrent-exit,i2pd}`.
- Repointed `media-automation` + `qbittorrent-unpackerr` compose mounts to `/mnt/film/media…` + `/mnt/film/apps…` (in-container paths `/media`,`/downloads`,`/movies`,`/config` unchanged → no re-imports). Backups: `docker-compose.yml.bak.film`.
- Verified: radarr/sonarr/qbit all healthy on film; 11 qbit torrents intact; root folder `/media` = 1.8T.
- **Remaining manual step:** repoint Plex & Jellyfin ix-apps (`/mnt/indiana/media:/media` → `/mnt/film/media`) in the TrueNAS GUI, rescan libraries, then delete `/mnt/indiana/media` content + snapshot `indiana/media@mig` to reclaim ~141G.

## 11. Settings gear + live config editor (2026-08-19)
- A ⚙ icon sits in the watchbar between the date chips and the weather. Clicking it opens **FireClock Settings** (`openSettings()` in `script.js`).
- **Settings panel** currently supports:
  - **Special Days** — add `YYYY-MM-DD` + label, or remove (drives the glow/badge).
  - **Events** — add date / time / title, or remove (user entries, merged into columns).
  - **Day Window** — a `Days shown` dropdown (**4 / 5 / 6 / 7 / 8 / 14**); writes `days` to config and FireClock reloads to that many columns. `DAYS_AHEAD` is a `var` (reassignable) and the render loop cap was lifted to `< 20`.
- **Save** → `PUT /api/` → config API writes `fireclock_user.json` (in-place). Then `loadUserConfig()` + `refreshCalendar()` re-render live. **No rebuild needed for config-only edits** (config API is its own container that writes the mounted `user.json`).
- Important: recent edits were to code (`script.js`/`style.css`), which **ARE baked into the image** → that specific deploy needed a rebuild (`up --build -d`), verified by grepping the served `script.js` for `cfgDays`.

## 12. Config API service (`fireclock-api`)
- Small `python:alpine` HTTPServer on **:8787**, mounted at `/usr/share/nginx/html/user.json`.
- `GET /api/` → returns `user.json`; `PUT /api` → saves it (in-place write).
- nginx proxies `/api/` to :8787 so the browser hits the same-origin `/api/`.
- **No auth.** On the home LAN that's fine, but if it ever goes public/remote add a PIN/basic-auth.

## 13. Weather proxy
- Open-Meteo is fetched server-side by nginx (`/weather` → proxy with `proxy_ssl_server_name on` + explicit Host). The TV would otherwise hit CORS and show broken/empty weather. Same-origin now works on the Fire TV.
- Current display format (bottom-right): big temp `68° | Mostly clear` over a two-line middle `Feels Like 71° | H 81° L 53°` (Feels Like on second line). Manchester, NH 03102 (~42.99, -71.48), °F.

## 14. Sleep / screensaver mode
- **Screen-off is limited by hardware.** FireClock renders pure `#000` (pixel-off on OLED), but the Insignia is **LCD/LED — backlight stays on**, so no website can fully blank those pixels. Two honest choices:
  1. **True show-off** — fully blank panel; only Fully Kiosk's screen-off capability can do this (loses the visible time).
  2. **Ultra-dark faint time + next event** — current approach (faint clock ~10%/next ~12% white).
- "LED-off black with visible time" is physically impossible together. If user wants max panel saving, wire Fully Kiosk screen-off OR blank everything in sleep. Revisit if they pick a direction.

---

## 15. Native Standalone Fire TV App (Self-Contained APK)

As of version **1.0.1+**, FireClock runs directly on the Fire TV as a standalone native Android TV application (`com.tapchipswipe.fireclock`), completely removing the dependency on TrueNAS or Fully Kiosk Browser.

### Architecture & Standalone Operation
- **Embedded Server (`EmbeddedServer.kt`):** An embedded NanoHTTPD instance runs locally on `http://127.0.0.1:8080/`.
- **Dynamic Asset Serving:** Serves `index.html`, `style.css`, and `script.js` directly from the APK assets, avoiding stale disk cache issues.
- **On-Device Proxying:** Proxies `.ics` feeds (`/cal/0..3`) and Open-Meteo weather (`/weather`) directly through the Android network stack with proper timeouts, eliminating CORS restrictions.
- **Config Storage:** `/user.json` and `/api/` (GET/PUT) read and persist custom user events/settings in internal app storage (`context.filesDir/user.json`), with fallback to packaged default `fireclock_user.json`.
- **Over-The-Air (OTA) Updates (`AppUpdater.kt`):** Built-in background update checker queries GitHub Releases API on launch. If a new version exists, it downloads and prompts the installer.
- **Deterministic Keystore (`app/keystore.jks`):** Pinned signing keystore ensures all CI and local builds share the identical signature, preventing `INSTALL_FAILED_UPDATE_INCOMPATIBLE` during OTA updates.

### Building & Deploying the APK
- **Local Build:** `gradle assembleRelease` produces `app/build/outputs/apk/release/app-release.apk`.
- **Automated CI Releases:** Pushing to `main` or triggering `.github/workflows/release.yml` builds, signs, and publishes a new GitHub release asset (`app-release-signed.apk`).
- **Sideloading to Fire TV:**
  ```bash
  adb connect <fire-tv-ip>:5555
  adb install -r app/build/outputs/apk/release/app-release.apk
  ```
