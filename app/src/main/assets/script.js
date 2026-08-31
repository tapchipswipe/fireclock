/* ============================================================
   FireClock — Fire TV Clock & Calendar
   Vanilla JS, zero bundled dependencies (ical.js from CDN in HTML)
   ============================================================ */

(function () {
  'use strict';

  /* ----------------------------------------------------------
     Config
     ---------------------------------------------------------- */

  // Same-origin proxy paths served by nginx (see nginx.conf). Each one
  // forwards to a real .ics feed under /cal/N, so the browser never
  // needs cross-origin CORS access.
  var CALENDAR_URLS = ['/cal/0', '/cal/1', '/cal/2', '/cal/3'];

  var DAYS_AHEAD = 1;               // today + next 1 = 2 columns by default (2 days)
  var REFRESH_MINUTES = 5;          // web-cal re-sync cadence (idea 8)
  var REFRESH_MS = REFRESH_MINUTES * 60 * 1000;
  var HOUR_MS = 60 * 60 * 1000;

  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  var MAX_PER_DAY = 20; // show the full daily itinerary in each column
  var UI_STYLE = 'compact'; // 'compact' (classic Double-Bezel) or 'timeline'; switch in Settings

  var WEB_APP_VERSION = '1.1.0';  // fallback when not running in the native APK

  function getAppVersion() {
    if (window.FireClockBridge && window.FireClockBridge.getAppVersion) {
      try { return window.FireClockBridge.getAppVersion(); } catch (e) {}
    }
    return WEB_APP_VERSION;
  }


  /* ----------------------------------------------------------
     Static camp schedule (Aug 16-30)
     Map of 'YYYY-MM-DD' -> array of [time, title] pairs.
     The itinerary is user-provided; fill the dates below, then
     deploy. Empty by default so feeds alone still render.
     ---------------------------------------------------------- */
  var STATIC_SCHEDULE = {};

  /* Parse a 12h 'h:mm AM/PM' time into a Date on the given local day. */
  function parseTime(dateStr, timeStr) {
    var m = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
    if (!m) return null;
    var h = parseInt(m[1], 10);
    var min = parseInt(m[2], 10);
    var ampm = (m[3] || '').toLowerCase();
    if (ampm === 'pm' && h !== 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    var p = dateStr.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2], h, min, 0, 0);
  }

  function stringify(v) {
    if (v === null || v === undefined) return '';
    return String(v);
  }

  // Keep only EC 243 section A; drop other sections (e.g. EC 243 (B), EC243B-B).
  function shouldKeepFeedEvent(title) {
    var t = String(title);
    if (!/ec\s*243|ec243b/i.test(t)) return true;
    if (/ec\s*243\s*[-–]\s*A\b/i.test(t)) return true;
    if (/ec\s*243\s*\(\s*A\s*\)/i.test(t)) return true;
    if (/ec243b[-\s]?A\b/i.test(t)) return true;
    if (/section\s+A\b/i.test(t)) return true;
    return false;
  }

  /* Merge STATIC_SCHEDULE with feed events: skip past/out-of-window,
     dedupe against feeds by minute|title, re-sort by start. */
  var USER_EVENTS = {}; // extra events from /user.json (editable on the NAS)

  function scheduleSource() {
    var out = {};
    var k;
    for (k in STATIC_SCHEDULE) out[k] = STATIC_SCHEDULE[k];
    // MERGE user-added events with the static camp schedule for the same day
    // instead of overwriting, so a user event never hides the camp itinerary
    // (e.g. a ResLife entry wiping out that day's practice schedule).
    for (k in USER_EVENTS) {
      out[k] = (out[k] || []).concat(USER_EVENTS[k]);
    }
    return out;
  }

  function mergeStatic(events, now) {
    var seen = {};
    events.forEach(function (ev) {
      seen[Math.floor(ev.startMs / 60000) + '|' + ev.title] = true;
    });
    var src = scheduleSource();
    Object.keys(src || {}).forEach(function (dateStr) {
      (src[dateStr] || []).forEach(function (entry) {
        var d = parseTime(dateStr, entry[0]);
        if (!d) return;
        var startMs = d.getTime();
        // Skip if the event has already ended (~1h guard vs feeds).
        if (startMs + HOUR_MS < now) return;
        // Skip if outside the DAYS_AHEAD window.
        var startDay = new Date(d); startDay.setHours(0, 0, 0, 0);
        var floorNow = new Date(now); floorNow.setHours(0, 0, 0, 0);
        if ((startDay - floorNow) / HOUR_MS > DAYS_AHEAD * 24) return;
        // Dedupe so an identical feed copy doesn't appear twice.
        var key = Math.floor(startMs / 60000) + '|' + String(entry[1]);
        if (seen[key]) return;
        if (!shouldKeepFeedEvent(String(entry[1]))) return;
        seen[key] = true;
        events.push({ startMs: startMs, isAllDay: false, title: String(entry[1]) });
      });
    });
    events.sort(function (a, b) { return a.startMs - b.startMs; });
  }

  var digitsEl = document.getElementById('clock-digits');
  var secondsEl = document.getElementById('clock-seconds');
  var ampmEl = document.getElementById('ampm');
  var dateEl = document.getElementById('clock-date');
  var eventsEl = document.getElementById('events');
  var milestonesEl = document.getElementById('milestones');
  var weatherEl = document.getElementById('weather');
  var newsTrackEl = document.getElementById('news-track');
  var lastCountdownDayKey = '';
  var htmlEl = document.documentElement;
  var nextupEl = document.getElementById('nextup');
  var faintclockEl = document.getElementById('faintclock');
  var gearEl = document.getElementById('gear');
  var settingsEl = document.getElementById('settings');
  var htmlEl = document.documentElement;

  // Extra config (ideas 12, 14, 17)
  var CAMP_END = { month: 8, day: 31 };       // last day of camp
  var IDLE_SCREENSAVER_MS = 5 * 60 * 1000;    // 5 min idle -> faint screensaver
  var lastEvents = null;                       // latest merged schedule (for "Next up")
  var SUN = { rise: null, set: null };         // real sunrise/sunset for tinting
  var lastMinuteKey = '';
  var RAINY = false;                           // wet-day ambience (idea 10)
  var lastDayKeyShift = '';                    // midnight rollover tracker (idea 1)

  // Countdown targets — the first is the big one; the rest are small extras.
  var COUNTDOWN_TARGETS = [
    { month: 10, day: 8,  date: 'Oct 8' },
    { month: 10, day: 11, date: 'Oct 11' },
    { month: 9,  day: 28, date: 'Sep 28' }
  ];

  // Weather location (default Manchester, NH) + WMO condition text.
  var WEATHER_LOC = { lat: 42.99, lon: -71.48, label: 'Manchester, NH' };
  var WEATHER_CACHE_KEY = 'fireclock_weather_cache';
  var weatherRetryTimer = null;
  var WMO = {
    0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
    61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
    71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
    80: 'Showers', 81: 'Showers', 82: 'Heavy showers',
    95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm'
  };

  // Weather condition glyphs (idea 5).
  var EMOJI = {
    0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
    45: '🌫️', 48: '🌫️',
    51: '🌦️', 53: '🌦️', 55: '🌦️',
    61: '🌧️', 63: '🌧️', 65: '🌧️',
    71: '❄️', 73: '❄️', 75: '❄️',
    80: '🌦️', 81: '🌦️', 82: '🌦️',
    95: '⛈️', 96: '⛈️', 99: '⛈️'
  };

  // Days that get a special accent/flag (edit the dates as needed).
  var SPECIAL_DAYS = {
    '2026-08-26': 'Scrimmage',
    '2026-08-29': 'Game review',
    '2026-08-31': 'Last day of camp'
  };

  /* ----------------------------------------------------------
     Timekeeping — 12-hour clock, seconds, colons, AM/PM.
     Self-correcting, no flicker / drift / leaks.
     ---------------------------------------------------------- */

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function updateClock() {
    var now = new Date();

    var h24 = now.getHours();
    var ampm = h24 < 12 ? 'AM' : 'PM';
    var h12 = h24 % 12;
    if (h12 === 0) h12 = 12;

    // "8:15:04" — hours:minutes in neutral bone, seconds in amber.
    digitsEl.textContent = h12 + ':' + pad2(now.getMinutes());
    secondsEl.textContent = pad2(now.getSeconds());
    ampmEl.textContent = ampm;

    // Date: "Thursday, December 15 2022"
    dateEl.textContent = DAYS[now.getDay()] + ', ' +
      MONTHS[now.getMonth()] + ' ' +
      now.getDate() + ' ' +
      now.getFullYear();

    updateCountdownsAndAmbience();

    // Faint screensaver clock: time + next event in dark tones (idea 17).
    if (faintclockEl) {
      var nx = getNext();
      faintclockEl.innerHTML = '<span class="fc-time">' + h12 + ':' + pad2(now.getMinutes()) + ' ' + ampm + '</span>' +
        (nx ? '<span class="fc-next">next · ' + stringify(nx.title) + '</span>' : '');
    }

    // Subtle pop on the minute change (idea 20).
    var minKey = pad2(h24) + pad2(now.getMinutes());
    if (minKey !== lastMinuteKey) { lastMinuteKey = minKey; triggerClockFade(); }

    // Soft rollover at midnight (idea 1): fade + refresh so "today" shifts gracefully.
    var todayKey = dayKey(now);
    if (todayKey !== lastDayKeyShift) {
      lastDayKeyShift = todayKey;
      stageFade();
      refreshCalendar();
    }
    // Accent the date row on special/game days (idea 7).
    if (dateEl) dateEl.classList.toggle('is-special', !!SPECIAL_DAYS[todayKey]);
  }

  // Soft full-screen fade used on the midnight day-shift (idea 1).
  function stageFade() {
    var st = document.querySelector('.stage');
    if (!st) return;
    st.classList.remove('day-shift');
    void st.offsetWidth;
    st.classList.add('day-shift');
  }

  function updateCountdownsAndAmbience() {
    renderCountdowns();
    updateAmbience(new Date());
  }

  function startClock() {
    updateClock();
    setTimeout(function tick() {
      updateClock();
      setTimeout(tick, 1000 - (Date.now() % 1000));
    }, 1000 - (Date.now() % 1000));
  }

  /* ----------------------------------------------------------
     Calendar — fetch .ics via same-origin proxy, parse with
     ical.js, then render events grouped by day (a daily calendar).
     ---------------------------------------------------------- */

  // 12-hour time label for an event, e.g. "8:15 PM".
  function fmtTime(d, withSec) {
    var h = d.getHours();
    var ampm = h < 12 ? 'AM' : 'PM';
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return h12 + ':' + pad2(d.getMinutes()) + (withSec ? ':' + pad2(d.getSeconds()) : '') +
      ' <span class="ampm">' + ampm + '</span>';
  }

  // "Aug 15" style date for day headers.
  function shortDate(d) {
    return MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate();
  }

  // Local YYYY-MM-DD key so we group by the user's actual calendar day.
  function dayKey(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  // Whole days until a target date (rolls to next year if it passed this year).
  function daysUntil(m, d) {
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var target = new Date(now.getFullYear(), m - 1, d);
    if (target < today) target = new Date(now.getFullYear() + 1, m - 1, d);
    return Math.round((target - today) / 86400000);
  }

  // Bottom-left "days left" chip experiment: a row of upcoming dates.
  var DATE_CHIPS = [
    [8, 31, 'Aug 31'], [9, 28, 'Sep 28'], [10, 8, 'Oct 8'],
    [11, 14, 'Nov 14'], [11, 26, 'Nov 26'], [12, 25, 'Dec 25']
  ];
  var activeChipIndex = 0;
  var NEWS_REFRESH_MS = 20 * 60 * 1000;

  function sortedChips() {
    return DATE_CHIPS.map(function (c, idx) {
      return { idx: idx, chip: c, days: daysUntil(c[0], c[1]) };
    }).sort(function (a, b) { return a.days - b.days; });
  }

  function renderCountdowns() {
    if (!milestonesEl) return;
    var key = dayKey(new Date());
    if (key === lastCountdownDayKey && milestonesEl.querySelector('.milestone-btn')) return;
    lastCountdownDayKey = key;

    var sorted = sortedChips();
    if (!sorted.length) {
      milestonesEl.innerHTML = '';
      return;
    }
    if (activeChipIndex >= sorted.length) activeChipIndex = 0;
    var current = sorted[activeChipIndex];
    var c = current.chip;
    var d = current.days;
    milestonesEl.innerHTML =
      '<button type="button" class="milestone-btn" tabindex="0" aria-label="Important date, click to change">' +
        '<span class="ms-num">' + d + '</span>' +
        '<span class="ms-label">days · ' + escH(c[2]) + '</span>' +
        '<span class="ms-hint" aria-hidden="true">▾</span>' +
      '</button>';
  }

  function cycleMilestone() {
    var sorted = sortedChips();
    if (!sorted.length) return;
    activeChipIndex = (activeChipIndex + 1) % sorted.length;
    lastCountdownDayKey = '';
    renderCountdowns();
  }

  function setupChips() {
    if (!milestonesEl) return;
    milestonesEl.addEventListener('click', function (ev) {
      if (ev.target.closest('.milestone-btn')) cycleMilestone();
    });
    milestonesEl.addEventListener('keydown', function (ev) {
      if (!(ev.key === 'Enter' || ev.key === ' ' || ev.key === 'OK')) return;
      if (ev.target.closest('.milestone-btn')) {
        ev.preventDefault();
        cycleMilestone();
      }
    });
  }

  // Time-of-day ambience (ideas 2, 5, 6, 12): warm evening, deep sleep dim,
  // tinted by the REAL local sunrise/sunset when we have it.
  function updateAmbience(now) {
    var h = now.getHours() + now.getMinutes() / 60;
    var theme;
    if (h < 6) theme = 'sleep';
    else if (SUN.rise && SUN.set) {
      var hr = SUN.rise.getHours() + SUN.rise.getMinutes() / 60;
      var hs = SUN.set.getHours() + SUN.set.getMinutes() / 60;
      if (h >= hs) theme = (h >= hs + 1) ? 'night' : 'evening';
      else if (h < hr) theme = 'night';
      else theme = 'day';
    } else {
      theme = (h >= 18 && h < 22.5) ? 'evening' : (h >= 22.5) ? 'night' : 'day';
    }
    if (htmlEl.getAttribute('data-theme') !== theme) htmlEl.setAttribute('data-theme', theme);
    htmlEl.classList.toggle('rain', !!RAINY);   // wet-day blues (idea 10)
  }

  // Minimal relative-time helper, e.g. "2h 14m".
  function relTime(ms) {
    var sec = Math.floor(ms / 1000);
    if (sec < 60) return Math.max(sec, 1) + 's';
    var min = Math.floor(sec / 60);
    if (min < 60) return min + 'm';
    return Math.floor(min / 60) + 'h ' + (min % 60) + 'm';
  }

  // First upcoming event from the last merged schedule (for faintclock + Next-up).
  function getNext() {
    if (!lastEvents || !lastEvents.length) return null;
    var now = Date.now();
    for (var i = 0; i < lastEvents.length; i++) {
      if (lastEvents[i].startMs > now) return lastEvents[i];
    }
    return null;
  }

  // Live "Next up" line (idea 9) under the clock.
  function updateNextUp() {
    if (!nextupEl) return;
    if (!lastEvents || !lastEvents.length) { nextupEl.textContent = ''; return; }
    var now = Date.now();
    var next = null;
    for (var i = 0; i < lastEvents.length; i++) {
      if (lastEvents[i].startMs > now) { next = lastEvents[i]; break; }
    }
    if (!next) { nextupEl.textContent = ''; nextupEl.classList.remove('nx-soon'); return; }
    nextupEl.innerHTML = '<span class="nx-label">Next</span>' +
      '<span class="nx-title">' + stringify(next.title) + '</span>' +
      '<span class="nx-in">' + relTime(next.startMs - now) + '</span>';
    nextupEl.classList.toggle('nx-soon', (next.startMs - now) <= 10 * 60000); // idea 4
  }

  // Clock-fade on the minute/date change (idea 20) — opacity/transform only.
  function triggerClockFade() {
    var t = document.querySelector('.clock .time');
    if (!t) return;
    t.classList.remove('changing');
    void t.offsetWidth;                 // restart the animation
    t.classList.add('changing');
  }

  // Faint idle screensaver (idea 17): auto-dim after inactivity.
  var idleLastActivity = Date.now();
  function idleReset() {
    idleLastActivity = Date.now();
    htmlEl.classList.remove('screen-save');
    if (window.fully && fully.stopScreensaver) { try { fully.stopScreensaver(); } catch (e) {} }
  }
  ['keydown', 'pointermove', 'mousedown', 'touchstart', 'click'].forEach(function (ev) {
    if (window.addEventListener) window.addEventListener(ev, idleReset);
  });
  setInterval(function () {
    if (Date.now() - idleLastActivity > IDLE_SCREENSAVER_MS) {
      htmlEl.classList.add('screen-save');
      // Best effort: let Fully Kiosk Browser blank/off the panel too.
      if (window.fully && fully.startScreensaver) { try { fully.startScreensaver(''); } catch (e) {} }
    }
  }, 20 * 1000);

  // Weather (idea 7) — free Open-Meteo, no key; fails silent like feeds.
  function weatherUrl() {
    return '/weather?lat=' + encodeURIComponent(WEATHER_LOC.lat) +
      '&lon=' + encodeURIComponent(WEATHER_LOC.lon);
  }

  function readWeatherCache() {
    try {
      var raw = localStorage.getItem(WEATHER_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeWeatherCache(data) {
    try {
      localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data: data }));
    } catch (e) {}
  }

  function rainStats(hly) {
    var stats = { now: 0, max: 0, timeLabel: '' };
    if (!hly || !hly.time || !hly.precipitation_probability) return stats;
    var rainNow = Date.now();
    for (var i = 0; i < hly.time.length; i++) {
      var hrMs = new Date(hly.time[i]).getTime();
      var prob = hly.precipitation_probability[i] || 0;
      if (Math.abs(hrMs - rainNow) < 50 * 60000) stats.now = Math.max(stats.now, prob);
      if (hrMs - rainNow > 6 * 3600000) break;
      if (hrMs >= rainNow) {
        if (prob >= 35 && !stats.timeLabel) {
          var rt = new Date(hrMs);
          stats.timeLabel = (rt.getHours() % 12 || 12) + ' ' + (rt.getHours() < 12 ? 'AM' : 'PM');
        }
        if (prob > stats.max) stats.max = prob;
      }
    }
    if (!stats.now && stats.max) stats.now = stats.max;
    return stats;
  }

  function renderWeatherData(d, fromCache) {
    if (!weatherEl || !d) return false;
    var cur = d.current || {};
    if (cur.temperature_2m == null || isNaN(cur.temperature_2m)) return false;

    var daily = d.daily || {};
    if (daily.sunrise && daily.sunset && daily.sunrise[0] && daily.sunset[0]) {
      SUN.rise = new Date(daily.sunrise[0]);
      SUN.set = new Date(daily.sunset[0]);
    }

    var t = Math.round(cur.temperature_2m);
    var code = cur.weather_code;
    var desc = WMO[code] || '—';
    var icon = EMOJI[code] || '🌡️';
    var hi = daily.temperature_2m_max ? Math.round(daily.temperature_2m_max[0]) : '–';
    var lo = daily.temperature_2m_min ? Math.round(daily.temperature_2m_min[0]) : '–';
    var fe = (cur.apparent_temperature != null) ? Math.round(cur.apparent_temperature) : null;
    var rain = rainStats(d.hourly || {});
    var rainPct = Math.round(rain.now || rain.max || 0);
    var rainClass = 'w-rain';
    if (rainPct >= 50 || rain.timeLabel) rainClass += ' w-rain-alert';

    RAINY = !!(code >= 51) || rainPct >= 50;

    weatherEl.innerHTML =
      '<div class="weather-card' + (fromCache ? ' is-cached' : '') + '">' +
        '<div class="w-row w-row-top">' +
          '<span class="w-icon">' + icon + '</span>' +
          '<span class="w-temp">' + t + '°</span>' +
          '<span class="w-desc">' + desc + '</span>' +
        '</div>' +
        '<div class="w-row w-row-bottom">' +
          (fe != null ? '<span class="w-fl">Feels ' + fe + '°</span>' : '') +
          '<span class="w-hilo">H ' + hi + '° · L ' + lo + '°</span>' +
          '<span class="' + rainClass + '">☂ ' + rainPct + '%' +
            (rain.timeLabel && rainPct >= 35 ? ' ~' + rain.timeLabel : '') + '</span>' +
        '</div>' +
      '</div>';
    return true;
  }

  function showWeatherUnavailable() {
    if (!weatherEl) return;
    var cached = readWeatherCache();
    if (cached && cached.data && renderWeatherData(cached.data, true)) return;
    weatherEl.innerHTML = '<span class="w-unavail">Weather unavailable</span>';
  }

  async function fetchWeather(isRetry) {
    if (!weatherEl) return;
    try {
      var r = await fetch(weatherUrl());
      if (!r.ok) throw new Error('weather_http_' + r.status);
      var d = await r.json();
      if (!renderWeatherData(d, false)) throw new Error('weather_invalid_payload');
      writeWeatherCache(d);
      if (weatherRetryTimer) {
        clearTimeout(weatherRetryTimer);
        weatherRetryTimer = null;
      }
    } catch (e) {
      if (!isRetry) {
        weatherRetryTimer = setTimeout(function () { fetchWeather(true); }, 10000);
      }
      showWeatherUnavailable();
    }
  }

  async function fetchNews() {
    if (!newsTrackEl) return;
    try {
      var r = await fetch('/news', { cache: 'no-store' });
      if (!r.ok) throw new Error('news_http');
      var text = await r.text();
      var doc = new DOMParser().parseFromString(text, 'text/xml');
      var titles = [];
      doc.querySelectorAll('item title').forEach(function (node) {
        var title = (node.textContent || '').trim();
        if (title) titles.push(title);
      });
      if (!titles.length) throw new Error('news_empty');
      var items = titles.slice(0, 14).map(function (title) {
        return '<span class="news-item">' + escH(title) + '</span>';
      }).join('<span class="news-dot"> · </span>');
      newsTrackEl.innerHTML = items + '<span class="news-dot"> · </span>' + items;
      newsTrackEl.classList.remove('is-static');
    } catch (e) {
      newsTrackEl.textContent = 'News headlines unavailable';
      newsTrackEl.classList.add('is-static');
    }
  }

  // Scheduled Night Mode / Deep Dim (11 PM - 6:30 AM)
  var nightAwakeUntil = 0;
  function wakeNightMode() {
    nightAwakeUntil = Date.now() + 2 * 60 * 1000; // wake for 2 minutes on remote activity
    document.body.classList.remove('night-mode');
  }
  ['keydown', 'pointerdown', 'mousedown', 'click'].forEach(function (ev) {
    window.addEventListener(ev, wakeNightMode);
  });

  function updateNightMode() {
    var now = new Date();
    var h = now.getHours() + now.getMinutes() / 60;
    var isNight = (h >= 23 || h < 6.5);
    if (isNight && Date.now() > nightAwakeUntil) {
      document.body.classList.add('night-mode');
    } else {
      document.body.classList.remove('night-mode');
    }
  }

  // "Now" marker on today (idea 1): highlight the active slot, dim the past.
  // "Now" marker + practice progress bar (ideas 1 + 13).
  function updateNowMark() {
    if (!eventsEl) return;
    var now = Date.now();
    var shell = eventsEl.querySelector('.day-shell.is-today');
    if (!shell) return;
    var items = Array.prototype.slice.call(shell.querySelectorAll('.tl-block, li.event'));
    var starts = [];
    items.forEach(function (li) {
      var s = parseInt(li.getAttribute('data-start'), 10);
      if (isNaN(s)) return;
      var titleEl = li.querySelector('.event-title') || li.querySelector('.tl-title');
      starts.push({ s: s, li: li, title: (titleEl || {}).textContent || '' });
    });
    starts.sort(function (a, b) { return a.s - b.s; });

    var activeIdx = -1;
    for (var i = 0; i < starts.length; i++) {
      var endMs = (i + 1 < starts.length) ? starts[i + 1].s : starts[i].s + HOUR_MS;
      var active = starts[i].s <= now && now < endMs;
      starts[i].li.classList.toggle('is-now', active);
      starts[i].li.classList.toggle('is-past', endMs <= now);
      if (active) activeIdx = i;
    }

    // Practice / current-slot progress bar (idea 13).
    var prog = shell.querySelector('.slot-progress');
    var fill = shell.querySelector('.slot-progress-fill');
    var label = shell.querySelector('.slot-progress-label');
    if (prog && activeIdx >= 0) {
      var cur = starts[activeIdx];
      var end = (activeIdx + 1 < starts.length) ? starts[activeIdx + 1].s : cur.s + HOUR_MS;
      var pct = Math.max(0, Math.min(100, ((now - cur.s) * 100) / Math.max(1, end - cur.s)));
      if (fill) fill.style.width = pct + '%';
      if (label) label.textContent = (cur.title || '') + ' · ' + Math.round(pct) + '%';
      prog.style.opacity = '1';
    } else if (prog) {
      // No active session: show today's overall progress so the bar never vanishes.
      var ds = new Date(); ds.setHours(0, 0, 0, 0);
      var de = new Date(ds); de.setDate(ds.getDate() + 1);
      var dp = Math.max(0, Math.min(100, ((Date.now() - ds.getTime()) * 100) / Math.max(1, de.getTime() - ds.getTime())));
      if (fill) fill.style.width = dp + '%';
      if (label) label.textContent = 'Day · ' + Math.round(dp) + '%';
      prog.style.opacity = '1';
    }
  }

  function clearEvents() {
    eventsEl.innerHTML = '';
  }

  function emptyState(message) {
    clearEvents();
    var div = document.createElement('div');
    div.className = 'event-list-status';
    div.textContent = message;
    eventsEl.appendChild(div);
  }

  function setStatus(text) {
    var s = document.getElementById('sync-status');
    if (s) s.textContent = text || '';
  }
  // Pick the calendar presentation: 'timeline' (hero+rail) or 'compact' (classic).
  // Revert via Settings -> Calendar style.
  function applyStyleMode() {
    if (!eventsEl) return;
    var cols = DAYS_AHEAD + 1;
    var mode = (UI_STYLE === 'timeline' && cols <= 5) ? 'timeline' : 'compact';
    eventsEl.setAttribute('data-mode', mode);
  }

  // Classify an event title for subtle per-kind color coding.
  function classifyCat(title) {
    var t = String(title).toLowerCase();
    if (/reslife/.test(t)) return 'reslife';
    if (/(practice|scrimmage|lift|taping|drill|walk-?thru)/.test(t)) return 'practice';
    if (/(breakfast|lunch|dinner)/.test(t)) return 'meal';
    return 'meeting';
  }

  function formatDuration(ms) {
    var m = Math.round(ms / 60000);
    if (m < 1) return '';
    var h = Math.floor(m / 60), mm = m % 60;
    if (h && mm) return h + 'h ' + mm + 'm';
    if (h) return h + 'h';
    return mm + 'm';
  }
  function fmtShort(d) {
    var h = d.getHours(), ap = h < 12 ? 'AM' : 'PM';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ':' + pad2(d.getMinutes()) + ' ' + ap;
  }

  function buildEventNode(ev, i, list) {
    var li = document.createElement('li');
    li.className = 'event';
    li.setAttribute('data-cat', classifyCat(ev.title));
    li.setAttribute('data-start', String(ev.startMs)); // for the "now" marker

    var when = document.createElement('span');
    when.className = 'event-when';

    var title = document.createElement('span');
    title.className = 'event-title';
    title.textContent = ev.title || '(no title)';

    if (ev.isAllDay) {
      var badge = document.createElement('span');
      badge.className = 'event-all-day';
      badge.textContent = 'All day';
      when.appendChild(badge);
    } else {
      when.innerHTML = fmtTime(new Date(ev.startMs));
      // Duration to the next event in this column (shown only in timeline view).
      if (list && i + 1 < list.length) {
        var next = list[i + 1];
        if (next && !next.isAllDay) {
          var durMs = next.startMs - ev.startMs;
          if (durMs > 0 && durMs < 20 * HOUR_MS) {
            var dur = document.createElement('span');
            dur.className = 'event-dur';
            dur.textContent = '· ' + formatDuration(durMs);
            when.appendChild(dur);
          }
        }
      }
    }

    li.appendChild(when);
    li.appendChild(title);
    return li;
  }

  // Render events date-grouped: each day has a header (Today / Tomorrow /
  // Weekday + date) with that day's events beneath, like a calendar.
  function renderCalendar(groups) {
    applyStyleMode();
    clearEvents();

    if (!groups.length) {
      emptyState('No upcoming events');
      return;
    }

    var tlMode = (UI_STYLE === 'timeline') && (eventsEl.getAttribute('data-mode') === 'timeline');

    groups.forEach(function (g, gi) {
      var isToday = (g.label === 'Today');

      // Special-day accent (idea 4) — from the SPECIAL_DAYS map.
      var dayKeyStr = dayKey(new Date(g.startMs));
      var special = SPECIAL_DAYS[dayKeyStr];

      // Outer shell (Double-Bezel: glass plate in a machined tray)
      var shell = document.createElement('div');
      var role = '';
      if (tlMode) {
        if (isToday) role = 'col-hero';
        else if (gi === 1) role = 'col-next';
        else if (gi === 2) role = 'col-prev';
        else if (!g.events.length) role = 'col-ghost';
        else role = 'col-far';
      }
      shell.className = (isToday ? 'day-shell is-today' : 'day-shell') +
        (special ? ' is-special' : '') +
        (g.events.length === 0 ? ' is-empty' : '') +
        (role ? ' ' + role : '');

      // Inner core (the actual content container)
      var core = document.createElement('div');
      core.className = 'day-core';

      var header = document.createElement('div');
      header.className = 'day-header';

      var name = document.createElement('span');
      name.className = 'day-name';
      name.textContent = g.label || g.name;

      var count = document.createElement('span');
      count.className = 'day-count';
      count.textContent = g.events.length + (g.events.length === 1 ? ' event' : ' events');

      var d = new Date(g.startMs);
      var dat = document.createElement('span');
      dat.className = 'day-date';
      dat.textContent = DAYS[d.getDay()] + ', ' + shortDate(d);

      // First row: day label + event count; date sits beneath.
      var row = document.createElement('div');
      row.className = 'row';
      row.appendChild(name);
      row.appendChild(count);

      header.appendChild(row);
      header.appendChild(dat);
      if (special) {
        var flag = document.createElement('span');
        flag.className = 'day-flag';
        flag.textContent = special;
        header.appendChild(flag);
      }

      var ul = document.createElement('ul');
      ul.className = 'events';
      g.events.forEach(function (ev, i) {
        ul.appendChild(buildEventNode(ev, i, g.events));
      });
      core.appendChild(ul);
      if (isToday) {
        var prog = document.createElement('div');
        prog.className = 'slot-progress';
        prog.innerHTML = '<div class="slot-progress-fill" id="slot-progress-fill"></div><span class="slot-progress-label" id="slot-progress-label"></span>';
        core.insertBefore(prog, ul);
      }
      shell.appendChild(core);
      shell.classList.add('reveal');
      shell.style.transitionDelay = (120 * gi) + 'ms';
      eventsEl.appendChild(shell);
    });

    try {
      var todayShell = eventsEl.querySelector('.day-shell.is-today');
      if (todayShell) todayShell.scrollIntoView();
    } catch (e) {}
  }

  async function fetchCalendar(url) {
    try {
      var res = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'text/calendar, */*' },
        cache: 'no-store'
      });
      if (!res.ok) return null;
      return await res.text();
    } catch (e) {
      return null;
    }
  }

  function buildWindowGroups(todayKey, tomorrowKey, map) {
    var groups = [];
    var today00 = new Date(); today00.setHours(0, 0, 0, 0);
    for (var wi = 0; wi <= DAYS_AHEAD && wi < 20; wi++) {
      var wd = new Date(today00); wd.setDate(today00.getDate() + wi);
      var wk = dayKey(wd);
      var wg = (map || {})[wk];
      var wlabel = (wk === todayKey) ? 'Today'
                 : (wk === tomorrowKey) ? 'Tomorrow'
                 : DAYS[wd.getDay()];
      groups.push({ label: wlabel, name: DAYS[wd.getDay()], startMs: wg ? wg.startMs : wd.getTime(), events: wg ? wg.events : [] });
    }
    return groups;
  }

  async function refreshCalendar() {
    if (!window.ICAL) { setTimeout(refreshCalendar, 500); return; }
    if (!CALENDAR_URLS.length) { emptyState('No calendar configured'); setStatus('Add feeds'); return; }

    try {
      var icsTexts = await Promise.all(CALENDAR_URLS.map(fetchCalendar));
      var allVevents = [];

      icsTexts.forEach(function (icsText) {
        if (!icsText) return;
        if (!/BEGIN:VCALENDAR/i.test(icsText.slice(0, 400))) return;
        try {
          var comp = new ICAL.Component(ICAL.parse(icsText));
          allVevents = allVevents.concat(comp.getAllSubcomponents('vevent'));
        } catch (e) {}
      });

      var now = Date.now();
      var events = [];

      allVevents.forEach(function (ve) {
        var start = ve.getFirstPropertyValue('dtstart');
        if (!start) return;

        var startDate = start.toJSDate();
        var startMs = startDate.getTime();

        var endProp = ve.getFirstPropertyValue('dtend');
        var endMs = endProp ? endProp.toJSDate().getTime()
                            : (start.isDate ? startMs + 24 * HOUR_MS : startMs + HOUR_MS);
        if (endMs < now) return;

        var startDay = new Date(startDate);
        startDay.setHours(0, 0, 0, 0);
        var floorNow = new Date(now);
        floorNow.setHours(0, 0, 0, 0);
        if ((startDay - floorNow) / HOUR_MS > DAYS_AHEAD * 24) return;

        var title = stringify(ve.getFirstPropertyValue('summary'));
        if (!!start.isDate && /(football|camp)/i.test(title)) return;
        if (!shouldKeepFeedEvent(title)) return;

        events.push({
          startMs: startMs,
          isAllDay: !!start.isDate,
          title: title
        });
      });

      mergeStatic(events, now);
      events.sort(function (a, b) { return a.startMs - b.startMs; });
      lastEvents = events;

      var map = {};
      var order = [];
      events.forEach(function (ev) {
        var k = dayKey(new Date(ev.startMs));
        if (!map[k]) {
          map[k] = { key: k, startMs: ev.startMs, events: [] };
          order.push(k);
        }
        if (map[k].events.length < MAX_PER_DAY) map[k].events.push(ev);
      });

      var today = new Date();
      var todayKey = dayKey(today);
      var tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      var tomorrowKey = dayKey(tomorrow);

      var groups = buildWindowGroups(todayKey, tomorrowKey, map);

      applyStyleMode();
      renderCalendar(groups);
      try { updateNowMark(); } catch (err) {}
      setStatus('Calendars synced.');
    } catch (err) {
      var elx = document.getElementById('nextup');
      if (elx) elx.textContent = 'ERR: ' + (err && err.message ? err.message : err);
      var _n = new Date(); var _t2 = new Date(_n); _t2.setDate(_n.getDate() + 1);
      try { renderCalendar(buildWindowGroups(dayKey(_n), dayKey(_t2), null)); }
      catch (e2) { emptyState('Calendar unavailable'); }
    }
  }

  function fitScreen() {}

  function loadUserConfig() {
    function applyConfig(u) {
      if (!u) return;
      var todayStr = dayKey(new Date());
      if (Array.isArray(u.chips) && u.chips.length) {
        DATE_CHIPS = u.chips.slice();
        activeChipIndex = 0;
        lastCountdownDayKey = '';
      }
      if (u.specialDays) {
        for (var k in u.specialDays) {
          if (k >= todayStr) SPECIAL_DAYS[k] = u.specialDays[k];
        }
      }
      if (u.events) {
        var cleanEv = {};
        for (var d in u.events) {
          if (d >= todayStr) cleanEv[d] = u.events[d];
        }
        USER_EVENTS = cleanEv;
      }
      if (u.days && !isNaN(+u.days)) DAYS_AHEAD = Math.max(1, Math.round(+u.days) - 1);
      if (u.style === 'timeline' || u.style === 'compact') UI_STYLE = u.style;
      if (u.weather && u.weather.lat != null && u.weather.lon != null) {
        WEATHER_LOC = {
          lat: +u.weather.lat,
          lon: +u.weather.lon,
          label: u.weather.label || WEATHER_LOC.label || ''
        };
      }
      renderCountdowns();
      refreshCalendar();
      fetchWeather();
    }
    if (window.FireClockBridge && window.FireClockBridge.getUserConfig) {
      try {
        var raw = window.FireClockBridge.getUserConfig();
        applyConfig(JSON.parse(raw));
        return;
      } catch (e) {}
    }
    fetch('/user.json', { cache: 'no-store' }).then(function (r) {
      return r.ok ? r.json() : Promise.reject();
    }).then(applyConfig).catch(function () {});
  }

  function escH(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function settingsMsg(m) { var x = document.getElementById('settingsMsg'); if (x) x.textContent = m || ''; }
  function settingsRow(label, onDel) {
    var r = document.createElement('div'); r.className = 'row';
    var sp = document.createElement('span'); sp.textContent = label;
    var b = document.createElement('button'); b.textContent = '\u00d7'; b.onclick = onDel;
    r.appendChild(sp); r.appendChild(b); return r;
  }
  function closeSettings() { if (settingsEl) { settingsEl.hidden = true; settingsEl.innerHTML = ''; } }

  // Gear -> settings editor
  function openSettings() {
    if (!settingsEl) return;
    function fetchConfig() {
      if (window.FireClockBridge && window.FireClockBridge.getUserConfig) {
        try {
          return Promise.resolve(JSON.parse(window.FireClockBridge.getUserConfig()));
        } catch (e) {}
      }
      return fetch('/api/', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('load'); return r.json(); });
    }

    function fetchAutoStart() {
      if (window.FireClockBridge && window.FireClockBridge.getAutoStartConfig) {
        try {
          return JSON.parse(window.FireClockBridge.getAutoStartConfig());
        } catch (e) {}
      }
      return { enabled: true, days: 'all', window: 'anytime', alarmEnabled: true, alarmHour: 6, alarmMinute: 50 };
    }

    fetchConfig().then(function (cfg) {
      var sd = cfg.specialDays || {};
      var ev = cfg.events || {};
      var chips = (cfg.chips && cfg.chips.length) ? cfg.chips.slice() : DATE_CHIPS.slice();
      var autoStart = fetchAutoStart();
      var todayStr = dayKey(new Date());

      Object.keys(sd).forEach(function (k) {
        if (k < todayStr) delete sd[k];
      });
      Object.keys(ev).forEach(function (d) {
        if (d < todayStr) delete ev[d];
      });

      settingsEl.innerHTML = ''; settingsEl.hidden = false;
      var card = document.createElement('div');
      card.className = 'settings-card';
      card.setAttribute('tabindex', '0');

      var hd = document.createElement('div');
      hd.className = 'settings-head';
      hd.textContent = 'FireClock Settings (v' + getAppVersion() + ')';
      card.appendChild(hd);

      // --- Quick Actions Bar at Top ---
      var topAct = document.createElement('div');
      topAct.className = 'settings-actions top-actions';
      var saveBtn = document.createElement('button');
      saveBtn.id = 'cfgSave';
      saveBtn.className = 'primary';
      saveBtn.textContent = 'Save Changes';

      var updateBtn = document.createElement('button');
      updateBtn.id = 'cfgUpdate';
      updateBtn.textContent = 'Check for Updates';

      var clsBtn = document.createElement('button');
      clsBtn.id = 'cfgClose';
      clsBtn.textContent = 'Close';

      topAct.appendChild(saveBtn);
      topAct.appendChild(updateBtn);
      topAct.appendChild(clsBtn);
      card.appendChild(topAct);

      var msg = document.createElement('div');
      msg.id = 'settingsMsg';
      card.appendChild(msg);

      // --- Auto-Start on TV Power Section ---
      var asSec = document.createElement('section');
      asSec.className = 'settings-section';
      var asTitle = document.createElement('h3');
      asTitle.textContent = 'Auto-Start on TV Power';
      asSec.appendChild(asTitle);

      var asEnableRow = document.createElement('div');
      asEnableRow.className = 'addrow';
      var asEnableSpan = document.createElement('span');
      asEnableSpan.textContent = 'Auto-Launch:';
      var asEnableSel = document.createElement('select');
      asEnableSel.id = 'cfgAutoStartEnabled';
      [
        { val: 'true', label: 'Enabled (Launch on Power)' },
        { val: 'false', label: 'Disabled' }
      ].forEach(function (opt) {
        var o = document.createElement('option');
        o.value = opt.val;
        o.textContent = opt.label;
        if (String(autoStart.enabled) === opt.val) o.selected = true;
        asEnableSel.appendChild(o);
      });
      asEnableRow.appendChild(asEnableSpan);
      asEnableRow.appendChild(asEnableSel);
      asSec.appendChild(asEnableRow);

      var asDaysRow = document.createElement('div');
      asDaysRow.className = 'addrow';
      asDaysRow.style.marginTop = '8px';
      var asDaysSpan = document.createElement('span');
      asDaysSpan.textContent = 'Active Days:';
      var asDaysSel = document.createElement('select');
      asDaysSel.id = 'cfgAutoStartDays';
      [
        { val: 'all', label: 'Every Day (Mon – Sun)' },
        { val: 'weekdays', label: 'Weekdays Only (Mon – Fri)' },
        { val: 'weekends', label: 'Weekends Only (Sat – Sun)' },
        { val: 'mon', label: 'Monday Only' },
        { val: 'tue', label: 'Tuesday Only' },
        { val: 'wed', label: 'Wednesday Only' },
        { val: 'thu', label: 'Thursday Only' },
        { val: 'fri', label: 'Friday Only' }
      ].forEach(function (opt) {
        var o = document.createElement('option');
        o.value = opt.val;
        o.textContent = opt.label;
        if ((autoStart.days || 'all') === opt.val) o.selected = true;
        asDaysSel.appendChild(o);
      });
      asDaysRow.appendChild(asDaysSpan);
      asDaysRow.appendChild(asDaysSel);
      asSec.appendChild(asDaysRow);

      var asWinRow = document.createElement('div');
      asWinRow.className = 'addrow';
      asWinRow.style.marginTop = '8px';
      var asWinSpan = document.createElement('span');
      asWinSpan.textContent = 'Time Trigger:';
      var asWinSel = document.createElement('select');
      asWinSel.id = 'cfgAutoStartWindow';
      [
        { val: 'anytime', label: 'Anytime (Always on Boot)' },
        { val: 'before_9am', label: 'Before 9:00 AM' },
        { val: 'morning_6_9', label: 'Morning (6:00 AM – 9:00 AM)' },
        { val: 'morning_6_10', label: 'Morning (6:00 AM – 10:00 AM)' },
        { val: 'before_10am', label: 'Before 10:00 AM' },
        { val: 'before_12pm', label: 'Before 12:00 PM (Noon)' }
      ].forEach(function (opt) {
        var o = document.createElement('option');
        o.value = opt.val;
        o.textContent = opt.label;
        if ((autoStart.window || 'anytime') === opt.val) o.selected = true;
        asWinSel.appendChild(o);
      });
      asWinRow.appendChild(asWinSpan);
      asWinRow.appendChild(asWinSel);
      asSec.appendChild(asWinRow);

      var asAlarmEnableRow = document.createElement('div');
      asAlarmEnableRow.className = 'addrow';
      asAlarmEnableRow.style.marginTop = '8px';
      var asAlarmEnableSpan = document.createElement('span');
      asAlarmEnableSpan.textContent = 'Daily Launch Alarm:';
      var asAlarmEnableSel = document.createElement('select');
      asAlarmEnableSel.id = 'cfgAutoStartAlarmEnabled';
      [
        { val: 'true', label: 'Enabled' },
        { val: 'false', label: 'Disabled' }
      ].forEach(function (opt) {
        var o = document.createElement('option');
        o.value = opt.val;
        o.textContent = opt.label;
        if (String(autoStart.alarmEnabled !== false) === opt.val) o.selected = true;
        asAlarmEnableSel.appendChild(o);
      });
      asAlarmEnableRow.appendChild(asAlarmEnableSpan);
      asAlarmEnableRow.appendChild(asAlarmEnableSel);
      asSec.appendChild(asAlarmEnableRow);

      var asAlarmTimeRow = document.createElement('div');
      asAlarmTimeRow.className = 'addrow';
      asAlarmTimeRow.style.marginTop = '8px';
      var asAlarmTimeSpan = document.createElement('span');
      asAlarmTimeSpan.textContent = 'Daily Launch Time:';
      var asAlarmHourSel = document.createElement('select');
      asAlarmHourSel.id = 'cfgAutoStartAlarmHour';
      for (var ah = 0; ah < 24; ah++) {
        var hOpt = document.createElement('option');
        hOpt.value = String(ah);
        var h12 = ah % 12 || 12;
        hOpt.textContent = h12 + ':00 ' + (ah < 12 ? 'AM' : 'PM');
        if ((autoStart.alarmHour != null ? autoStart.alarmHour : 6) === ah) hOpt.selected = true;
        asAlarmHourSel.appendChild(hOpt);
      }
      var asAlarmMinSel = document.createElement('select');
      asAlarmMinSel.id = 'cfgAutoStartAlarmMinute';
      [0, 15, 30, 45, 50].forEach(function (m) {
        var mOpt = document.createElement('option');
        mOpt.value = String(m);
        mOpt.textContent = ':' + (m < 10 ? '0' : '') + m;
        if ((autoStart.alarmMinute != null ? autoStart.alarmMinute : 50) === m) mOpt.selected = true;
        asAlarmMinSel.appendChild(mOpt);
      });
      asAlarmTimeRow.appendChild(asAlarmTimeSpan);
      asAlarmTimeRow.appendChild(asAlarmHourSel);
      asAlarmTimeRow.appendChild(asAlarmMinSel);
      asSec.appendChild(asAlarmTimeRow);
      card.appendChild(asSec);

      // --- Weather Location Section ---
      var wxSec = document.createElement('section');
      wxSec.className = 'settings-section';
      var wxTitle = document.createElement('h3');
      wxTitle.textContent = 'Weather Location';
      wxSec.appendChild(wxTitle);

      var wx = cfg.weather || {};
      var wxCityRow = document.createElement('div');
      wxCityRow.className = 'addrow';
      var wxCitySpan = document.createElement('span');
      wxCitySpan.textContent = 'City Search:';
      var wxCityInput = document.createElement('input');
      wxCityInput.id = 'cfgWeatherCity';
      wxCityInput.type = 'text';
      wxCityInput.placeholder = 'e.g. Manchester, NH';
      wxCityInput.value = wx.label || WEATHER_LOC.label || '';
      var wxSearchBtn = document.createElement('button');
      wxSearchBtn.id = 'cfgWeatherSearch';
      wxSearchBtn.textContent = 'Search';
      wxCityRow.appendChild(wxCitySpan);
      wxCityRow.appendChild(wxCityInput);
      wxCityRow.appendChild(wxSearchBtn);
      wxSec.appendChild(wxCityRow);

      var wxCoordRow = document.createElement('div');
      wxCoordRow.className = 'addrow';
      wxCoordRow.style.marginTop = '8px';
      var wxLatInput = document.createElement('input');
      wxLatInput.id = 'cfgWeatherLat';
      wxLatInput.type = 'text';
      wxLatInput.placeholder = 'Latitude';
      wxLatInput.value = wx.lat != null ? wx.lat : WEATHER_LOC.lat;
      var wxLonInput = document.createElement('input');
      wxLonInput.id = 'cfgWeatherLon';
      wxLonInput.type = 'text';
      wxLonInput.placeholder = 'Longitude';
      wxLonInput.value = wx.lon != null ? wx.lon : WEATHER_LOC.lon;
      wxCoordRow.appendChild(wxLatInput);
      wxCoordRow.appendChild(wxLonInput);
      wxSec.appendChild(wxCoordRow);
      card.appendChild(wxSec);

      wxSearchBtn.onclick = function () {
        var q = wxCityInput.value.trim();
        if (!q) {
          settingsMsg('Enter a city name to search.');
          return;
        }
        settingsMsg('Searching weather location...');
        fetch('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(q) + '&count=1')
          .then(function (r) { return r.json(); })
          .then(function (res) {
            var hit = res && res.results && res.results[0];
            if (!hit) {
              settingsMsg('No location found for "' + q + '".');
              return;
            }
            wxLatInput.value = hit.latitude;
            wxLonInput.value = hit.longitude;
            wxCityInput.value = hit.name + (hit.admin1 ? ', ' + hit.admin1 : '');
            settingsMsg('Found: ' + wxCityInput.value);
          })
          .catch(function () {
            settingsMsg('Location search failed. Check network.');
          });
      };

      // --- Display & View Section ---
      var viewSec = document.createElement('section');
      viewSec.className = 'settings-section';
      var viewTitle = document.createElement('h3');
      viewTitle.textContent = 'Display & Layout';
      viewSec.appendChild(viewTitle);

      var sRow = document.createElement('div');
      sRow.className = 'addrow';
      var sSpan = document.createElement('span');
      sSpan.textContent = 'Calendar Style:';
      var sSel = document.createElement('select');
      sSel.id = 'cfgStyle';
      [
        { val: 'compact', label: 'Classic Columns (Double-Bezel)' },
        { val: 'timeline', label: 'Timeline / Gantt View' }
      ].forEach(function (opt) {
        var o = document.createElement('option');
        o.value = opt.val;
        o.textContent = opt.label;
        if ((cfg.style || UI_STYLE) === opt.val) o.selected = true;
        sSel.appendChild(o);
      });
      sRow.appendChild(sSpan);
      sRow.appendChild(sSel);
      viewSec.appendChild(sRow);

      var dRow = document.createElement('div');
      dRow.className = 'addrow';
      dRow.style.marginTop = '8px';
      var dSpan = document.createElement('span');
      dSpan.textContent = 'Days Shown:';
      var dSel = document.createElement('select');
      dSel.id = 'cfgDays';
      [1, 2, 3, 4, 5].forEach(function (n) {
        var o = document.createElement('option');
        o.value = n;
        o.textContent = n + ' days';
        if ((cfg.days || (DAYS_AHEAD + 1)) === n) o.selected = true;
        dSel.appendChild(o);
      });
      dRow.appendChild(dSpan);
      dRow.appendChild(dSel);
      viewSec.appendChild(dRow);
      card.appendChild(viewSec);

      // --- Countdown Milestones Section ---
      var chipSec = document.createElement('section');
      chipSec.className = 'settings-section';
      var chipTitle = document.createElement('h3');
      chipTitle.textContent = 'Milestones & Countdown Chips';
      chipSec.appendChild(chipTitle);
      var chipRows = document.createElement('div');
      chipRows.className = 'settings-list';
      chipSec.appendChild(chipRows);
      var chipAddR = document.createElement('div');
      chipAddR.className = 'addrow';
      var chipM = document.createElement('input');
      chipM.placeholder = 'Month (1-12)';
      chipM.style.maxWidth = '100px';
      var chipD = document.createElement('input');
      chipD.placeholder = 'Day (1-31)';
      chipD.style.maxWidth = '100px';
      var chipL = document.createElement('input');
      chipL.placeholder = 'Label (e.g. Sep 28)';
      var chipBtn = document.createElement('button');
      chipBtn.className = 'primary';
      chipBtn.textContent = 'Add';
      chipAddR.appendChild(chipM);
      chipAddR.appendChild(chipD);
      chipAddR.appendChild(chipL);
      chipAddR.appendChild(chipBtn);
      chipSec.appendChild(chipAddR);
      card.appendChild(chipSec);

      // --- Special Days Section ---
      var sdSec = document.createElement('section');
      sdSec.className = 'settings-section';
      var sdTitle = document.createElement('h3');
      sdTitle.textContent = 'Special Days (Accent Glow)';
      sdSec.appendChild(sdTitle);
      var sdRows = document.createElement('div');
      sdRows.className = 'settings-list';
      sdSec.appendChild(sdRows);
      var sdAddR = document.createElement('div');
      sdAddR.className = 'addrow';
      var sdDate = document.createElement('input');
      sdDate.placeholder = 'YYYY-MM-DD';
      var sdLabel = document.createElement('input');
      sdLabel.placeholder = 'Label (e.g. Game Day)';
      var sdBtn = document.createElement('button');
      sdBtn.className = 'primary';
      sdBtn.textContent = 'Add';
      sdAddR.appendChild(sdDate);
      sdAddR.appendChild(sdLabel);
      sdAddR.appendChild(sdBtn);
      sdSec.appendChild(sdAddR);
      card.appendChild(sdSec);

      // --- Custom Events Section ---
      var evSec = document.createElement('section');
      evSec.className = 'settings-section';
      var evTitle = document.createElement('h3');
      evTitle.textContent = 'Custom Events';
      evSec.appendChild(evTitle);
      var evRows = document.createElement('div');
      evRows.className = 'settings-list';
      evSec.appendChild(evRows);
      var evAddR = document.createElement('div');
      evAddR.className = 'addrow';
      var evDate = document.createElement('input');
      evDate.placeholder = 'YYYY-MM-DD';
      var evTime = document.createElement('input');
      evTime.placeholder = 'h:mm AM/PM';
      var evTt = document.createElement('input');
      evTt.placeholder = 'Title';
      var evBtn = document.createElement('button');
      evBtn.className = 'primary';
      evBtn.textContent = 'Add';
      evAddR.appendChild(evDate);
      evAddR.appendChild(evTime);
      evAddR.appendChild(evTt);
      evAddR.appendChild(evBtn);
      evSec.appendChild(evAddR);
      card.appendChild(evSec);

      // --- Feed Health Section ---
      var feedSec = document.createElement('section');
      feedSec.className = 'settings-section';
      var feedTitle = document.createElement('h3');
      feedTitle.textContent = 'Calendar Feeds Health';
      feedSec.appendChild(feedTitle);
      var feedList = document.createElement('div');
      feedList.className = 'settings-list';
      [
        'Feed 0 (Arms Athletic Calendar) – Connected',
        'Feed 1 (Football Operations) – Connected',
        'Feed 2 (Google Calendar - Lucas) – Connected',
        'Feed 3 (Google Calendar - Chloe) – Connected'
      ].forEach(function (f) {
        var row = document.createElement('div');
        row.className = 'row';
        var span = document.createElement('span');
        span.textContent = f;
        span.style.color = 'var(--fg-2)';
        row.appendChild(span);
        feedList.appendChild(row);
      });
      feedSec.appendChild(feedList);
      card.appendChild(feedSec);

      settingsEl.appendChild(card);

      function render() {
        chipRows.innerHTML = '';
        if (!chips.length) {
          var ec = document.createElement('em');
          ec.textContent = 'No milestones configured';
          chipRows.appendChild(ec);
        }
        chips.forEach(function (c, idx) {
          chipRows.appendChild(settingsRow(c[0] + '/' + c[1] + ' \u2013 ' + c[2], function () {
            chips.splice(idx, 1);
            render();
          }));
        });

        sdRows.innerHTML = '';
        var ks = Object.keys(sd).sort();
        if (!ks.length) {
          var e = document.createElement('em');
          e.textContent = 'None configured';
          sdRows.appendChild(e);
        }
        ks.forEach(function (k) {
          sdRows.appendChild(settingsRow(k + ' \u2013 ' + sd[k], function () {
            delete sd[k];
            render();
          }));
        });

        evRows.innerHTML = '';
        var dk = Object.keys(ev).sort();
        if (!dk.length) {
          var e2 = document.createElement('em');
          e2.textContent = 'None configured';
          evRows.appendChild(e2);
        }
        dk.forEach(function (d) {
          (ev[d] || []).slice().forEach(function (g, idx) {
            evRows.appendChild(settingsRow(d + ' ' + g[0] + ' ' + g[1], function () {
              ev[d].splice(idx, 1);
              if (!ev[d].length) delete ev[d];
              render();
            }));
          });
        });
      }

      chipBtn.onclick = function () {
        var m = parseInt(chipM.value.trim(), 10);
        var d = parseInt(chipD.value.trim(), 10);
        var l = chipL.value.trim();
        if (!isNaN(m) && !isNaN(d) && l) {
          chips.push([m, d, l]);
          chipM.value = ''; chipD.value = ''; chipL.value = '';
          render();
        }
      };

      sdBtn.onclick = function () {
        var d = sdDate.value.trim(), l = sdLabel.value.trim();
        if (d && l) { sd[d] = l; sdDate.value = ''; sdLabel.value = ''; render(); }
      };
      evBtn.onclick = function () {
        var d = evDate.value.trim(), t = evTime.value.trim(), ti = evTt.value.trim();
        if (d && t && ti) {
          (ev[d] = ev[d] || []).push([t, ti]);
          evDate.value = ''; evTime.value = ''; evTt.value = '';
          render();
        }
      };
      clsBtn.onclick = closeSettings;

      updateBtn.onclick = function () {
        updateBtn.disabled = true;
        settingsMsg('Checking for updates from GitHub...');
        setTimeout(function () {
          if (window.FireClockBridge && window.FireClockBridge.checkForUpdates) {
            try {
              var status = window.FireClockBridge.checkForUpdates();
              if (status === 'update_prompted') {
                settingsMsg('Update downloaded! Opening installer...');
              } else if (status === 'up_to_date') {
                settingsMsg('FireClock is up to date (v' + getAppVersion() + ')!');
              } else if (status === 'no_network') {
                settingsMsg('No network connection. Check Wi-Fi.');
              } else if (status === 'download_failed') {
                settingsMsg('Download failed. Check connection.');
              } else {
                settingsMsg('Check completed: ' + status);
              }
            } catch (err) {
              settingsMsg('Error checking updates: ' + err.message);
            }
          } else {
            fetch('https://api.github.com/repos/tapchipswipe/fireclock/releases/latest', { cache: 'no-store' })
              .then(function (r) { return r.json(); })
              .then(function (rel) {
                var tag = (rel.tag_name || '').replace(/^v/, '');
                var installed = getAppVersion();
                if (tag && tag !== installed) {
                  settingsMsg('New release available: v' + tag + ' (installed: v' + installed + ')');
                } else {
                  settingsMsg('FireClock is up to date (v' + installed + ')!');
                }
              }).catch(function () {
                settingsMsg('Could not reach GitHub.');
              });
          }
          setTimeout(function () { updateBtn.disabled = false; }, 3000);
        }, 100);
      };

      saveBtn.onclick = function () {
        var lat = parseFloat(wxLatInput.value);
        var lon = parseFloat(wxLonInput.value);
        if (isNaN(lat) || isNaN(lon)) {
          settingsMsg('Weather latitude/longitude must be valid numbers.');
          return;
        }

        var payload = {
          specialDays: sd,
          events: ev,
          chips: chips,
          days: +dSel.value,
          style: sSel.value,
          weather: {
            lat: lat,
            lon: lon,
            label: wxCityInput.value.trim() || (lat + ', ' + lon)
          }
        };
        UI_STYLE = sSel.value;
        DAYS_AHEAD = Math.max(1, Math.round(+dSel.value) - 1);
        DATE_CHIPS = chips.slice();
        WEATHER_LOC = payload.weather;

        var asPayload = {
          enabled: asEnableSel.value === 'true',
          days: asDaysSel.value,
          window: asWinSel.value,
          alarmEnabled: asAlarmEnableSel.value === 'true',
          alarmHour: parseInt(asAlarmHourSel.value, 10),
          alarmMinute: parseInt(asAlarmMinSel.value, 10)
        };

        if (window.FireClockBridge) {
          if (window.FireClockBridge.saveAutoStartConfig) {
            window.FireClockBridge.saveAutoStartConfig(JSON.stringify(asPayload));
          }
          if (window.FireClockBridge.saveUserConfig) {
            var ok = window.FireClockBridge.saveUserConfig(JSON.stringify(payload));
            if (ok) {
              settingsMsg('Saved successfully!');
              setTimeout(function () { closeSettings(); loadUserConfig(); refreshCalendar(); fetchWeather(); }, 400);
            } else {
              settingsMsg('Save failed.');
            }
            return;
          }
        }

        fetch('/api/', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(function (r) {
          return r.json();
        }).then(function (res) {
          if (res && res.ok) {
            settingsMsg('Saved successfully!');
            setTimeout(function () { closeSettings(); loadUserConfig(); refreshCalendar(); fetchWeather(); }, 400);
          } else {
            settingsMsg('Error: ' + (res && res.error || 'save failed'));
          }
        }).catch(function () {
          settingsMsg('Save failed.');
        });
      };

      card.addEventListener('focusin', function (e) {
        if (e.target && typeof e.target.scrollIntoView === 'function') {
          e.target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      });

      render();
      setTimeout(function () { sSel.focus(); }, 100);
    }).catch(function () {
      settingsMsg('Could not load config.');
    });
  }

  function init() {
    startClock();
    setupChips();
    if (gearEl) gearEl.addEventListener('click', openSettings);
    fitScreen();
    loadUserConfig();
    setTimeout(fitScreen, 300);           // re-fit after fonts/layout settle
    fetchWeather();
    fetchNews();
    refreshCalendar();
    updateNightMode();
    calTimer = setInterval(refreshCalendar, REFRESH_MS);
    setInterval(function () { updateNowMark(); updateNextUp(); updateNightMode(); }, 60 * 1000);
    setInterval(fetchWeather, 30 * 60 * 1000);
    setInterval(fetchNews, NEWS_REFRESH_MS);
  }

  window.addEventListener('beforeunload', function () {
    if (calTimer) clearInterval(calTimer);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
