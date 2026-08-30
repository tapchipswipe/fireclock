package com.tapchipswipe.fireclock

import android.app.Activity
import android.content.Context
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : Activity() {
    private lateinit var webView: WebView

    companion object {
        private const val TAG = "MainActivity"
        private const val APP_URL = "https://fireclock.app/index.html"
        private const val APP_HOST = "fireclock.app"

        private val CAL_PROXIES = mapOf(
            0 to "https://ics.armssoftware.com/production/ics/eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJhcm1zX3VzZXIiOjEzNjg3MjgsImNhbGVuZGFyX3ZpZXdfaWQiOiIxOTAwMSIsImlhdCI6MTc3NTUwMDkzOX0.0jjtP-seyjZPU54NvM0SKvNFetHDaRCsUawrP7Nk7IbSaSJfSR7Re4IbsZ8CZ13rbFVnLJPEhoFLRKIj1XMXhQ",
            1 to "https://firebasestorage.googleapis.com/v0/b/rqp-5-0-0-calendars/o/WYEdtb0n4t7E6hFTrThR%2F850a60a5-28d6-4b74-87b5-e8038de994c2-FvVlOmbYzjfM5VYsbLF2CrJGfsA3.ics?alt=media&token=0abf57c0-d5b5-40ae-ba77-4481ccd6715d",
            2 to "https://calendar.google.com/calendar/ical/despotlucas%40gmail.com/public/basic.ics",
            3 to "https://calendar.google.com/calendar/ical/23pchloe%40gmail.com/public/basic.ics"
        )

        private const val WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=42.99&longitude=-71.48&current=temperature_2m,weather_code,apparent_temperature&hourly=precipitation_probability&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset&temperature_unit=fahrenheit&precipitation_unit=inch&wind_speed_unit=mph&timezone=auto&forecast_days=1"
    }

    class WebAppInterface(private val context: Context) {
        private val userFile = File(context.filesDir, "user.json")

        @JavascriptInterface
        fun getUserConfig(): String {
            return try {
                if (userFile.exists() && userFile.length() > 0) {
                    userFile.readText(Charsets.UTF_8)
                } else {
                    context.assets.open("fireclock_user.json").bufferedReader().use { it.readText() }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Failed to read user config via bridge", e)
                "{}"
            }
        }

        @JavascriptInterface
        fun saveUserConfig(json: String): Boolean {
            return try {
                if (json.isNotBlank()) {
                    userFile.writeText(json, Charsets.UTF_8)
                    Log.i(TAG, "Config saved via bridge (${json.length} chars)")
                    true
                } else false
            } catch (e: Exception) {
                Log.e(TAG, "Failed to save user config via bridge", e)
                false
            }
        }

        @JavascriptInterface
        fun checkForUpdates(): String {
            return try {
                kotlinx.coroutines.runBlocking(Dispatchers.IO) {
                    AppUpdater.checkForUpdate(context, force = true)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Manual checkForUpdates bridge error", e)
                "error"
            }
        }

        @JavascriptInterface
        fun getAutoStartConfig(): String {
            return try {
                val prefs = context.getSharedPreferences(BootReceiver.PREFS_NAME, Context.MODE_PRIVATE)
                val enabled = prefs.getBoolean(BootReceiver.KEY_ENABLED, true)
                val days = prefs.getString(BootReceiver.KEY_DAYS, "all") ?: "all"
                val window = prefs.getString(BootReceiver.KEY_WINDOW, "before_9am") ?: "before_9am"
                org.json.JSONObject().apply {
                    put("enabled", enabled)
                    put("days", days)
                    put("window", window)
                }.toString()
            } catch (e: Exception) {
                "{}"
            }
        }

        @JavascriptInterface
        fun saveAutoStartConfig(json: String): Boolean {
            return try {
                val obj = org.json.JSONObject(json)
                val prefs = context.getSharedPreferences(BootReceiver.PREFS_NAME, Context.MODE_PRIVATE)
                prefs.edit().apply {
                    if (obj.has("enabled")) putBoolean(BootReceiver.KEY_ENABLED, obj.getBoolean("enabled"))
                    if (obj.has("days")) putString(BootReceiver.KEY_DAYS, obj.getString("days"))
                    if (obj.has("window")) putString(BootReceiver.KEY_WINDOW, obj.getString("window"))
                }.apply()
                true
            } catch (e: Exception) {
                Log.e(TAG, "saveAutoStartConfig error", e)
                false
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Keep screen on for wall clock operation
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        webView = WebView(this)
        webView.layoutParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        )
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            setAllowFileAccess(false)
            setAllowContentAccess(false)
            mediaPlaybackRequiresUserGesture = false
        }

        webView.addJavascriptInterface(WebAppInterface(this), "FireClockBridge")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                val uri = request?.url ?: return null
                val host = uri.host ?: ""
                val path = uri.path ?: "/"

                if (host == APP_HOST) {
                    return handleIntercept(path)
                }
                return super.shouldInterceptRequest(view, request)
            }
        }

        val container = FrameLayout(this)
        container.layoutParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        )
        container.addView(webView)
        setContentView(container)

        // Fullscreen immersive sticky mode for Fire TV
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            or View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        )

        // Load standalone app URL intercepted locally
        webView.loadUrl(APP_URL)

        // Background update check via GitHub Releases
        CoroutineScope(Dispatchers.Main).launch {
            delay(4000)
            try {
                AppUpdater.checkForUpdate(this@MainActivity)
            } catch (e: Exception) {
                Log.w(TAG, "Update check failed silently: ${e.message}")
            }
        }
    }

    private fun handleIntercept(path: String): WebResourceResponse {
        val cleanPath = path.trimEnd('/')
        return when {
            cleanPath == "/weather" -> fetchWeather()
            cleanPath.startsWith("/cal/") -> {
                val idx = cleanPath.removePrefix("/cal/").toIntOrNull()
                if (idx != null && CAL_PROXIES.containsKey(idx)) {
                    fetchCalendar(CAL_PROXIES[idx]!!)
                } else {
                    response(404, "text/plain", "Not Found", ByteArrayInputStream(ByteArray(0)))
                }
            }
            cleanPath == "/user.json" || cleanPath == "/api" -> {
                fetchUserConfig()
            }
            else -> serveAsset(path)
        }
    }

    private fun fetchWeather(): WebResourceResponse {
        return try {
            val conn = URL(WEATHER_URL).openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.setRequestProperty("Host", "api.open-meteo.com")
            conn.setRequestProperty("Accept", "application/json")
            conn.setRequestProperty("User-Agent", "FireClock-App")
            conn.connectTimeout = 8000
            conn.readTimeout = 8000
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else (conn.errorStream ?: ByteArrayInputStream(ByteArray(0)))
            val bytes = stream.use { it.readBytes() }
            response(200, "application/json", "OK", ByteArrayInputStream(bytes))
        } catch (e: Exception) {
            Log.w(TAG, "Weather fetch failed: ${e.message}")
            response(200, "application/json", "OK", ByteArrayInputStream("{}".toByteArray(Charsets.UTF_8)))
        }
    }

    private fun fetchCalendar(targetUrl: String): WebResourceResponse {
        return try {
            val conn = URL(targetUrl).openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.setRequestProperty("Accept", "text/calendar, */*")
            conn.setRequestProperty("User-Agent", "FireClock-App")
            conn.connectTimeout = 10000
            conn.readTimeout = 10000
            val code = conn.responseCode
            if (code == 404) {
                return response(200, "text/calendar", "OK", ByteArrayInputStream(ByteArray(0)))
            }
            val stream = if (code in 200..299) conn.inputStream else (conn.errorStream ?: ByteArrayInputStream(ByteArray(0)))
            val bytes = stream.use { it.readBytes() }
            response(200, "text/calendar", "OK", ByteArrayInputStream(bytes))
        } catch (e: Exception) {
            Log.w(TAG, "Calendar fetch failed for $targetUrl: ${e.message}")
            response(200, "text/calendar", "OK", ByteArrayInputStream(ByteArray(0)))
        }
    }

    private fun fetchUserConfig(): WebResourceResponse {
        val userFile = File(filesDir, "user.json")
        return try {
            if (userFile.exists() && userFile.length() > 0) {
                response(200, "application/json", "OK", FileInputStream(userFile))
            } else {
                response(200, "application/json", "OK", assets.open("fireclock_user.json"))
            }
        } catch (e: Exception) {
            Log.w(TAG, "fetchUserConfig error", e)
            response(200, "application/json", "OK", ByteArrayInputStream("{}".toByteArray(Charsets.UTF_8)))
        }
    }

    private fun serveAsset(path: String): WebResourceResponse {
        var assetPath = if (path == "/" || path.isBlank()) "index.html" else path.removePrefix("/")
        return try {
            val stream = try {
                assets.open(assetPath)
            } catch (_: Exception) {
                if (assetPath != "index.html") {
                    try {
                        assetPath = "index.html"
                        assets.open("index.html")
                    } catch (_: Exception) {
                        return response(404, "text/plain", "Not Found", ByteArrayInputStream(ByteArray(0)))
                    }
                } else {
                    return response(404, "text/plain", "Not Found", ByteArrayInputStream(ByteArray(0)))
                }
            }
            response(200, mimeType(assetPath), "OK", stream)
        } catch (e: Exception) {
            Log.w(TAG, "serveAsset error on $assetPath", e)
            response(404, "text/plain", "Not Found", ByteArrayInputStream(ByteArray(0)))
        }
    }

    private fun response(
        statusCode: Int,
        mimeType: String,
        reason: String,
        stream: InputStream
    ): WebResourceResponse {
        val headers = mapOf(
            "Access-Control-Allow-Origin" to "*",
            "Access-Control-Allow-Methods" to "GET, POST, PUT, OPTIONS",
            "Access-Control-Allow-Headers" to "Content-Type, Accept, Authorization",
            "Cache-Control" to "no-cache, no-store, must-revalidate"
        )
        return WebResourceResponse(mimeType, "UTF-8", statusCode, reason, headers, stream)
    }

    private fun mimeType(name: String): String {
        return when {
            name.endsWith(".css") -> "text/css"
            name.endsWith(".js") -> "application/javascript"
            name.endsWith(".json") -> "application/json"
            name.endsWith(".ics") -> "text/calendar"
            name.endsWith(".html") || name.endsWith(".htm") -> "text/html"
            name.endsWith(".svg") -> "image/svg+xml"
            name.endsWith(".png") -> "image/png"
            name.endsWith(".jpg") || name.endsWith(".jpeg") -> "image/jpeg"
            name.endsWith(".ico") -> "image/x-icon"
            name.endsWith(".woff2") -> "font/woff2"
            name.endsWith(".woff") -> "font/woff"
            name.endsWith(".ttf") -> "font/ttf"
            else -> "application/octet-stream"
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
    }
}
