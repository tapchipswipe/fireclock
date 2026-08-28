# FireClock — Edit It Yourself + TrueNAS App Setup

## A) Add events / special dates / chips WITHOUT asking (edit a file)
FireClock reads **`/mnt/indiana/apps/stacks/fireclock/fireclock_user.json`** — edit it and hit refresh (no rebuild).

**Events** → shows on that date's column:
```json
"events": {
  "2026-09-06": [ ["4:00 PM", "Labor Day BBQ"], ["9:00 PM", "Lights out"] ]
}
```
**Special dates** → accent glow + badge on that day:
```json
"specialDays": { "2026-12-25": "Christmas" }
```
**Chips** → the bottom-left date pills (`[month, day, "Label"]`):
```json
"chips": [ [10, 8, "Oct 8"], [11, 26, "Nov 26"], [12, 25, "Dec 25"] ]
```
Time format: `"h:mm AM/PM"`. Any day you leave out shows the training-camp defaults.

How to edit the file on the NAS (pick one):
- **TrueNAS UI:** Files → Browse to `mnt/indiana/apps/stacks/fireclock/fireclock_user.json` → Edit.
- **SMB (if shares configured):** open it in any editor.
- **Terminal / SSH:** `nano /mnt/indiana/apps/stacks/fireclock/fireclock_user.json`.
Keep it valid JSON (commas, quotes) — if it breaks, FireClock just ignores it and falls back.

> Note: this works with either setup below. If you later register FireClock as a TrueNAS App, add the same file as a storage mount.

---

## B) Register FireClock as a TrueNAS App (Apps dashboard)
App creation is done in the TrueNAS GUI. Add it as a **Custom App**:

1. **Apps → Discover/Applications → ADD → Custom App** (Application Sponsor Tech)
2. **Application Name**: `fireclock`
3. **Image Repository**: `docker.io/library/nginx`  (tag `alpine` or `latest`)
4. **Ports — TCP**: host `8081` → container `80`
5. **Storage** (Add as Host Path):
   - `/mnt/indiana/apps/stacks/fireclock` → `/usr/share/nginx/html` (Read Only)
   - `/mnt/indiana/apps/stacks/fireclock/nginx.conf` → `/etc/nginx/nginx.conf` (Read Only)
   - `/mnt/indiana/apps/stacks/fireclock/fireclock_user.json` → `/usr/share/nginx/html/user.json` (Read Only)
6. **Save** → TrueNAS recreates it as a managed app; it'll show under **Installed Applications** where you can Start/Stop/Edit/Update.

⚠️ **One port to keep straight:** the current container already uses `8081`. Before creating the App, **stop/remove the compose stack** so both aren't fighting over 8081 (or keep compose and skip the App — your choice):
```bash
cd /mnt/indiana/apps/stacks/fireclock && docker compose -f docker-compose.yml down
```
Then the App becomes the single owner of FireClock.

## Revert / original state
Backups of the pre-experiment files are in:
- `~/fireclock_backup_pre_apple/`
- `~/fireclock_backup_pre_highend/`
