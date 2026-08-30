package com.tapchipswipe.fireclock

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.util.Log
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

object AppUpdater {
    private const val TAG = "AppUpdater"
    private const val GITHUB_API = "https://api.github.com/repos/tapchipswipe/fireclock/releases/latest"
    private const val APK_URL = "https://github.com/tapchipswipe/fireclock/releases/latest/download/app-release-signed.apk"
    private const val PREFS_NAME = "fireclock_updater"
    private const val KEY_LAST_CHECK = "last_check_timestamp"
    private const val COOLDOWN_MS = 60 * 1000L // 1 minute cooldown between checks

    suspend fun checkForUpdate(context: Context): Boolean = withContext(Dispatchers.IO) {
        try {
            if (!isNetworkAvailable(context)) return@withContext false
            if (!shouldCheck(context)) return@withContext false

            val tagName = fetchLatestVersion() ?: return@withContext false
            val currentVersion = getCurrentVersion(context)
            Log.i(TAG, "Update check: installed=$currentVersion, latest=$tagName")

            if (tagName.isBlank() || currentVersion.isBlank()) return@withContext false

            val isUpdate = compareVersions(tagName, currentVersion) > 0
            if (isUpdate) {
                Log.i(TAG, "New version found ($tagName > $currentVersion), downloading APK...")
                val apkFile = downloadApk(context)
                if (apkFile != null && apkFile.exists() && apkFile.length() > 100000) {
                    Log.i(TAG, "APK downloaded (${apkFile.length()} bytes), prompting install...")
                    withContext(Dispatchers.Main) {
                        promptInstall(context, apkFile)
                    }
                }
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

    private fun downloadApk(context: Context): File? {
        return try {
            val destFile = File(context.cacheDir, "fireclock-update.apk")
            if (destFile.exists()) destFile.delete()

            val url = URL(APK_URL)
            val conn = url.openConnection() as HttpURLConnection
            conn.instanceFollowRedirects = true
            conn.connectTimeout = 15000
            conn.readTimeout = 30000
            conn.setRequestProperty("User-Agent", "FireClock-Updater")

            // Handle GitHub release redirects (302 -> S3 / release asset)
            var currentConn = conn
            var code = currentConn.responseCode
            var redirects = 0
            while ((code == 301 || code == 302 || code == 303 || code == 307 || code == 308) && redirects < 5) {
                val loc = currentConn.getHeaderField("Location") ?: break
                currentConn.disconnect()
                val nextUrl = URL(loc)
                currentConn = nextUrl.openConnection() as HttpURLConnection
                currentConn.connectTimeout = 15000
                currentConn.readTimeout = 30000
                currentConn.setRequestProperty("User-Agent", "FireClock-Updater")
                code = currentConn.responseCode
                redirects++
            }

            if (code != 200) {
                Log.w(TAG, "APK download HTTP error $code")
                return null
            }

            currentConn.inputStream.use { input ->
                FileOutputStream(destFile).use { output ->
                    input.copyTo(output)
                }
            }
            destFile
        } catch (e: Exception) {
            Log.e(TAG, "APK download failed", e)
            null
        }
    }

    private fun promptInstall(context: Context, apkFile: File) {
        try {
            val uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.provider",
                apkFile
            )

            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }

            context.startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch installer", e)
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
        return System.currentTimeMillis() - lastCheck > COOLDOWN_MS
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
