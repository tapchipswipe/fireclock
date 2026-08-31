package com.tapchipswipe.fireclock

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.util.Log

class WakeReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        Log.i(TAG, "Received wake broadcast: $action")
        AutoLaunchHelper.maybeLaunch(context, reason = "wake_$action")
    }

    companion object {
        private const val TAG = "WakeReceiver"
        private var registered = false
        private var receiver: WakeReceiver? = null

        fun register(context: Context) {
            if (registered) return
            val appContext = context.applicationContext
            receiver = WakeReceiver()
            val filter = IntentFilter().apply {
                addAction(Intent.ACTION_SCREEN_ON)
                addAction("android.intent.action.HDMI_PLUGGED")
            }
            appContext.registerReceiver(receiver, filter)
            registered = true
            Log.i(TAG, "WakeReceiver registered")
        }

        fun unregister(context: Context) {
            if (!registered || receiver == null) return
            try {
                context.applicationContext.unregisterReceiver(receiver)
            } catch (e: Exception) {
                Log.w(TAG, "Failed to unregister WakeReceiver", e)
            }
            receiver = null
            registered = false
        }
    }
}
