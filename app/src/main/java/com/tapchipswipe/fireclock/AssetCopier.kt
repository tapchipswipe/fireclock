package com.tapchipswipe.fireclock

import android.content.Context
import java.io.File

object AssetCopier {
    private const val SENTINEL = ".initialized"

    fun ensureInitialized(context: Context) {
        val filesDir = context.filesDir
        val sentinel = File(filesDir, SENTINEL)
        if (sentinel.exists()) return

        try {
            val assets = context.assets.list("") ?: return
            for (name in assets) {
                val outFile = File(filesDir, name)
                if (outFile.exists()) continue
                context.assets.open(name).use { input ->
                    outFile.outputStream().use { output ->
                        input.copyTo(output)
                    }
                }
            }
            sentinel.createNewFile()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
