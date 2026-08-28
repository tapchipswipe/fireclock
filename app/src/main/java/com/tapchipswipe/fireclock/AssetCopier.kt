package com.tapchipswipe.fireclock

import android.content.Context
import android.util.Log
import java.io.File

object AssetCopier {
    private const val TAG = "AssetCopier"
    private const val SENTINEL = ".initialized"

    fun ensureInitialized(context: Context) {
        val filesDir = context.filesDir
        val sentinel = File(filesDir, SENTINEL)
        if (sentinel.exists()) return

        try {
            val assets = context.assets.list("") ?: return
            Log.i(TAG, "Copying ${assets.size} assets to ${filesDir.absolutePath}")
            for (name in assets) {
                val outFile = File(filesDir, name)
                if (outFile.exists()) {
                    Log.i(TAG, "Skip existing: $name")
                    continue
                }
                context.assets.open(name).use { input ->
                    outFile.outputStream().use { output ->
                        input.copyTo(output)
                    }
                }
                Log.i(TAG, "Copied: $name (${outFile.length()} bytes)")
            }
            sentinel.createNewFile()
            Log.i(TAG, "Initialization complete")
        } catch (e: Exception) {
            Log.e(TAG, "Initialization failed", e)
        }
    }
}
