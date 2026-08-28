package com.tapchipswipe.fireclock

import android.app.Activity
import android.os.Bundle
import android.view.View
import android.webkit.WebView
import android.webkit.WebViewClient

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private var serverStarted = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        AssetCopier.ensureInitialized(this)

        if (!serverStarted) {
            EmbeddedServer.start(this)
            serverStarted = true
        }

        webView = WebView(this)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            setAllowFileAccess(false)
            setAllowContentAccess(false)
        }
        webView.webViewClient = WebViewClient()
        webView.loadUrl("http://localhost:8080/")

        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            or View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
        )

        setContentView(webView)
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
