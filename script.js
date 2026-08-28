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
  var UI_STYLE = 'timeline'; // 'timeline' (hero+rail) or 'compact' (classic); switch in Settings

  var clockEl = document.getElementById('clock-time');

  /* ----------------------------------------------------------
     Static camp schedule (Aug 16-30)
     Map of 'YYYY-MM-DD' -> array of [time, title] pairs.
     The itinerary is user-provided; fill the dates below, then
     deploy. Empty by default so feeds alone still render.
     ---------------------------------------------------------- */
  var STATIC_SCHEDULE = {
    '2026-08-14': [
      ['7:00 AM', 'Breakfast'], ['7:30 AM', 'Taping @ Sullivan'],
      ['8:30 AM', 'Practice #3 (Shells) (8:30 - 11:30)'], ['12:00 PM', 'Lunch'],
      ['1:30 PM', 'Treatments (1:30 - 3:30)'], ['3:00 PM', 'FY Lift (3:00)'],
      ['3:15 PM', 'O Vets Lift / D Meeting (3:15 - 4:15)'],
      ['4:15 PM', 'D Vets Lift / O Meeting (4:15 - 5:15)'], ['5:15 PM', 'ST Meeting'],
      ['5:30 PM', 'Dinner'], ['6:30 PM', 'O/D Meetings (6:30 - 7:30)'],
      ['7:30 PM', 'Walk Thru @ Grappone']
    ],
    '2026-08-15': [
      ['8:30 AM', 'NCAA Day Off-Rest and Recharge'], ['11:00 AM', 'Lunch'],
      ['2:00 PM', 'Media Day (2:00 - 4:00 PM, Head Shots/Shirt and Tie @ Carr Center)'],
      ['5:30 PM', 'Dinner']
    ],
    '2026-08-16': [
      ['7:00 AM', 'Breakfast'], ['7:30 AM', 'Walk Thru (7:30 - 8:30)'],
      ['8:30 AM', 'Church/Quiet Time'], ['11:00 AM', 'Lunch'],
      ['12:30 PM', 'Taping @ Sullivan'], ['1:30 PM', 'Practice #4 (Shells) 1-4'],
      ['4:00 PM', 'Treatments'], ['5:30 PM', 'Dinner'], ['7:00 PM', 'Team Meeting'],
      ['7:15 PM', 'ST-O/D Meetings (7:15 - 8:45)']
    ],
    '2026-08-17': [
      ['7:00 AM', 'Breakfast'], ['7:30 AM', 'Walk Thru (7:30 - 8:30)'],
      ['8:45 AM', 'FY Lift'], ['9:30 AM', 'Team Chemistry - Why I Play'],
      ['11:00 AM', 'Lunch'], ['12:30 PM', 'Taping @ Sullivan'],
      ['1:30 PM', 'Practice #5 (Full) 1-4 (3:30 Mike G after practice)'],
      ['4:30 PM', 'Nutrition/Dining Meeting (Melucci) (4:30 - 5:30)'],
      ['5:30 PM', 'Dinner'], ['7:00 PM', 'Team Meeting'],
      ['7:15 PM', 'ST-O/D Meetings (7:15 - 8:45)']
    ],
    '2026-08-18': [
      ['7:00 AM', 'Breakfast'], ['7:30 AM', 'Walk Thru (7:30 - 8:30)'],
      ['8:40 AM', 'Vets Lift (8:40 - 9:20, 9:20 - 10:00)'],
      ['10:00 AM', 'Team Chemistry - Why I Play'], ['11:00 AM', 'Lunch'],
      ['12:30 PM', 'Taping @ Sullivan'], ['1:30 PM', 'Practice #6 (Full) 1-4'],
      ['4:00 PM', 'Treatments'], ['5:30 PM', 'Dinner'], ['7:00 PM', 'Team Meeting'],
      ['7:15 PM', 'ST-O/D Meetings (7:15 - 8:45)']
    ],
    '2026-08-19': [
      ['8:30 AM', 'NCAA Day Off-Rest and Recharge'],
      ['9:30 AM', 'FY Computer Skills, Gadbois 201'], ['11:00 AM', 'Lunch'],
      ['3:45 PM', 'Title IX/Harbor Meeting (Melucci) (3:45 - 4:45)'],
      ['5:30 PM', 'Dinner']
    ],
    '2026-08-20': [
      ['7:00 AM', 'Breakfast'], ['7:30 AM', 'Walk Thru (7:30 - 8:30)'],
      ['8:30 AM', 'Team Chemistry (High Low Check In)'], ['11:00 AM', 'Lunch'],
      ['12:30 PM', 'Taping @ Sullivan'], ['1:30 PM', 'Practice #7 (Shells) 1-4'],
      ['4:00 PM', 'Treatments'], ['5:30 PM', 'Dinner'], ['7:00 PM', 'Team Meeting'],
      ['7:15 PM', 'ST-O/D Meetings (7:15 - 8:45)']
    ],
    '2026-08-21': [
      ['7:00 AM', 'Breakfast'], ['7:30 AM', 'Walk Thru (7:30 - 8:30)'],
      ['8:45 AM', 'FY Lift'], ['9:30 AM', 'Team Chemistry - 40 Sec Teach'],
      ['11:00 AM', 'Lunch'], ['12:30 PM', 'Taping @ Sullivan'],
      ['1:00 PM', 'Practice #8 (Full) 1-4 (President Levels @ 1:00)'],
      ['4:00 PM', 'Treatments'], ['5:30 PM', 'Dinner'], ['7:00 PM', 'Team Meeting'],
      ['7:15 PM', 'ST-O/D Meetings (7:15 - 8:45)']
    ],
    '2026-08-22': [
      ['7:00 AM', 'Breakfast'], ['7:30 AM', 'Walk Thru (7:30 - 8:30)'],
      ['8:40 AM', 'Vets Lift (8:40 - 9:20, 9:20 - 10:00)'],
      ['9:30 AM', 'Team Chemistry - Rock, Paper, Scissors'], ['11:00 AM', 'Lunch'],
      ['12:00 PM', 'Taping @ Sullivan'], ['1:00 PM', 'Practice #9 (Full) 1-4'],
      ['4:00 PM', 'Treatments'], ['5:30 PM', 'Dinner'], ['7:00 PM', 'Team Meeting'],
      ['7:15 PM', 'ST-O/D Meetings (7:15 - 8:45)']
    ],
    '2026-08-23': [
      ['8:30 AM', 'NCAA Day Off-Rest and Recharge (Church)'],
      ['11:00 AM', 'Lunch'], ['5:30 PM', 'Dinner']
    ],
    '2026-08-24': [
      ['7:00 AM', 'Breakfast'], ['7:30 AM', 'Walk Thru (7:30 - 8:30)'],
      ['11:00 AM', 'Lunch'], ['12:30 PM', 'Taping @ Sullivan'],
      ['1:30 PM', 'Practice #10 (Shells) 1-4'], ['4:00 PM', 'Treatments'],
      ['5:30 PM', 'Dinner'], ['7:00 PM', 'Team Meeting'],
      ['7:15 PM', 'ST-O/D Meetings (7:15 - 8:45)']
    ],
    '2026-08-25': [
      ['7:00 AM', 'Breakfast'], ['7:30 AM', 'Walk Thru (7:30 - 8:30)'],
      ['8:45 AM', 'FY Lift'], ['11:00 AM', 'Lunch'],
      ['12:30 PM', 'Taping @ Sullivan'], ['1:30 PM', 'Practice #11 (Full) 1-4'],
      ['4:00 PM', 'Treatments'], ['5:30 PM', 'Dinner'], ['7:00 PM', 'Team Meeting'],
      ['7:15 PM', 'ST-O/D Meetings (7:15 - 8:45)']
    ],
    '2026-08-26': [
      ['7:00 AM', 'Breakfast'], ['8:30 AM', 'Taping @ Sullivan'],
      ['9:30 AM', 'Practice #12 (Scrimmage-Officials) (8:30 - 11:30)'],
      ['12:00 PM', 'Lunch'], ['1:30 PM', 'Treatments'],
      ['3:15 PM', 'O Vets Lift / D Meeting (3:15 - 4:15)'],
      ['4:15 PM', 'D Vets Lift / O Meeting (4:15 - 5:15)'], ['5:15 PM', 'ST Meeting'],
      ['5:30 PM', 'Dinner'], ['6:30 PM', 'O/D Meetings (6:30 - 8:00)'],
      ['8:00 PM', 'Walk Thru @ Grappone (Scrimmage Corrections) (8:00 - 8:30)']
    ],
    '2026-08-27': [
      ['7:00 AM', 'Breakfast'], ['8:30 AM', 'New Student Move In'],
      ['12:00 PM', 'Lunch - Grab and Go - Sullivan'], ['1:00 PM', 'Taping @ Sullivan'],
      ['2:00 PM', 'Practice #13 (Helmets) 1-3'], ['4:00 PM', 'Treatments'],
      ['5:00 PM', 'Dinner - Grab and Go to Sullivan'],
      ['7:00 PM', "Women's FH (Team Attendance)"]
    ],
    '2026-08-28': [
      ['7:00 AM', 'Breakfast'],
      ['8:30 AM', 'NCAA Day Off-Rest and Recharge (Vets Only)'],
      ['10:30 AM', 'Lunch - Grab and Go - Sullivan'], ['5:30 PM', 'Dinner']
    ],
    '2026-08-29': [
      ['7:00 AM', 'Breakfast'],
      ['8:30 AM', 'Walk Thru - Vets Only @ Grappone, Game 1 Gameplan Review'],
      ['11:30 AM', 'Lunch'], ['12:30 PM', 'Taping @ Sullivan'],
      ['2:15 PM', 'Practice #14 (Shells) (2:15 - 4:15)'], ['4:15 PM', 'Treatments'],
      ['5:30 PM', 'Dinner - Davison Closed for NSO']
    ],
    '2026-08-30': [
      ['7:00 AM', 'Breakfast'], ['11:30 AM', 'Lunch'],
      ['12:30 PM', 'Taping @ Sullivan'], ['1:00 PM', 'Practice #15 (Shells) 12-2'],
      ['2:30 PM', 'FY Lift After Practice'], ['4:00 PM', 'Treatments'],
      ['5:30 PM', 'Dinner'], ['6:30 PM', 'Team Meet-Academics'],
      ['7:00 PM', 'ST-O/D Meetings']
    ]
  };

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
  var WEATHER_LOC = { lat: 42.99, lon: -71.48 };  // Manchester, NH 03102
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

  function renderCountdowns() {
    if (!milestonesEl) return;
    var key = dayKey(new Date());
    if (key === lastCountdownDayKey) return;
    lastCountdownDayKey = key;

    var bestDays = Infinity;
    DATE_CHIPS.forEach(function (c) { var d = daysUntil(c[0], c[1]); if (d < bestDays) bestDays = d; });

    var out = '<span class="daysleft-tag">' + bestDays + ' days</span>';
    DATE_CHIPS.forEach(function (c) {
      var d = daysUntil(c[0], c[1]);
      out += '<span class="chip' + (d === bestDays ? ' chip-soon' : '') + '" tabindex="0" role="button" aria-pressed="false" data-days="' + d + '">' + c[2].toUpperCase() + '</span>';
    });
    milestonesEl.innerHTML = out;
  }

  // Days until the soonest chip (the default before/after a selection).
  function soonestDays() {
    var b = Infinity;
    DATE_CHIPS.forEach(function (c) { var d = daysUntil(c[0], c[1]); if (d < b) b = d; });
    return b;
  }

  // Make date chips selectable (click/tap + remote D-pad + OK).
  function activateChip(chip) {
    var wasActive = chip.classList.contains('is-active');
    var all = milestonesEl.querySelectorAll('.chip');
    all.forEach(function (c) { c.classList.remove('is-active'); c.setAttribute('aria-pressed', 'false'); });
    if (!wasActive) { chip.classList.add('is-active'); chip.setAttribute('aria-pressed', 'true'); }

    // Reflect the selection in the "N days" counter.
    var tag = milestonesEl.querySelector('.daysleft-tag');
    if (tag) {
      tag.textContent = (wasActive ? soonestDays() : chip.getAttribute('data-days')) + ' days';
    }
  }
  function closeChip(ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('.chip') : null;
    if (!t) return;
    if (ev.type === 'keydown' && !(ev.key === 'Enter' || ev.key === ' ' || ev.key === 'OK')) return;
    if (ev.type === 'keydown') ev.preventDefault();
    activateChip(t);
  }
  function setupChips() {
    if (!milestonesEl) return;
    milestonesEl.addEventListener('click', closeChip);
    milestonesEl.addEventListener('keydown', closeChip);
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
  async function fetchWeather() {
    if (!weatherEl) return;
    try {
      var u = '/weather';   // proxied same-origin via nginx (TV-safe)
      var r = await fetch(u);
      if (!r.ok) return;
      var d = await r.json();
      var cur = d.current || {};
      var daily = d.daily || {};
      if (daily.sunrise && daily.sunset && daily.sunrise[0] && daily.sunset[0]) {
        SUN.rise = new Date(daily.sunrise[0]);   // real local sunrise/sunset
        SUN.set = new Date(daily.sunset[0]);
      }
      var t = Math.round(cur.temperature_2m);
      var desc = WMO[cur.weather_code] || '';
      var hi = daily.temperature_2m_max ? Math.round(daily.temperature_2m_max[0]) : '–';
      var lo = daily.temperature_2m_min ? Math.round(daily.temperature_2m_min[0]) : '–';
      var fe = (cur.apparent_temperature != null) ? Math.round(cur.apparent_temperature) + '°' : '';
      weatherEl.innerHTML =
        '<span class="w-temp">' + t + '°</span>' +
        (desc ? '<span class="w-sep">|</span><span class="w-mid"><span class="w-desc">' + desc + '</span>' +
          (fe ? '<span class="w-fl">Feels Like ' + fe + '</span>' : '') + '</span>' : '') +
        '<span class="w-sep">|</span><span class="w-hilo">H ' + hi + '° L ' + lo + '°</span>';

      // Chance of rain in the next 6 hours.
      var rain = 0;
      var hly = d.hourly || {};
      if (hly.precipitation_probability && hly.time) {
        var rainNow = Date.now();
        for (var i = 0; i < hly.time.length; i++) {
          var hrMs = new Date(hly.time[i]).getTime();
          if (hrMs - rainNow > 6 * 3600000) break;
          if (hrMs >= rainNow && (hly.precipitation_probability[i] || 0) > rain) {
            rain = hly.precipitation_probability[i];
          }
        }
      }
      RAINY = !!(cur.weather_code >= 51);       // wet-day ambience flag (idea 10)
      if (rain > 4) {
        weatherEl.innerHTML += ' <span class="w-rain">☂ ' + Math.round(rain) + '%</span>';
      }
    } catch (e) {
      if (weatherEl) weatherEl.textContent = '';
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
    var mode;
    if (UI_STYLE === 'compact' || cols > 5) mode = 'compact';
    else if (UI_STYLE === 'timeline') mode = 'timeline';
    else mode = '';
    if (mode) eventsEl.setAttribute('data-mode', mode);
    else eventsEl.removeAttribute('data-mode');
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

  // Time-block (Gantt-style) timeline: each event becomes a vertical bar whose
  // height equals its duration (until the next event), so 7:00 Breakfast runs to
  // the 7:30 Walk Thru, which runs to 8:30, and so on.
  function buildTimeline(events) {
    var wrap = document.createElement('div');
    wrap.className = 'tl-blocks';
    if (!events.length) return wrap;
    var H = 60 * 60 * 1000;
    var STEP = Math.max(14, Math.round((window.innerWidth || 1920) * 0.015));
    // Fixed canvas 7:00 AM -> 7:00 PM on the event's own day (expands only if a
    // later event needs room). Blocks are contiguous: a block runs until the next one
    // starts, with a 30-min minimum so same-time events stay visible.
    var dayRef = new Date(events[0].startMs);
    var t0 = new Date(dayRef); t0.setHours(7, 0, 0, 0);
    var t1 = new Date(dayRef); t1.setHours(19, 0, 0, 0);
    var cs = t0.getTime(), ce = t1.getTime();
    var order = events.slice().sort(function (a, b) { return a.startMs - b.startMs; });
    var NOM = 30 * 60 * 1000;
    order.forEach(function (ev, i) {
      var trueEnd = (i + 1 < order.length) ? order[i + 1].startMs : ev.startMs + H;
      ev._end = Math.max(trueEnd, ev.startMs + NOM);
      if (ev.startMs < cs) cs = ev.startMs;
      if (ev._end > ce) ce = ev._end;
    });
    var span = Math.max(1, ce - cs);
    // Overlap deck: events that run at the same time are stacked on top of each
    // other, each indented slightly so its colored edge / a sliver stays visible.
    var activeEnds = [];
    var lanes = 1;
    order.forEach(function (ev) {
      activeEnds = activeEnds.filter(function (e) { return e > ev.startMs; });
      var lane = activeEnds.length;
      activeEnds.push(ev._end);
      ev._lane = lane;
      if (lane + 1 > lanes) lanes = lane + 1;
    });
    order.forEach(function (ev) {
      var top = ((ev.startMs - cs) / span) * 100;
      var h = Math.max(((ev._end - ev.startMs) / span) * 100, 1.5);
      var b = document.createElement('div');
      b.className = 'tl-block';
      b.setAttribute('data-start', String(ev.startMs));
      b.setAttribute('data-cat', classifyCat(ev.title));
      b.style.top = top + '%';
      b.style.height = h + '%';
      b.style.left = (ev._lane * STEP) + 'px';
      b.style.width = 'calc(100% - ' + (ev._lane * STEP + 6) + 'px)';
      b.style.zIndex = String(ev._lane + 1);
      var t = document.createElement('span');
      t.className = 'tl-time';
      t.textContent = ev.isAllDay ? 'All day' : fmtShort(new Date(ev.startMs));
      var ti = document.createElement('span');
      ti.className = 'tl-title';
      ti.textContent = ev.title || '(no title)';
      b.appendChild(t);
      b.appendChild(ti);
      wrap.appendChild(b);
    });
    return wrap;
  }
  function stringify(v) {
    if (v === null || v === undefined) return '';
    return String(v);
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
    clearEvents();

    if (!groups.length) {
      emptyState('No upcoming events');
      return;
    }

    var tlMode = eventsEl.getAttribute('data-mode') === 'timeline';

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
      if (tlMode && !g.events.length) {
        var reason = document.createElement('span');
        reason.className = 'empty-reason';
        reason.textContent = special ? special : '—';
        header.appendChild(reason);
      }
      if (tlMode) {
        var tl = buildTimeline(g.events);
        core.appendChild(tl);
        if (isToday) {
          var prog = document.createElement('div');
          prog.className = 'slot-progress';
          prog.innerHTML = '<div class="slot-progress-fill" id="slot-progress-fill"></div><span class="slot-progress-label" id="slot-progress-label"></span>';
          core.insertBefore(prog, tl);
        }
      } else {
        var ul = document.createElement('ul');
        ul.className = 'events';
        g.events.forEach(function (ev, i) {
          ul.appendChild(buildEventNode(ev, i, g.events));
        });
        core.appendChild(ul);               // add the list first so insertBefore has a valid ref
        if (isToday) {
          var prog = document.createElement('div');
          prog.className = 'slot-progress';
          prog.innerHTML = '<div class="slot-progress-fill" id="slot-progress-fill"></div><span class="slot-progress-label" id="slot-progress-label"></span>';
          core.insertBefore(prog, ul);
        }
      }
      shell.appendChild(core);

      // Entrance: gentle custom-cubic-bezier fade-up, staggered per card
      // (transform/opacity only; runs once on load — no flashing).
      shell.classList.add('reveal');
      shell.style.transitionDelay = (120 * gi) + 'ms';
      eventsEl.appendChild(shell);
    });

    // Auto-center today's column (guarded — some TV webviews choke on the options form).
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
      return null; // a single unreachable feed must never break the rest
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
    if (!CALENDAR_URLS.length) { emptyState('No calendar configured'); setStatus('Add feeds in nginx.conf'); return; }

    try {
      // Resolve every feed independently (never rejects as a group, so
      // one offline/404 feed can't wipe out the whole calendar).
      var icsTexts = await Promise.all(CALENDAR_URLS.map(fetchCalendar));
      var allVevents = [];

      // Parse EACH feed separately (ical.js mishandles multiple
      // concatenated VCALENDAR documents in a single parse), then merge.
      icsTexts.forEach(function (icsText) {
        if (!icsText) return;

        // Resniff content-type: only treat text/calendar-ish bodies as feeds.
        if (!/BEGIN:VCALENDAR/i.test(icsText.slice(0, 400))) return;

        try {
          var comp = new ICAL.Component(ICAL.parse(icsText));
          allVevents = allVevents.concat(comp.getAllSubcomponents('vevent'));
        } catch (e) {
          // Skip a malformed feed; other calendars still load.
        }
      });

      var now = Date.now();
      var events = [];

      allVevents.forEach(function (ve) {
        var start = ve.getFirstPropertyValue('dtstart');
        if (!start) return;

        var startDate = start.toJSDate();
        var startMs = startDate.getTime();

        // Consider an event "upcoming" if it isn't fully over yet.
        var endProp = ve.getFirstPropertyValue('dtend');
        var endMs = endProp ? endProp.toJSDate().getTime()
                            : (start.isDate ? startMs + 24 * HOUR_MS : startMs + HOUR_MS);
        if (endMs < now) return;

        // Ignore events beyond the schedule window.
        var startDay = new Date(startDate);
        startDay.setHours(0, 0, 0, 0);
        var floorNow = new Date(now);
        floorNow.setHours(0, 0, 0, 0);
        if ((startDay - floorNow) / HOUR_MS > DAYS_AHEAD * 24) return;

        var title = stringify(ve.getFirstPropertyValue('summary'));

        // Skip the recurring "football camp" all-day placeholder on every day.
        if (!!start.isDate && /(football|camp)/i.test(title)) return;

        events.push({
          startMs: startMs,
          isAllDay: !!start.isDate,
          title: title
        });
      });

      // Merge the static camp schedule (deduped) before grouping.
      mergeStatic(events, now);

      events.sort(function (a, b) { return a.startMs - b.startMs; });
      lastEvents = events;

      // Group by local day for a real daily-calendar listing.
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

      // Label headers: Today / Tomorrow / Weekday — computed from
      // calendar-day keys (matching the grouping), DST-safe via setDate.
      var today = new Date();
      var todayKey = dayKey(today);
      var tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      var tomorrowKey = dayKey(tomorrow);

      // Show the full DAYS_AHEAD window (even empty days) so gaps stay visible.
      var groups = buildWindowGroups(todayKey, tomorrowKey, map);

      applyStyleMode();
      renderCalendar(groups);
      try { updateNowMark(); } catch (err) {}
      setStatus('Calendars synced.');
    } catch (err) {
      // Surface the cause on the Next-up line, and keep the calendar visible.
      var elx = document.getElementById('nextup');
      if (elx) elx.textContent = 'ERR: ' + (err && err.message ? err.message : err);
      var _n = new Date(); var _t2 = new Date(_n); _t2.setDate(_n.getDate() + 1);
      try { renderCalendar(buildWindowGroups(dayKey(_n), dayKey(_t2), null)); }
      catch (e2) { emptyState('Calendar unavailable'); }
    }
  }

  /* ----------------------------------------------------------
     Init
     ---------------------------------------------------------- */

  var calTimer = null;

  // Auto-fit: the .screen now fills 100vw×100vh responsively, so we simply
  // keep it at natural size (no transform) — always fills, never letterboxes.
  function fitScreen() {}

  window.addEventListener('resize', fitScreen);
  window.addEventListener('orientationchange', function () { setTimeout(fitScreen, 80); });

  // Load user-editable config (/user.json) and apply live: extra events,
  // special days, and date chips — lets you add things without redeploying.
  function loadUserConfig() {
    fetch('/user.json', { cache: 'no-store' }).then(function (r) {
      return r.ok ? r.json() : Promise.reject();
    }).then(function (u) {
      if (!u) return;
      if (Array.isArray(u.chips) && u.chips.length) DATE_CHIPS = u.chips.slice();
      if (u.specialDays) { for (var k in u.specialDays) SPECIAL_DAYS[k] = u.specialDays[k]; }
      if (u.events) USER_EVENTS = u.events;
      if (u.days && !isNaN(+u.days)) DAYS_AHEAD = Math.max(1, Math.round(+u.days) - 1);
      if (u.style === 'timeline' || u.style === 'compact') UI_STYLE = u.style;
      renderCountdowns();
      refreshCalendar();
    }).catch(function () {});
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

  // Gear -> settings editor for special days + events (writes via /api/).
  function openSettings() {
    if (!settingsEl) return;
    fetch('/api/', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('load'); return r.json(); }).then(function (cfg) {
      var sd = cfg.specialDays || {};
      var ev = cfg.events || {};
      settingsEl.innerHTML = ''; settingsEl.hidden = false;
      var card = document.createElement('div'); card.className = 'settings-card';
      var hd = document.createElement('div'); hd.className = 'settings-head'; hd.textContent = 'FireClock Settings'; card.appendChild(hd);

      var sdSec = document.createElement('section');
      var sdTitle = document.createElement('h3'); sdTitle.textContent = 'Special Days'; sdSec.appendChild(sdTitle);
      var sdRows = document.createElement('div'); sdRows.className = 'settings-list'; sdSec.appendChild(sdRows);
      var sdAddR = document.createElement('div'); sdAddR.className = 'addrow';
      var sdDate = document.createElement('input'); sdDate.placeholder = 'YYYY-MM-DD';
      var sdLabel = document.createElement('input'); sdLabel.placeholder = 'Label';
      var sdBtn = document.createElement('button'); sdBtn.className = 'primary'; sdBtn.textContent = 'Add';
      sdAddR.appendChild(sdDate); sdAddR.appendChild(sdLabel); sdAddR.appendChild(sdBtn); sdSec.appendChild(sdAddR);
      card.appendChild(sdSec);

      var evSec = document.createElement('section');
      var evTitle = document.createElement('h3'); evTitle.textContent = 'Events'; evSec.appendChild(evTitle);
      var evRows = document.createElement('div'); evRows.className = 'settings-list'; evSec.appendChild(evRows);
      var evAddR = document.createElement('div'); evAddR.className = 'addrow';
      var evDate = document.createElement('input'); evDate.placeholder = 'YYYY-MM-DD';
      var evTime = document.createElement('input'); evTime.placeholder = 'h:mm AM/PM';
      var evTt = document.createElement('input'); evTt.placeholder = 'Title';
      var evBtn = document.createElement('button'); evBtn.className = 'primary'; evBtn.textContent = 'Add';
      evAddR.appendChild(evDate); evAddR.appendChild(evTime); evAddR.appendChild(evTt); evAddR.appendChild(evBtn); evSec.appendChild(evAddR);
      card.appendChild(evSec);

      var dSec = document.createElement('section');
      dSec.className = 'settings-section';
      var dTitle = document.createElement('h3'); dTitle.textContent = 'Day Window'; dSec.appendChild(dTitle);
      var dRow = document.createElement('div'); dRow.className = 'addrow';
      var dSpan = document.createElement('span'); dSpan.textContent = 'Days shown:'; dRow.appendChild(dSpan);
      var dSel = document.createElement('select'); dSel.id = 'cfgDays';
      [1, 2, 3, 4, 5].forEach(function (n) {
        var o = document.createElement('option'); o.value = n; o.textContent = n + ' days';
        if ((cfg.days || (DAYS_AHEAD + 1)) === n) o.selected = true;
        dSel.appendChild(o);
      });
      dRow.appendChild(dSel); dSec.appendChild(dRow); card.appendChild(dSec);

      var sSec = document.createElement('section');
      sSec.className = 'settings-section';
      var sTitle = document.createElement('h3'); sTitle.textContent = 'Calendar style'; sSec.appendChild(sTitle);
      var sRow = document.createElement('div'); sRow.className = 'addrow';
      var sSpan = document.createElement('span'); sSpan.textContent = 'View:'; sRow.appendChild(sSpan);
      var sSel = document.createElement('select'); sSel.id = 'cfgStyle';
      ['timeline', 'compact'].forEach(function (m) {
        var o = document.createElement('option'); o.value = m;
        o.textContent = (m === 'timeline') ? 'Timeline (hero)' : 'Classic list';
        if ((cfg.style || UI_STYLE) === m) o.selected = true;
        sSel.appendChild(o);
      });
      sRow.appendChild(sSel); sSec.appendChild(sRow); card.appendChild(sSec);

      var act = document.createElement('div'); act.className = 'settings-actions';
      var saveBtn = document.createElement('button'); saveBtn.id = 'cfgSave'; saveBtn.className = 'primary'; saveBtn.textContent = 'Save';
      var clsBtn = document.createElement('button'); clsBtn.id = 'cfgClose'; clsBtn.textContent = 'Close';
      act.appendChild(saveBtn); act.appendChild(clsBtn); card.appendChild(act);
      var msg = document.createElement('div'); msg.id = 'settingsMsg'; card.appendChild(msg);
      settingsEl.appendChild(card);

      function render() {
        sdRows.innerHTML = '';
        var ks = Object.keys(sd);
        if (!ks.length) { var e = document.createElement('em'); e.textContent = 'None'; sdRows.appendChild(e); }
        ks.forEach(function (k) { sdRows.appendChild(settingsRow(k + ' \u2013 ' + sd[k], function () { delete sd[k]; render(); })); });
        evRows.innerHTML = '';
        var dk = Object.keys(ev);
        if (!dk.length) { var e2 = document.createElement('em'); e2.textContent = 'None'; evRows.appendChild(e2); }
        dk.forEach(function (d) { (ev[d] || []).slice().forEach(function (g, idx) {
          evRows.appendChild(settingsRow(d + ' ' + g[0] + ' ' + g[1], function () { ev[d].splice(idx, 1); if (!ev[d].length) delete ev[d]; render(); }));
        }); });
      }
      sdBtn.onclick = function () { var d = sdDate.value.trim(), l = sdLabel.value.trim(); if (d && l) { sd[d] = l; render(); } };
      evBtn.onclick = function () { var d = evDate.value.trim(), t = evTime.value.trim(), ti = evTt.value.trim(); if (d && t && ti) { (ev[d] = ev[d] || []).push([t, ti]); render(); } };
      clsBtn.onclick = closeSettings;
      saveBtn.onclick = function () {
        fetch('/api/', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ specialDays: sd, events: ev, chips: cfg.chips || [], days: +dSel.value, style: sSel.value }) })
          .then(function (r) { return r.json(); }).then(function (res) {
            if (res && res.ok) { settingsMsg('Saved!'); closeSettings(); loadUserConfig(); refreshCalendar(); }
            else settingsMsg('Error: ' + (res && res.error || 'save failed'));
          }).catch(function () { settingsMsg('Save failed.'); });
      };
      render();
    }).catch(function () { settingsMsg('Could not load config.'); });
  }

  function init() {
    startClock();
    setupChips();
    if (gearEl) gearEl.addEventListener('click', openSettings);
    fitScreen();
    loadUserConfig();
    setTimeout(fitScreen, 300);           // re-fit after fonts/layout settle
    fetchWeather();
    refreshCalendar();
    calTimer = setInterval(refreshCalendar, REFRESH_MS);
    setInterval(function () { updateNowMark(); updateNextUp(); }, 60 * 1000);
    setInterval(fetchWeather, 30 * 60 * 1000);
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
