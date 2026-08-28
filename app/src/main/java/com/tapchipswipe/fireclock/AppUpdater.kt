package com.tapchipswipe.fireclock

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Environment
import android.util.Log
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

object AppUpdater {
    private const val TAG = "AppUpdater"
    private const val GITHUB_API = "https://api.github.com/repos/tapchipswipe/fireclock/releases/latest"
    private const val APK_URL = "https://github.com/tapchipswipe/fireclock/releases/latest/download/app-release-signed.apk"
    private const val PREFS_NAME = "fireclock_updater"
    private const val KEY_LAST_CHECK = "last_check_timestamp"

    suspend fun checkForUpdate(context: Context): Boolean = withContext(Dispatchers.IO) {
        try {
            if (!isNetworkAvailable(context)) return@withContext false
            if (!shouldCheck(context)) return@withContext false

            val tagName = fetchLatestVersion() ?: return@withContext false
            val currentVersion = getCurrentVersion(context)
            if (tagName.isBlank() || currentVersion.isBlank()) return@withContext false

            val isUpdate = compareVersions(tagName, currentVersion) > 0
            if (isUpdate) {
                scheduleDownload(context)
            }
            markChecked(context)
            isUpdate
        } catch (e: Exception) {
            Log.e(TAG, "Update check failed", e)
            false
        }
    }

    private fun fetchLatestVersion(): String? {
        return try {
            val url = URL(GITHUB_API)
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.connectTimeout = 8000
            conn.readTimeout = 8000
            conn.setRequestProperty("Accept", "application/vnd.github.v3+json")
            conn.setRequestProperty("User-Agent", "FireClock-Updater")

            if (conn.responseCode != 200) return null

            val response = conn.inputStream.bufferedReader().use { it.readText() }
            val json = JSONObject(response)
            json.optString("tag_name", "").removePrefix("v").ifBlank { null }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to fetch version from GitHub", e)
            null
        }
    }

    private fun scheduleDownload(context: Context) {
        try {
            val request = android.app.DownloadManager.Request(Uri.parse(APK_URL)).apply {
                setTitle("FireClock Update")
                setDescription("Downloading latest version...")
                setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "fireclock-update.apk")
                setMimeType("application/vnd.android.package-archive")
            }

            val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            val downloadId = dm.enqueue(request)

            val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(ctx: Context, intent: Intent) {
                    val id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1)
                    if (id == downloadId) {
                        ctx.unregisterReceiver(this)
                        val uri = dm.getUriForDownloadedFile(downloadId)
                        if (uri != null) {
                            promptInstall(ctx, uri)
                        }
                    }
                }
            }
            context.registerReceiver(receiver, filter)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to schedule download", e)
        }
    }

    private fun promptInstall(context: Context, apkUri: Uri) {
        try {
            val uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.provider",
                File(apkUri.path ?: return)
            )

            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }

            context.startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to prompt install", e)
        }
    }

    private fun getCurrentVersion(context: Context): String {
        return try {
            val pkg = context.packageManager.getPackageInfo(context.packageName, 0)
            pkg.versionName ?: ""
        } catch (e: Exception) {
            ""
        }
    }

    private fun compareVersions(newVer: String, currentVer: String): Int {
        val newParts = newVer.split(".").map { it.toIntOrNull() ?: 0 }
        val curParts = currentVer.split(".").map { it.toIntOrNull() ?: 0 }
        for (i in 0 until maxOf(newParts.size, curParts.size)) {
            val n = newParts.getOrNull(i) ?: 0
            val c = curParts.getOrNull(i) ?: 0
            if (n != c) return n.compareTo(c)
        }
        return 0
    }

    private fun shouldCheck(context: Context): Boolean {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val lastCheck = prefs.getLong(KEY_LAST_CHECK, 0)
        val oneDayMs = 24 * 60 * 60 * 1000
        return System.currentTimeMillis() - lastCheck > oneDayMs
    }

    private fun markChecked(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putLong(KEY_LAST_CHECK, System.currentTimeMillis()).apply()
    }

    private fun isNetworkAvailable(context: Context): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }
}
