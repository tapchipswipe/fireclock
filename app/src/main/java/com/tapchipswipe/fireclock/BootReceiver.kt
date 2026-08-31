package com.tapchipswipe.fireclock

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        Log.i(TAG, "Received broadcast action: $action")
        AutoLaunchHelper.scheduleBootLaunch(context)
        AutoLaunchHelper.rescheduleDailyAlarm(context)
    }

    companion object {
        private const val TAG = "BootReceiver"
    }
}
