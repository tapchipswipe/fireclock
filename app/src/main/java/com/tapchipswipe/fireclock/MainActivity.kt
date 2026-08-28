package com.tapchipswipe.fireclock

import android.app.Activity
import android.os.Bundle
import android.util.Log
import android.view.View
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private var serverStarted = false
    private var loadAttempts = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        AssetCopier.ensureInitialized(this)

        if (!serverStarted) {
            EmbeddedServer.start(this)
            serverStarted = true
        }

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
        }
        webView.webViewClient = object : WebViewClient() {
            override fun onReceivedError(
                view: WebView,
                request: android.webkit.WebResourceRequest,
                error: android.webkit.WebResourceError
            ) {
                Log.w("MainActivity", "WebView error: ${error.description}")
                if (request.isForMainFrame && loadAttempts < 5) {
                    loadAttempts++
                    view.postDelayed({ view.loadUrl("http://localhost:8080/") }, 600)
                }
            }
        }

        val container = FrameLayout(this)
        container.layoutParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        )
        container.addView(webView)
        setContentView(container)

        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            or View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
        )

        CoroutineScope(Dispatchers.Main).launch {
            delay(800)
            if (loadAttempts == 0) {
                webView.loadUrl("http://localhost:8080/")
            }
            AppUpdater.checkForUpdate(this@MainActivity)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        EmbeddedServer.stop()
    }

    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) webView.goBack()
        else super.onBackPressed()
    }
}
