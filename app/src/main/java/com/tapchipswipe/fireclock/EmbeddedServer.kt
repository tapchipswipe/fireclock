package com.tapchipswipe.fireclock

import android.content.Context
import android.util.Log
import fi.iki.elonen.NanoHTTPD
import fi.iki.elonen.NanoHTTPD.IHTTPSession
import fi.iki.elonen.NanoHTTPD.Method
import fi.iki.elonen.NanoHTTPD.Response
import fi.iki.elonen.NanoHTTPD.Response.IStatus
import fi.iki.elonen.NanoHTTPD.Response.Status
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

object EmbeddedServer {
    private var server: NanoHTTPD? = null
    private const val TAG = "EmbeddedServer"
    private const val PORT = 8080

    private val CAL_PROXIES = mapOf(
        0 to "https://ics.armssoftware.com/production/ics/eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJhcm1zX3VzZXIiOjEzNjg3MjgsImNhbGVuZGFyX3ZpZXdfaWQiOiIxOTAwMSIsImlhdCI6MTc3NTUwMDkzOX0.0jjtP-seyjZPU54NvM0SKvNFetHDaRCsUawrP7Nk7IbSaSJfSR7Re4IbsZ8CZ13rbFVnLJPEhoFLRKIj1XMXhQ",
        1 to "https://firebasestorage.googleapis.com/v0/b/rqp-5-0-0-calendars/o/WYEdtb0n4t7E6hFTrThR%2F850a60a5-28d6-4b74-87b5-e8038de994c2-FvVlOmbYzjfM5VYsbLF2CrJGfsA3.ics?alt=media&token=0abf57c0-d5b5-40ae-ba77-4481ccd6715d",
        2 to "https://calendar.google.com/calendar/ical/despotlucas%40gmail.com/public/basic.ics",
        3 to "https://calendar.google.com/calendar/ical/23pchloe%40gmail.com/public/basic.ics"
    )

    private val WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=42.99&longitude=-71.48&current=temperature_2m,weather_code,apparent_temperature&hourly=precipitation_probability&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset&temperature_unit=fahrenheit&precipitation_unit=inch&wind_speed_unit=mph&timezone=auto&forecast_days=1"

    private lateinit var rootDir: File
    private lateinit var userFile: File

    fun start(context: Context) {
        if (server != null) return
        rootDir = context.filesDir
        userFile = File(rootDir, "user.json")
        server = object : NanoHTTPD(PORT) {
            override fun serve(session: IHTTPSession): Response {
                return try {
                    handle(session)
                } catch (e: Exception) {
                    Log.e(TAG, "Serve error", e)
                    corsResponse(Status.INTERNAL_ERROR)
                }
            }
        }
        try {
            server?.start()
            Log.i(TAG, "Server started on port $PORT")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start server", e)
        }
    }

    fun stop() {
        try {
            server?.stop()
            server = null
            Log.i(TAG, "Server stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping server", e)
        }
    }

    private fun handle(session: IHTTPSession): Response {
        val uri = session.uri ?: "/"
        val method = session.method ?: Method.GET

        return when {
            method == Method.OPTIONS -> corsResponse(Status.OK)
            uri == "/api/" || uri.startsWith("/api") -> {
                when (method) {
                    Method.GET -> handleApiGet()
                    Method.PUT -> handleApiPut(session)
                    else -> corsResponse(Status.METHOD_NOT_ALLOWED)
                }
            }
            uri == "/weather" -> proxyWeather()
            uri.startsWith("/cal/") -> {
                val idx = uri.removePrefix("/cal/").toIntOrNull()
                if (idx != null && CAL_PROXIES.containsKey(idx)) proxyCalendar(CAL_PROXIES[idx]!!)
                else corsResponse(Status.NOT_FOUND)
            }
            else -> serveStatic(uri)
        }
    }

    private fun serveStatic(uri: String): Response {
        val path = if (uri == "/") "/index.html" else uri
        val file = File(rootDir, path)
        if (!file.exists() || !file.isFile) {
            if (uri == "/") {
                return fallbackResponse()
            }
            return corsResponse(Status.NOT_FOUND)
        }
        return try {
            val input = FileInputStream(file)
            corsResponse(Status.OK, input, mimeType(file.name))
        } catch (e: Exception) {
            corsResponse(Status.INTERNAL_ERROR)
        }
    }

    private fun fallbackResponse(): Response {
        val html = "<html><body><h1>FireClock</h1><p>Server is running, but index.html is missing.</p></body></html>"
        return corsResponse(Status.OK, html.byteInputStream(), "text/html")
    }

    private fun handleApiGet(): Response {
        return try {
            if (!userFile.exists()) {
                corsResponse(Status.NOT_FOUND, "{}".byteInputStream(), "application/json")
            } else {
                val input = FileInputStream(userFile)
                corsResponse(Status.OK, input, "application/json")
            }
        } catch (e: Exception) {
            corsResponse(Status.INTERNAL_ERROR)
        }
    }

    private fun handleApiPut(session: IHTTPSession): Response {
        return try {
            val body = session.headers["content-length"]?.toLongOrNull() ?: 0
            val bytes = if (body > 0) {
                val buf = ByteArray(body.coerceAtMost(1024 * 1024).toInt())
                val stream = session.inputStream
                var read = 0
                var total = 0
                while (total < buf.size && stream.read(buf, total, buf.size - total).also { read = it } > 0) {
                    total += read
                }
                buf.copyOf(total)
            } else {
                byteArrayOf()
            }
            val json = String(bytes)
            userFile.writeText(json)
            corsResponse(Status.OK, "{\"ok\":true}".byteInputStream(), "application/json")
        } catch (e: Exception) {
            corsResponse(Status.BAD_REQUEST, "{\"error\":\"${e.message}\"}".byteInputStream(), "application/json")
        }
    }

    private fun proxyWeather(): Response {
        return try {
            val conn = URL(WEATHER_URL).openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.setRequestProperty("Host", "api.open-meteo.com")
            conn.setRequestProperty("Accept", "application/json")
            conn.connectTimeout = 8000
            conn.readTimeout = 8000
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            corsResponse(Status.OK, stream, "application/json")
        } catch (e: Exception) {
            corsResponse(Status.INTERNAL_ERROR)
        }
    }

    private fun proxyCalendar(targetUrl: String): Response {
        return try {
            val conn = URL(targetUrl).openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.setRequestProperty("Accept", "text/calendar, */*")
            conn.setRequestProperty("Host", URL(targetUrl).host)
            conn.connectTimeout = 8000
            conn.readTimeout = 8000
            val code = conn.responseCode
            if (code == 404) {
                return corsResponse(Status.OK, ByteArray(0).inputStream(), "text/calendar")
            }
            val stream = conn.inputStream
            corsResponse(Status.OK, stream, "text/calendar")
        } catch (e: Exception) {
            corsResponse(Status.INTERNAL_ERROR)
        }
    }

    private fun corsResponse(status: IStatus, body: String = ""): Response {
        val r = NanoHTTPD.newFixedLengthResponse(status, "text/plain", body)
        r.addHeader("Access-Control-Allow-Origin", "*")
        r.addHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
        r.addHeader("Access-Control-Allow-Headers", "Content-Type")
        return r
    }

    private fun corsResponse(status: IStatus, input: InputStream, mime: String): Response {
        val r = NanoHTTPD.newChunkedResponse(status, mime, input)
        r.addHeader("Access-Control-Allow-Origin", "*")
        r.addHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
        r.addHeader("Access-Control-Allow-Headers", "Content-Type")
        return r
    }

    private fun mimeType(name: String): String {
        return when {
            name.endsWith(".css") -> "text/css"
            name.endsWith(".js") -> "application/javascript"
            name.endsWith(".json") -> "application/json"
            name.endsWith(".ics") -> "text/calendar"
            name.endsWith(".html") -> "text/html"
            else -> "application/octet-stream"
        }
    }
}
