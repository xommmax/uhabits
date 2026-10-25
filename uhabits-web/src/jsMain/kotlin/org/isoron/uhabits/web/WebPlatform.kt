/*
 * This file is part of Loop Habit Tracker (web port).
 * Licensed under the GNU General Public License v3 or later; see LICENSE.txt.
 */

package org.isoron.uhabits.web

import kotlinx.browser.localStorage
import org.isoron.platform.gui.Image
import org.isoron.platform.io.FileOpener
import org.isoron.platform.io.JsFileStorage
import org.isoron.platform.io.JsUserFile
import org.isoron.platform.io.ResourceFile
import org.isoron.platform.io.UserFile
import org.isoron.uhabits.core.preferences.Preferences

/** Resource file whose content is bundled into the app (e.g. migrations). */
class BundledResourceFile(private val path: String, private val content: String?) : ResourceFile {
    override suspend fun copyTo(dest: UserFile) = dest.writeString(read())

    override suspend fun lines(): List<String> {
        val result = read().lines()
        return if (result.lastOrNull() == "") result.dropLast(1) else result
    }

    override suspend fun exists(): Boolean = content != null

    override suspend fun toImage(): Image = error("Images are not bundled: $path")

    private fun read(): String = content ?: error("Resource not found: $path")
}

class WebFileOpener(
    private val resources: Map<String, String>,
    val storage: JsFileStorage
) : FileOpener {
    override fun openResourceFile(path: String): ResourceFile =
        BundledResourceFile(path, resources[path])

    override fun openUserFile(path: String): UserFile = JsUserFile(storage, path)
}

/** Preferences kept in the browser's localStorage; they are not part of backups (same as Android). */
class LocalStoragePreferences : Preferences.Storage {
    private fun key(k: String) = "pref:$k"

    override fun clear() {
        val keys = (0 until localStorage.length).mapNotNull { localStorage.key(it) }
        keys.filter { it.startsWith("pref:") }.forEach { localStorage.removeItem(it) }
    }

    override fun getBoolean(key: String, defValue: Boolean) =
        localStorage.getItem(key(key))?.toBooleanStrictOrNull() ?: defValue

    override fun getInt(key: String, defValue: Int) =
        localStorage.getItem(key(key))?.toIntOrNull() ?: defValue

    override fun getLong(key: String, defValue: Long) =
        localStorage.getItem(key(key))?.toLongOrNull() ?: defValue

    override fun getString(key: String, defValue: String) =
        localStorage.getItem(key(key)) ?: defValue

    override fun putBoolean(key: String, value: Boolean) = localStorage.setItem(key(key), value.toString())
    override fun putInt(key: String, value: Int) = localStorage.setItem(key(key), value.toString())
    override fun putLong(key: String, value: Long) = localStorage.setItem(key(key), value.toString())
    override fun putString(key: String, value: String) = localStorage.setItem(key(key), value)
    override fun remove(key: String) = localStorage.removeItem(key(key))
}
