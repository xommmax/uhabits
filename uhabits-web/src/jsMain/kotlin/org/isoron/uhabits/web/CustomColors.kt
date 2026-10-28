/*
 * This file is part of Loop Habit Tracker (web port).
 * Licensed under the GNU General Public License v3 or later; see LICENSE.txt.
 */

package org.isoron.uhabits.web

import org.isoron.platform.gui.Color
import org.isoron.platform.io.Database
import org.isoron.platform.io.StepResult
import org.isoron.platform.io.run
import org.isoron.uhabits.core.models.Habit
import org.isoron.uhabits.core.ui.views.DarkTheme
import org.isoron.uhabits.core.ui.views.LightTheme
import org.isoron.uhabits.core.ui.views.PureBlackTheme
import org.isoron.uhabits.core.ui.views.Theme
import kotlin.math.cbrt
import kotlin.math.pow

private const val PALETTE_SIZE = 20

/** The light theme's palette, which Habits.color indexes. */
private val palette = LightTheme().let { theme -> List(PALETTE_SIZE) { theme.color(it) } }

/**
 * Colors picked outside Loop's 20-color palette (web only).
 *
 * Habits.color keeps the nearest palette color, so backups stay valid for Android, which ignores
 * the extra table. A row only applies while the habit still has that palette color: if the color
 * was changed elsewhere (Android, or picking a palette color here), the row is stale and ignored.
 */
class CustomColors(private val db: Database) {
    private class Entry(val rgb: Int, val paletteIndex: Int)

    private val entries = mutableMapOf<String, Entry>()

    init {
        db.run("CREATE TABLE IF NOT EXISTS WebCustomColors (habit_uuid TEXT PRIMARY KEY, color INTEGER NOT NULL, palette_index INTEGER NOT NULL)")
        entries.putAll(read(db))
    }

    /** The custom color of [habit] as 0xRRGGBB, or null if it uses a palette color. */
    fun get(habit: Habit): Int? =
        entries[habit.uuid]?.takeIf { it.paletteIndex == habit.color.paletteIndex }?.rgb

    fun set(uuid: String, rgb: Int?) {
        if (rgb == null) {
            if (entries.remove(uuid) == null) return
            db.run("DELETE FROM WebCustomColors WHERE habit_uuid = ?") { bindText(1, uuid) }
            return
        }
        store(uuid, Entry(rgb, nearestPaletteIndex(rgb)))
    }

    /**
     * After a Loop backup was imported: the backup's habits replaced the local ones with the same
     * uuid, so their custom colors are now the backup's (none for a backup made by Android).
     */
    fun importFrom(source: Database) {
        val imported = read(source)
        val stmt = source.prepareStatement("SELECT uuid FROM Habits WHERE uuid IS NOT NULL")
        val uuids = mutableListOf<String>()
        while (stmt.step() == StepResult.ROW) uuids.add(stmt.getText(0))
        stmt.finalize()
        for (uuid in uuids) {
            val entry = imported[uuid]
            if (entry != null) store(uuid, entry) else set(uuid, null)
        }
    }

    private fun store(uuid: String, entry: Entry) {
        entries[uuid] = entry
        db.run("INSERT OR REPLACE INTO WebCustomColors (habit_uuid, color, palette_index) VALUES (?, ?, ?)") {
            bindText(1, uuid)
            bindInt(2, entry.rgb)
            bindInt(3, entry.paletteIndex)
        }
    }

    /** Light theme for [habit], with its custom color in place of its palette color. */
    fun lightTheme(habit: Habit, base: LightTheme): Theme {
        val rgb = get(habit) ?: return base
        return object : LightTheme() {
            override fun color(paletteIndex: Int) = Color(rgb)
        }
    }

    /** Dark theme for [habit]: like Loop's dark palette, the custom color is lightened. */
    fun darkTheme(habit: Habit, base: DarkTheme): Theme {
        val rgb = get(habit) ?: return base
        val color = darkVariant(rgb)
        return if (base is PureBlackTheme) {
            CustomPureBlackTheme(color)
        } else {
            object : DarkTheme() {
                override fun color(paletteIndex: Int) = color
            }
        }
    }

    private fun read(source: Database): Map<String, Entry> {
        val result = mutableMapOf<String, Entry>()
        val exists = source.prepareStatement("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'WebCustomColors'")
        val hasTable = exists.step() == StepResult.ROW
        exists.finalize()
        if (!hasTable) return result
        val stmt = source.prepareStatement("SELECT habit_uuid, color, palette_index FROM WebCustomColors")
        while (stmt.step() == StepResult.ROW) {
            result[stmt.getText(0)] = Entry(stmt.getInt(1), stmt.getInt(2))
        }
        stmt.finalize()
        return result
    }
}

/** Core's PureBlackTheme is final: the same colors, with a custom habit color. */
class CustomPureBlackTheme(private val habitColor: Color) : DarkTheme() {
    override val appBackgroundColor = Color(0x000000)
    override val cardBackgroundColor = Color(0x000000)
    override val lowContrastTextColor = Color(0x212121)
    override fun color(paletteIndex: Int) = habitColor
}

/** Loop's dark palette is roughly each light color mixed half with white (D32F2F → EF9A9A). */
fun darkVariant(rgb: Int): Color {
    val c = Color(rgb)
    return Color(c.red + (1 - c.red) / 2, c.green + (1 - c.green) / 2, c.blue + (1 - c.blue) / 2, 1.0)
}

/** Palette color closest to [rgb], by distance in CIELAB, which follows perceived color difference. */
fun nearestPaletteIndex(rgb: Int): Int {
    val lab = toLab(Color(rgb))
    return palette.indices.minByOrNull { i ->
        val p = toLab(palette[i])
        (0..2).sumOf { (lab[it] - p[it]).pow(2) }
    }!!
}

private fun toLab(c: Color): DoubleArray {
    fun linear(v: Double) = if (v <= 0.04045) v / 12.92 else ((v + 0.055) / 1.055).pow(2.4)
    val r = linear(c.red)
    val g = linear(c.green)
    val b = linear(c.blue)
    // D65 white
    val x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    val y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    val z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
    fun f(t: Double) = if (t > 216.0 / 24389) cbrt(t) else (24389.0 / 27 * t + 16) / 116
    return doubleArrayOf(116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z)))
}
