# FireClock — CONTINUE / RESUME FILE
Last updated: 2026-08-15 (before a user reboot)
Placeholder note: the user rebooted mid-task; resume from "IN PROGRESS / NEXT" below.

---

## 1. WHERE WE ARE (verified current state)

Files in `/Users/lucasdespot/fireclock/`:
- `index.html` — Electron-style upgrade DONE:
  - Fonts switched to premium **Plus Jakarta Sans** (display) + **Space Grotesk** (numbers/mono).
  - `main.stage` (full-bleed, NO dotted border anymore).
  - `div.eyebrow` **"Today's schedule"** (static pill, NO flashing "On now" dot).
  - Clock markup `#clock-time` with `#clock-digits`, `#clock-sep`, `#clock-seconds`, `#ampm`.
  - `#events` container for day cards.
- `style.css` — **330 lines, braces BALANCED (41/41)**. Contains the high-end "Ethereal Glass" design:
  - OLED black, radial lift bg, premium type vars (`--font-display` Plus Jakarta Sans, `--font-mono` Space Grotesk).
  - `.glare` overlay kept (static), `.stage` (no border), `.eyebrow` static pill.
  - `.time` giant 12h clock, `.date`, `.calendar`, `.calendar-wrap` (horizontal `overflow-x:auto`).
  - `.day-shell` / `.day-core` Double-Bezel cards, horizontal `flex-row` columns (`calendar-list`).
  - `@keyframes day-rise` entrance (custom cubic-bezier, once, NOT looping/flashing).
  - `#clock-seconds` accent color (static, not flashing).
  - `.sync-status`, `.event-list-status` empty/loading state.
- `script.js` — syntax OK (node --check passes). Current edits applied:
  - `DAYS_AHEAD = 14` (was 6).
  - `MAX_PER_DAY = 20` (was 8).
  - `renderCalendar` already builds **Double-Bezel**: `day-shell`/`is-today` + `day-core`, adds `.reveal` + staggered `transitionDelay` via inline style.
  - **NOT yet added this session:** the static training-camp schedule (Aug 16–30) and the merge logic.
- `nginx.conf`, `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `README.md` — intact.

## 2. DEPLOYMENT STATE (TrueNAS)
- TrueNAS host: `root@100.111.217.42` (SSH via Tailscale), stack at `/mnt/indiana/apps/stacks/fireclock/`.
- Currently running container image was built from an EARLIER state (iOS/Apple design). The latest local edits (stage/eyebrow/premium fonts/schedule) are **NOT yet deployed**.
- Build pattern: push files then `nohup docker compose up --build -d` in the stack dir; verify via curl on `http://100.111.217.42:8081/`.

## 3. IN PROGRESS / NEXT (resume here)

### A. Finish `script.js` — add the static camp schedule
1. Add a `STATIC_SCHEDULE` object (inside the IIFE, after `var MAX_PER_DAY = 20;`). Format = map of `'YYYY-MM-DD'` → array of `[time, title]` pairs. Dates: **2026-08-16 through 2026-08-30** (all times are the user's pasted itinerary).
2. Add a `parseTime(dateStr, timeStr)` helper: `'7:30 AM'` → local `Date` (handle 12h→24h, `AM`/`PM`).
3. In `refreshCalendar`, after building `events` from the `.ics` feeds, **merge** the static schedule:
   - Filter: skip if `startMs + HOUR_MS < now`; skip if outside `DAYS_AHEAD` window.
   - **Dedupe** vs. feed events by key `Math.floor(startMs/60000) + '|' + title` so nothing shows twice.
   - Push `{ startMs, isAllDay:false, title }`, then re-sort by `startMs`.
4. In `renderCalendar`, after building the shells, **auto-scroll today into view** for the horizontal layout:
   `var todayShell = eventsEl.querySelector('.day-shell.is-today'); if (todayShell) todayShell.scrollIntoView({inline:'center', block:'nearest'});`

### B. Tiny `style.css` size tuning (optional but recommended)
Append an override so the schedule owns the height (the clock is large otherwise):
```css
/* TV-space tuning: let the horizontal schedule own the height */
.time { font-size: clamp(84px, 22vh, 220px); }
.eyebrow { margin-bottom: clamp(2px, 0.4vh, 6px); }
```

### C. Validate
- `node --check script.js` (must pass).
- Quick logic test of `parseTime` + dedupe + grouping with a DOM shim (see notes file history if needed) OR at minimum a Node harness.

### D. Deploy to TrueNAS
```
cd /Users/lucasdespot/fireclock
scp index.html style.css script.js nginx.conf Dockerfile root@100.111.217.42:/mnt/indiana/apps/stacks/fireclock/
ssh root@100.111.217.42 'cd /mnt/indiana/apps/stacks/fireclock && nohup docker compose up --build -d > /tmp/fireclock_up_next.log 2>&1 & echo LAUNCHED'
```
Then verify:
- `curl -s -o /dev/null -w "%{http_code}" http://100.111.217.42:8081/` → 200
- `curl -s http://100.111.217.42:8081/script.js | grep -c STATIC_SCHEDULE` → >0
- Check `.stage` present in served HTML, `.eyebrow` present, no `.stamp`/`live-dot`.

## 4. KEY DECISIONS already made (do not re-litigate)
- Removed the dotted perimeter border (user asked).
- Removed the flashing "On now" light; replaced with a static `.eyebrow` pill "Today's schedule".
- Premium fonts (no Inter/Roboto/Helvetica) per the `high-end-visual-design` skill.
- Horizontal day columns (M|T|W|T|F across width) per user; each day is a Double-Bezel column; today auto-centered.
- Static camp schedule should always display (merged, deduped) so the day's itinerary is guaranteed even if a feed is down.

## 5. USEFUL FACTS
- TrueNAS only binds `100.111.217.42:8081` (Tailscale). If the Fire TV buffers, it cannot reach the Tailscale IP (needs subnet router / LAN bind) OR TrueNAS is offline.
- The 4 feeds: arms (`/cal/0`), firebase (`/cal/1`), despotlucas gmail (`/cal/2`), chloe gmail (`/cal/3`, currently 404).
- TrueNAS is Linux → no Windows credential-helper problem for pulls.
