/*
 * This file is part of Loop Habit Tracker (web port).
 * Licensed under the GNU General Public License v3 or later; see LICENSE.txt.
 */

package org.isoron.uhabits.web

import org.isoron.platform.io.Database
import org.isoron.platform.io.DatabaseOpener
import org.isoron.platform.io.JsFileStorage
import org.isoron.platform.io.PreparedStatement
import org.isoron.platform.io.StepResult
import org.khronos.webgl.Int8Array
import org.khronos.webgl.Uint8Array

private fun newSqlJsDatabase(sqlJs: dynamic, data: Uint8Array?): dynamic =
    if (data == null) js("new sqlJs.Database()") else js("new sqlJs.Database(data)")

fun ByteArray.toUint8Array(): Uint8Array {
    val signed = unsafeCast<Int8Array>()
    return Uint8Array(signed.buffer, signed.byteOffset, signed.length)
}

fun Uint8Array.toByteArray(): ByteArray =
    Int8Array(buffer, byteOffset, length).unsafeCast<ByteArray>()

/**
 * sql.js database used as the app's live storage.
 *
 * Unlike core's JsDatabase, this one survives [export]: sql.js frees every
 * prepared statement when exporting, while the core repositories cache theirs,
 * so statements re-prepare themselves after each export.
 */
class WebDatabase(private val sqlJs: dynamic, data: Uint8Array? = null) : Database {
    internal val db: dynamic = newSqlJsDatabase(sqlJs, data)
    internal var generation = 0
        private set

    /** Called after any statement that may have modified the database. */
    var onWrite: () -> Unit = {}

    override fun prepareStatement(sql: String): PreparedStatement = WebPreparedStatement(this, sql)

    override fun close() {
        db.close()
    }

    fun export(): Uint8Array {
        val bytes = db.export().unsafeCast<Uint8Array>()
        generation++
        return bytes
    }
}

private class WebPreparedStatement(
    private val owner: WebDatabase,
    private val sql: String
) : PreparedStatement {
    private val isRead = sql.trimStart().uppercase().let {
        it.startsWith("SELECT") || (it.startsWith("PRAGMA") && !it.contains("="))
    }
    private var stmt: dynamic = owner.db.prepare(sql)
    private var generation = owner.generation
    private var currentRow: dynamic = null
    private var bindings: dynamic = js("[]")
    private var needsBind = false

    private fun ensurePrepared() {
        if (generation == owner.generation) return
        stmt = owner.db.prepare(sql)
        generation = owner.generation
        needsBind = true
    }

    override fun step(): StepResult {
        ensurePrepared()
        if (needsBind) {
            stmt.bind(bindings)
            needsBind = false
        }
        val hasRow = stmt.step() as Boolean
        currentRow = if (hasRow) stmt.get() else null
        if (!isRead) owner.onWrite()
        return if (hasRow) StepResult.ROW else StepResult.DONE
    }

    override fun getInt(index: Int): Int = (currentRow[index] as Number).toInt()
    override fun getLong(index: Int): Long = (currentRow[index] as Number).toLong()
    override fun getReal(index: Int): Double = (currentRow[index] as Number).toDouble()
    override fun getText(index: Int): String = currentRow[index] as String

    override fun getIntOrNull(index: Int): Int? = (currentRow[index] as Number?)?.toInt()
    override fun getLongOrNull(index: Int): Long? = (currentRow[index] as Number?)?.toLong()
    override fun getRealOrNull(index: Int): Double? = (currentRow[index] as Number?)?.toDouble()
    override fun getTextOrNull(index: Int): String? = currentRow[index] as String?

    private fun bind(index: Int, value: Any?) {
        bindings[index - 1] = value
        needsBind = true
    }

    override fun bindInt(index: Int, value: Int) = bind(index, value)
    override fun bindLong(index: Int, value: Long) = bind(index, value.toDouble())
    override fun bindReal(index: Int, value: Double) = bind(index, value)
    override fun bindText(index: Int, value: String) = bind(index, value)
    override fun bindNull(index: Int) = bind(index, null)

    override fun reset() {
        ensurePrepared()
        stmt.reset()
        currentRow = null
        bindings = js("[]")
        needsBind = false
    }

    override fun finalize() {
        if (generation == owner.generation) stmt.free()
    }
}

/** Opens databases (such as backups being imported) from in-memory file storage. */
class WebDatabaseOpener(
    private val sqlJs: dynamic,
    private val storage: JsFileStorage
) : DatabaseOpener {
    override fun open(path: String): Database {
        val bytes = storage.read(path) ?: error("File not found: $path")
        return WebDatabase(sqlJs, bytes.toUint8Array())
    }
}
