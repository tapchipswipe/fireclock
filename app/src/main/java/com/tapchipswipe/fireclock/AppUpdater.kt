package com.tapchipswipe.fireclock

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
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
    private const val APK_NAME = "fireclock-update.apk"

    suspend fun checkForUpdate(context: Context): Boolean = withContext(Dispatchers.IO) {
        try {
            if (!isNetworkAvailable(context)) return@withContext false

            val url = URL(GITHUB_API)
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.connectTimeout = 8000
            conn.readTimeout = 8000
            conn.setRequestProperty("Accept", "application/vnd.github.v3+json")

            if (conn.responseCode != 200) return@withContext false

            val response = conn.inputStream.bufferedReader().use { it.readText() }
            val json = JSONObject(response)
            val tagName = json.optString("tag_name", "").removePrefix("v")
            
            val currentVersion = getCurrentVersion(context)
            if (tagName.isBlank() || currentVersion.isBlank()) return@withContext false

            val isUpdate = compareVersions(tagName, currentVersion) > 0
            if (isUpdate) {
                downloadAndPromptInstall(context)
            }
            isUpdate
        } catch (e: Exception) {
            Log.e(TAG, "Update check failed", e)
            false
        }
    }

    private fun downloadAndPromptInstall(context: Context) {
        try {
            val url = URL(APK_URL)
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.connectTimeout = 15000
            conn.readTimeout = 15000

            if (conn.responseCode != 200) return

            val destFile = File(context.cacheDir, APK_NAME)
            conn.inputStream.use { input ->
                FileOutputStream(destFile).use { output ->
                    input.copyTo(output)
                }
            }

            val uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.provider",
                destFile
            )

            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }

            context.startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Download/install failed", e)
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

    private fun isNetworkAvailable(context: Context): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }
}
