package com.tapchipswipe.fireclock

import android.app.Activity
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private var loadAttempts = 0
    private val maxRetries = 5

    companion object {
        private const val TAG = "MainActivity"
        private const val LOCAL_URL = "http://127.0.0.1:8080/"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Keep screen on for wall clock operation
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // Start embedded NanoHTTPD server
        EmbeddedServer.start(this)

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

        webView.webViewClient = object : WebViewClient() {
            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError
            ) {
                Log.w(TAG, "WebView error: ${error.description}")
                if (request.isForMainFrame && loadAttempts < maxRetries) {
                    loadAttempts++
                    view.postDelayed({
                        Log.i(TAG, "Retrying local URL load (attempt $loadAttempts)...")
                        view.loadUrl(LOCAL_URL)
                    }, 800)
                }
            }

            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                loadAttempts = 0
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

        // Load the local server URL
        webView.loadUrl(LOCAL_URL)

        // Background update check via GitHub Releases
        CoroutineScope(Dispatchers.Main).launch {
            delay(3000)
            try {
                AppUpdater.checkForUpdate(this@MainActivity)
            } catch (e: Exception) {
                Log.w(TAG, "Update check failed silently: ${e.message}")
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        EmbeddedServer.stop()
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
