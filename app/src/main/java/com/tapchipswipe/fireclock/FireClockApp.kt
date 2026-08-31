package com.tapchipswipe.fireclock

import android.app.Application
import android.util.Log

class FireClockApp : Application() {
    override fun onCreate() {
        super.onCreate()
        AutoLaunchHelper.ensureDefaultPrefs(this)
        AutoLaunchHelper.rescheduleDailyAlarm(this)
        WakeReceiver.register(this)
        Log.i(TAG, "FireClockApp initialized")
    }

    companion object {
        private const val TAG = "FireClockApp"
    }
}
