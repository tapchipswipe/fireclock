package com.tapchipswipe.fireclock

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.util.Calendar

object AutoLaunchHelper {
    private const val TAG = "AutoLaunchHelper"
    private const val BOOT_DELAY_MS = 30_000L
    private const val DEBOUNCE_MS = 5_000L
    private const val ALARM_REQUEST_CODE = 1001
    private const val DELAYED_LAUNCH_REQUEST_CODE = 1002

    const val PREFS_NAME = "fireclock_autostart"
    const val KEY_ENABLED = "autostart_enabled"
    const val KEY_DAYS = "autostart_days"
    const val KEY_WINDOW = "autostart_window"
    const val KEY_ALARM_ENABLED = "autostart_alarm_enabled"
    const val KEY_ALARM_HOUR = "autostart_alarm_hour"
    const val KEY_ALARM_MINUTE = "autostart_alarm_minute"
    const val KEY_PREFS_INITIALIZED = "autostart_prefs_initialized"

    const val DEFAULT_WINDOW = "anytime"
    const val DEFAULT_ALARM_HOUR = 6
    const val DEFAULT_ALARM_MINUTE = 50

    private var lastLaunchAttemptMs = 0L
    private val mainHandler = Handler(Looper.getMainLooper())

    fun ensureDefaultPrefs(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (prefs.getBoolean(KEY_PREFS_INITIALIZED, false)) return
        prefs.edit().apply {
            putBoolean(KEY_ENABLED, true)
            putString(KEY_DAYS, "all")
            putString(KEY_WINDOW, DEFAULT_WINDOW)
            putBoolean(KEY_ALARM_ENABLED, true)
            putInt(KEY_ALARM_HOUR, DEFAULT_ALARM_HOUR)
            putInt(KEY_ALARM_MINUTE, DEFAULT_ALARM_MINUTE)
            putBoolean(KEY_PREFS_INITIALIZED, true)
        }.apply()
        Log.i(TAG, "Initialized default autostart preferences")
    }

    fun scheduleBootLaunch(context: Context, delayMs: Long = BOOT_DELAY_MS) {
        ensureDefaultPrefs(context)
        val appContext = context.applicationContext
        Log.i(TAG, "Scheduling boot launch in ${delayMs}ms")
        mainHandler.removeCallbacksAndMessages(BOOT_TOKEN)
        mainHandler.postDelayed({
            maybeLaunch(appContext, reason = "boot_delayed")
        }, delayMs)
    }

    fun maybeLaunch(context: Context, reason: String, bypassFilters: Boolean = false): Boolean {
        val appContext = context.applicationContext
        ensureDefaultPrefs(appContext)

        val now = System.currentTimeMillis()
        if (now - lastLaunchAttemptMs < DEBOUNCE_MS) {
            Log.i(TAG, "Launch debounced ($reason)")
            return false
        }

        val prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(KEY_ENABLED, true)) {
            Log.i(TAG, "Auto-start disabled ($reason)")
            return false
        }

        if (!bypassFilters && !matchesFilters(prefs)) {
            return false
        }

        lastLaunchAttemptMs = now
        return launchMainActivity(appContext, reason)
    }

    private fun matchesFilters(prefs: android.content.SharedPreferences): Boolean {
        val daysConfig = prefs.getString(KEY_DAYS, "all") ?: "all"
        val windowConfig = prefs.getString(KEY_WINDOW, DEFAULT_WINDOW) ?: DEFAULT_WINDOW

        val cal = Calendar.getInstance()
        val dayOfWeek = cal.get(Calendar.DAY_OF_WEEK)
        val currentMinutes = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)

        val dayMatches = when (daysConfig) {
            "all" -> true
            "weekdays" -> dayOfWeek in Calendar.MONDAY..Calendar.FRIDAY
            "weekends" -> dayOfWeek == Calendar.SATURDAY || dayOfWeek == Calendar.SUNDAY
            "mon" -> dayOfWeek == Calendar.MONDAY
            "tue" -> dayOfWeek == Calendar.TUESDAY
            "wed" -> dayOfWeek == Calendar.WEDNESDAY
            "thu" -> dayOfWeek == Calendar.THURSDAY
            "fri" -> dayOfWeek == Calendar.FRIDAY
            "sat" -> dayOfWeek == Calendar.SATURDAY
            "sun" -> dayOfWeek == Calendar.SUNDAY
            else -> true
        }

        if (!dayMatches) {
            Log.i(TAG, "Skipped: day $dayOfWeek does not match '$daysConfig'")
            return false
        }

        val timeMatches = when (windowConfig) {
            "anytime" -> true
            "before_9am" -> currentMinutes < 9 * 60
            "before_10am" -> currentMinutes < 10 * 60
            "before_12pm" -> currentMinutes < 12 * 60
            "morning_6_9" -> currentMinutes in (6 * 60)..(9 * 60)
            "morning_6_10" -> currentMinutes in (6 * 60)..(10 * 60)
            else -> true
        }

        if (!timeMatches) {
            Log.i(TAG, "Skipped: time outside window '$windowConfig'")
            return false
        }

        return true
    }

    private fun launchMainActivity(context: Context, reason: String): Boolean {
        return try {
            Log.i(TAG, "Launching MainActivity ($reason)")
            val launchIntent = Intent(context, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
                putExtra("autostart_reason", reason)
            }
            context.startActivity(launchIntent)
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch MainActivity ($reason)", e)
            false
        }
    }

    fun rescheduleDailyAlarm(context: Context) {
        val appContext = context.applicationContext
        ensureDefaultPrefs(appContext)
        val prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val alarmManager = appContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pendingIntent = alarmPendingIntent(appContext)

        alarmManager.cancel(pendingIntent)

        if (!prefs.getBoolean(KEY_ALARM_ENABLED, true)) {
            Log.i(TAG, "Daily alarm disabled")
            return
        }

        val hour = prefs.getInt(KEY_ALARM_HOUR, DEFAULT_ALARM_HOUR)
        val minute = prefs.getInt(KEY_ALARM_MINUTE, DEFAULT_ALARM_MINUTE)

        val triggerAt = Calendar.getInstance().apply {
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            if (timeInMillis <= System.currentTimeMillis()) {
                add(Calendar.DAY_OF_YEAR, 1)
            }
        }

        val triggerMs = triggerAt.timeInMillis
        Log.i(TAG, "Scheduling daily alarm for ${hour}:${minute} at $triggerMs")

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    triggerMs,
                    pendingIntent
                )
            } else {
                alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerMs, pendingIntent)
            }
        } catch (e: SecurityException) {
            Log.w(TAG, "Exact alarm permission missing, falling back to inexact alarm", e)
            alarmManager.set(AlarmManager.RTC_WAKEUP, triggerMs, pendingIntent)
        }
    }

    private fun alarmPendingIntent(context: Context): PendingIntent {
        val intent = Intent(context, AlarmLaunchReceiver::class.java)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
        return PendingIntent.getBroadcast(context, ALARM_REQUEST_CODE, intent, flags)
    }

    private val BOOT_TOKEN = Any()
}
