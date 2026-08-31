package com.tapchipswipe.fireclock

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class AlarmLaunchReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        Log.i(TAG, "Daily alarm fired")
        AutoLaunchHelper.maybeLaunch(context, reason = "daily_alarm", bypassFilters = true)
        AutoLaunchHelper.rescheduleDailyAlarm(context)
    }

    companion object {
        private const val TAG = "AlarmLaunchReceiver"
    }
}
