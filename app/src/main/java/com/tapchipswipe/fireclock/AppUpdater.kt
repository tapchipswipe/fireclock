package com.tapchipswipe.fireclock

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.util.Log
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

object AppUpdater {
    private const val TAG = "AppUpdater"
    private const val GITHUB_REPO = "https://api.github.com/repos/tapchipswipe/fireclock"
    private const val PREFS_NAME = "fireclock_updater"
    private const val KEY_LAST_CHECK = "last_check_timestamp"
    private const val COOLDOWN_MS = 60 * 1000L

    suspend fun checkForUpdate(context: Context, force: Boolean = false): String = withContext(Dispatchers.IO) {
        try {
            if (!isNetworkAvailable(context)) {
                return@withContext resultJson("no_network", getCurrentVersion(context), null)
            }
            if (!force && !shouldCheck(context)) {
                return@withContext resultJson("cooldown", getCurrentVersion(context), null)
            }

            val latestVersion = fetchLatestVersion()
            if (latestVersion.isNullOrBlank()) {
                Log.w(TAG, "Failed to fetch latest version from GitHub")
                return@withContext resultJson("check_failed", getCurrentVersion(context), null)
            }

            val currentVersion = getCurrentVersion(context)
            Log.i(TAG, "Update check: installed=$currentVersion, latest=$latestVersion")

            if (currentVersion.isBlank()) {
                return@withContext resultJson("check_failed", currentVersion, latestVersion)
            }

            val isUpdate = compareVersions(latestVersion, currentVersion) > 0
            if (isUpdate) {
                Log.i(TAG, "New version found ($latestVersion > $currentVersion), downloading APK...")
                val apkFile = downloadApk(context, latestVersion)
                if (apkFile != null && apkFile.exists() && apkFile.length() > 100000) {
                    Log.i(TAG, "APK downloaded (${apkFile.length()} bytes), prompting install...")
                    markChecked(context)
                    withContext(Dispatchers.Main) {
                        promptInstall(context, apkFile)
                    }
                    return@withContext resultJson("update_prompted", currentVersion, latestVersion)
                }
                Log.e(TAG, "APK download failed or file too small")
                return@withContext resultJson("download_failed", currentVersion, latestVersion)
            }

            markChecked(context)
            Log.i(TAG, "Already running latest version ($currentVersion)")
            return@withContext resultJson("up_to_date", currentVersion, latestVersion)
        } catch (e: Exception) {
            Log.e(TAG, "Update check failed", e)
            resultJson("error", getCurrentVersion(context), null)
        }
    }

    fun getLatestReleaseVersion(): String? = fetchLatestVersion()

    private fun fetchLatestVersion(): String? {
        val cacheBust = System.currentTimeMillis()
        fetchTagFromUrl("$GITHUB_REPO/releases/latest?t=$cacheBust")?.let { return it }

        return try {
            val response = fetchText("$GITHUB_REPO/releases?per_page=10&t=$cacheBust") ?: return null
            val releases = JSONArray(response)
            var best: String? = null
            for (i in 0 until releases.length()) {
                val release = releases.optJSONObject(i) ?: continue
                if (release.optBoolean("draft", false) || release.optBoolean("prerelease", false)) continue
                val tag = release.optString("tag_name", "").removePrefix("v")
                if (tag.isBlank()) continue
                if (best == null || compareVersions(tag, best) > 0) best = tag
            }
            best
        } catch (e: Exception) {
            Log.e(TAG, "Failed to enumerate releases", e)
            null
        }
    }

    private fun fetchTagFromUrl(url: String): String? {
        return try {
            val response = fetchText(url) ?: return null
            val json = JSONObject(response)
            json.optString("tag_name", "").removePrefix("v").ifBlank { null }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to fetch tag from $url", e)
            null
        }
    }

    private fun fetchText(url: String): String? {
        val conn = openConnection(url)
        return try {
            if (conn.responseCode != 200) {
                Log.w(TAG, "GitHub HTTP ${conn.responseCode} for $url")
                return null
            }
            conn.inputStream.bufferedReader().use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }

    private fun openConnection(url: String): HttpURLConnection {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.requestMethod = "GET"
        conn.useCaches = false
        conn.defaultUseCaches = false
        conn.connectTimeout = 8000
        conn.readTimeout = 8000
        conn.setRequestProperty("Accept", "application/vnd.github.v3+json")
        conn.setRequestProperty("User-Agent", "FireClock-Updater")
        conn.setRequestProperty("Cache-Control", "no-cache, no-store, must-revalidate")
        conn.setRequestProperty("Pragma", "no-cache")
        return conn
    }

    private fun downloadApk(context: Context, versionTag: String): File? {
        val apkUrl = "https://github.com/tapchipswipe/fireclock/releases/download/v$versionTag/app-release-signed.apk"
        return try {
            val destFile = File(context.cacheDir, "fireclock-update.apk")
            if (destFile.exists()) destFile.delete()

            val conn = openConnection("$apkUrl?t=${System.currentTimeMillis()}")
            conn.instanceFollowRedirects = true
            conn.connectTimeout = 15000
            conn.readTimeout = 30000

            if (conn.responseCode != 200) {
                Log.w(TAG, "APK download HTTP error ${conn.responseCode} for v$versionTag")
                return null
            }

            conn.inputStream.use { input ->
                FileOutputStream(destFile).use { output ->
                    input.copyTo(output)
                }
            }
            destFile
        } catch (e: Exception) {
            Log.e(TAG, "APK download failed for v$versionTag", e)
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

    fun compareVersions(newVer: String, currentVer: String): Int {
        val newParts = newVer.split(".").map { it.toIntOrNull() ?: 0 }
        val curParts = currentVer.split(".").map { it.toIntOrNull() ?: 0 }
        for (i in 0 until maxOf(newParts.size, curParts.size)) {
            val n = newParts.getOrNull(i) ?: 0
            val c = curParts.getOrNull(i) ?: 0
            if (n != c) return n.compareTo(c)
        }
        return 0
    }

    private fun resultJson(status: String, current: String?, latest: String?): String {
        return JSONObject().apply {
            put("status", status)
            if (!current.isNullOrBlank()) put("current", current)
            if (!latest.isNullOrBlank()) put("latest", latest)
        }.toString()
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
