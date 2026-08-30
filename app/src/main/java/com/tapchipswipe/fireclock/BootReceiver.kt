package com.tapchipswipe.fireclock

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import java.util.Calendar

class BootReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "BootReceiver"
        const val PREFS_NAME = "fireclock_autostart"
        const val KEY_ENABLED = "autostart_enabled"
        const val KEY_DAYS = "autostart_days"       // "all", "weekdays", "weekends", "mon", "tue", etc.
        const val KEY_WINDOW = "autostart_window"   // "anytime", "before_9am", "before_10am", "before_12pm", "morning_6_9"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        Log.i(TAG, "Received broadcast action: $action")

        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val isEnabled = prefs.getBoolean(KEY_ENABLED, true)
        if (!isEnabled) {
            Log.i(TAG, "Auto-start is disabled in settings")
            return
        }

        val daysConfig = prefs.getString(KEY_DAYS, "all") ?: "all"
        val windowConfig = prefs.getString(KEY_WINDOW, "anytime") ?: "anytime"

        val cal = Calendar.getInstance()
        val dayOfWeek = cal.get(Calendar.DAY_OF_WEEK) // 1=Sun, 2=Mon, 3=Tue, 4=Wed, 5=Thu, 6=Fri, 7=Sat
        val hour24 = cal.get(Calendar.HOUR_OF_DAY)
        val minute = cal.get(Calendar.MINUTE)
        val currentMinutes = hour24 * 60 + minute

        // Check Day Filter
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
            Log.i(TAG, "Auto-start skipped: Day of week ($dayOfWeek) does not match config '$daysConfig'")
            return
        }

        // Check Time Window Filter
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
            Log.i(TAG, "Auto-start skipped: Time ($hour24:$minute) outside window '$windowConfig'")
            return
        }

        Log.i(TAG, "Auto-starting FireClock! Criteria matched (days=$daysConfig, window=$windowConfig)")
        try {
            val launchIntent = Intent(context, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
            context.startActivity(launchIntent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to auto-launch MainActivity", e)
        }
    }
}
