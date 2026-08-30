package com.tapchipswipe.fireclock

import android.content.Context
import android.util.Log
import fi.iki.elonen.NanoHTTPD
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

class FireClockHttpServer(
    port: Int,
    private val context: Context
) : NanoHTTPD(port) {

    private val userFile = File(context.filesDir, "user.json")

    companion object {
        private const val TAG = "FireClockHttpServer"
        private val CAL_PROXIES = mapOf(
            0 to "https://ics.armssoftware.com/production/ics/eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJhcm1zX3VzZXIiOjEzNjg3MjgsImNhbGVuZGFyX3ZpZXdfaWQiOiIxOTAwMSIsImlhdCI6MTc3NTUwMDkzOX0.0jjtP-seyjZPU54NvM0SKvNFetHDaRCsUawrP7Nk7IbSaSJfSR7Re4IbsZ8CZ13rbFVnLJPEhoFLRKIj1XMXhQ",
            1 to "https://firebasestorage.googleapis.com/v0/b/rqp-5-0-0-calendars/o/WYEdtb0n4t7E6hFTrThR%2F850a60a5-28d6-4b74-87b5-e8038de994c2-FvVlOmbYzjfM5VYsbLF2CrJGfsA3.ics?alt=media&token=0abf57c0-d5b5-40ae-ba77-4481ccd6715d",
            2 to "https://calendar.google.com/calendar/ical/despotlucas%40gmail.com/public/basic.ics",
            3 to "https://calendar.google.com/calendar/ical/23pchloe%40gmail.com/public/basic.ics"
        )
        private const val WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=42.99&longitude=-71.48&current=temperature_2m,weather_code,apparent_temperature&hourly=precipitation_probability&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset&temperature_unit=fahrenheit&precipitation_unit=inch&wind_speed_unit=mph&timezone=auto&forecast_days=1"
    }

    override fun serve(session: IHTTPSession): Response {
        return try {
            handle(session)
        } catch (e: Exception) {
            Log.e(TAG, "Serve error on ${session.uri}", e)
            corsResponse(Response.Status.INTERNAL_ERROR, "text/plain", "Server Error")
        }
    }

    private fun handle(session: IHTTPSession): Response {
        val rawUri = session.uri ?: "/"
        val uri = if (rawUri.contains("?")) rawUri.substringBefore("?") else rawUri
        val method = session.method ?: Method.GET

        if (method == Method.OPTIONS) {
            return corsResponse(Response.Status.OK)
        }

        return when {
            uri == "/weather" -> proxyWeather()
            uri.startsWith("/cal/") -> {
                val idx = uri.removePrefix("/cal/").toIntOrNull()
                if (idx != null && CAL_PROXIES.containsKey(idx)) {
                    proxyCalendar(CAL_PROXIES[idx]!!)
                } else {
                    corsResponse(Response.Status.NOT_FOUND)
                }
            }
            uri == "/user.json" -> {
                when (method) {
                    Method.GET -> handleUserJsonGet()
                    else -> corsResponse(Response.Status.METHOD_NOT_ALLOWED)
                }
            }
            uri == "/api/" || uri == "/api" -> {
                when (method) {
                    Method.GET -> handleUserJsonGet()
                    Method.PUT, Method.POST -> handleUserJsonPut(session)
                    else -> corsResponse(Response.Status.METHOD_NOT_ALLOWED)
                }
            }
            else -> serveAsset(uri)
        }
    }

    private fun serveAsset(uri: String): Response {
        var assetPath = if (uri == "/" || uri.isBlank()) "index.html" else uri.removePrefix("/")
        return try {
            val stream = try {
                context.assets.open(assetPath)
            } catch (_: Exception) {
                if (assetPath != "index.html") {
                    try {
                        assetPath = "index.html"
                        context.assets.open("index.html")
                    } catch (_: Exception) {
                        return corsResponse(Response.Status.NOT_FOUND)
                    }
                } else {
                    return corsResponse(Response.Status.NOT_FOUND)
                }
            }
            corsResponse(Response.Status.OK, stream, mimeType(assetPath))
        } catch (e: Exception) {
            Log.w(TAG, "Failed to serve asset: $assetPath", e)
            corsResponse(Response.Status.NOT_FOUND)
        }
    }

    private fun handleUserJsonGet(): Response {
        return try {
            if (userFile.exists() && userFile.length() > 0) {
                val input = FileInputStream(userFile)
                corsResponse(Response.Status.OK, input, "application/json; charset=utf-8")
            } else {
                val stream = context.assets.open("fireclock_user.json")
                corsResponse(Response.Status.OK, stream, "application/json; charset=utf-8")
            }
        } catch (e: Exception) {
            Log.w(TAG, "handleUserJsonGet fallback to empty object", e)
            corsResponse(Response.Status.OK, "application/json; charset=utf-8", "{}")
        }
    }

    private fun handleUserJsonPut(session: IHTTPSession): Response {
        return try {
            val bodySize = session.headers["content-length"]?.toLongOrNull() ?: 0L
            val bytes = if (bodySize > 0) {
                val buf = ByteArray(bodySize.coerceAtMost(2 * 1024 * 1024L).toInt())
                val stream = session.inputStream
                var total = 0
                while (total < buf.size) {
                    val read = stream.read(buf, total, buf.size - total)
                    if (read <= 0) break
                    total += read
                }
                buf.copyOf(total)
            } else {
                ByteArray(0)
            }
            val json = String(bytes, Charsets.UTF_8)
            if (json.isNotBlank()) {
                userFile.writeText(json, Charsets.UTF_8)
                Log.i(TAG, "Saved user.json (${json.length} chars)")
            }
            corsResponse(Response.Status.OK, "application/json; charset=utf-8", "{\"ok\":true}")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save user.json", e)
            corsResponse(Response.Status.BAD_REQUEST, "application/json; charset=utf-8", "{\"error\":\"${e.message}\"}")
        }
    }

    private fun proxyWeather(): Response {
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
            corsResponse(Response.Status.OK, ByteArrayInputStream(bytes), "application/json; charset=utf-8")
        } catch (e: Exception) {
            Log.w(TAG, "Weather proxy failed: ${e.message}")
            corsResponse(Response.Status.OK, "application/json; charset=utf-8", "{}")
        }
    }

    private fun proxyCalendar(targetUrl: String): Response {
        return try {
            val conn = URL(targetUrl).openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.setRequestProperty("Accept", "text/calendar, */*")
            conn.setRequestProperty("User-Agent", "FireClock-App")
            conn.connectTimeout = 10000
            conn.readTimeout = 10000
            val code = conn.responseCode
            if (code == 404) {
                return corsResponse(Response.Status.OK, ByteArrayInputStream(ByteArray(0)), "text/calendar; charset=utf-8")
            }
            val stream = if (code in 200..299) conn.inputStream else (conn.errorStream ?: ByteArrayInputStream(ByteArray(0)))
            val bytes = stream.use { it.readBytes() }
            corsResponse(Response.Status.OK, ByteArrayInputStream(bytes), "text/calendar; charset=utf-8")
        } catch (e: Exception) {
            Log.w(TAG, "Calendar proxy failed for $targetUrl: ${e.message}")
            corsResponse(Response.Status.OK, ByteArrayInputStream(ByteArray(0)), "text/calendar; charset=utf-8")
        }
    }

    private fun corsResponse(status: Response.IStatus, mimeType: String = "text/plain", body: String = ""): Response {
        val r = newFixedLengthResponse(status, mimeType, body)
        r.addHeader("Access-Control-Allow-Origin", "*")
        r.addHeader("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS")
        r.addHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization")
        r.addHeader("Cache-Control", "no-cache, no-store, must-revalidate")
        return r
    }

    private fun corsResponse(status: Response.IStatus, input: InputStream, mime: String): Response {
        val r = newChunkedResponse(status, mime, input)
        r.addHeader("Access-Control-Allow-Origin", "*")
        r.addHeader("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS")
        r.addHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization")
        return r
    }

    private fun mimeType(name: String): String {
        return when {
            name.endsWith(".css") -> "text/css; charset=utf-8"
            name.endsWith(".js") -> "application/javascript; charset=utf-8"
            name.endsWith(".json") -> "application/json; charset=utf-8"
            name.endsWith(".ics") -> "text/calendar; charset=utf-8"
            name.endsWith(".html") || name.endsWith(".htm") -> "text/html; charset=utf-8"
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
}

object EmbeddedServer {
    private var server: FireClockHttpServer? = null
    private const val TAG = "EmbeddedServer"
    const val PORT = 8080

    fun start(context: Context) {
        if (server != null) return
        try {
            server = FireClockHttpServer(PORT, context.applicationContext)
            server?.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false)
            Log.i(TAG, "EmbeddedServer started on port $PORT")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start EmbeddedServer", e)
        }
    }

    fun stop() {
        try {
            server?.stop()
            server = null
            Log.i(TAG, "EmbeddedServer stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping server", e)
        }
    }
}
