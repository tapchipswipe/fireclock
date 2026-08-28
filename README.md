# FireClock

A digital clock + calendar dashboard optimized for a 16:9 Fire TV display running in **Fully Kiosk Browser**. Pure HTML/CSS/JS, served by Dockerized Nginx (Alpine). Zero build tools.

## Files
| File | Purpose |
|------|---------|
| `index.html` | Clock (giant `HH MM`), date (`Thursday, December 15 2022`), next-5 events, glare overlay, ical.js + Roboto CDN |
| `style.css` | 1080p 16:9 layout, `overflow:hidden`, `#0a0a0a` bg, `4px dotted #fff` perimeter, `pointer-events:none` diagonal glare |
| `script.js` | 1s self-correcting clock (`setInterval` + boundary sync), async `.ics` fetch, ical.js parse, 5 upcoming events, silent error handling |
| `Dockerfile` | `nginx:alpine`, copies static files |
| `docker-compose.yml` | Serve on host port 8080 → 80, immutable/read-only container |

## Configure calendars
Edit `CALENDAR_URLS` in `script.js` with your Google/Apple `.ics` publish URLs. Empty array = no calendars configured (clock still runs).

> **CORS:** Google/Apple `.ics` URLs usually omit permissive CORS headers, so direct browser fetches can be rejected. See the CORS note in `script.js` for adding a local nginx reverse proxy (`/cal/`) that adds `Access-Control-Allow-Origin: *`.

## Build & run (Docker Compose)
```bash
cd fireclock
docker compose up --build -d
```
Then load `http://localhost:8080` in Fully Kiosk Browser and set it as the kiosk landing URL (hide the system status bar for a clean full-screen look).

## Build & run (raw docker)
```bash
docker build -t fireclock .
docker run -d --name fireclock -p 8080:80 fireclock
```