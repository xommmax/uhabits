/*
 * This file is part of Loop Habit Tracker (web port).
 * Licensed under the GNU General Public License v3 or later; see LICENSE.txt.
 */

@file:OptIn(ExperimentalJsExport::class, DelicateCoroutinesApi::class)
@file:Suppress("DEPRECATION")

package org.isoron.uhabits.web

import kotlinx.coroutines.DelicateCoroutinesApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.promise
import org.isoron.platform.gui.Color
import org.isoron.platform.io.JsFileStorage
import org.isoron.platform.io.getVersion
import org.isoron.platform.io.migrateTo
import org.isoron.platform.io.run
import org.isoron.platform.io.setVersion
import org.isoron.platform.time.LocalDate
import org.isoron.platform.time.computeToday
import org.isoron.platform.time.getToday
import org.isoron.platform.time.setFirstWeekday
import org.isoron.platform.time.setToday
import org.isoron.uhabits.core.DATABASE_VERSION
import org.isoron.uhabits.core.commands.ArchiveHabitsCommand
import org.isoron.uhabits.core.commands.Command
import org.isoron.uhabits.core.commands.CommandRunner
import org.isoron.uhabits.core.commands.CreateHabitCommand
import org.isoron.uhabits.core.commands.CreateRepetitionCommand
import org.isoron.uhabits.core.commands.DeleteHabitsCommand
import org.isoron.uhabits.core.commands.EditHabitCommand
import org.isoron.uhabits.core.commands.ReorderHabitCommand
import org.isoron.uhabits.core.commands.ReorderTarget
import org.isoron.uhabits.core.commands.UnarchiveHabitsCommand
import org.isoron.uhabits.core.io.HabitsCSVExporter
import org.isoron.uhabits.core.io.LoopDBImporter
import org.isoron.uhabits.core.io.StandardLogging
import org.isoron.uhabits.core.models.Entry
import org.isoron.uhabits.core.models.Frequency
import org.isoron.uhabits.core.models.Habit
import org.isoron.uhabits.core.models.PaletteColor
import org.isoron.uhabits.core.models.sqlite.SQLModelFactory
import org.isoron.uhabits.core.preferences.Preferences
import org.isoron.uhabits.core.tasks.CoroutineTaskRunner
import org.isoron.uhabits.core.ui.screens.habits.show.views.OverviewCardPresenter
import org.isoron.uhabits.core.ui.screens.habits.show.views.TargetCardPresenter
import org.isoron.uhabits.core.ui.views.DarkTheme
import org.isoron.uhabits.core.ui.views.LightTheme
import org.khronos.webgl.Uint8Array
import org.w3c.dom.HTMLCanvasElement
import kotlin.js.Promise
import kotlin.math.roundToInt

/** Database version of the released Android app (2.3.2); backups are exported in this format. */
const val BACKUP_DATABASE_VERSION = 25

/**
 * Opens the habit database.
 *
 * @param sqlJs the initialized sql.js module
 * @param data a previously saved database, or null to create an empty one
 * @param resources bundled files keyed by path, e.g. "migrations/09.sql"
 */
@JsExport
fun openHabitsCore(sqlJs: dynamic, data: Uint8Array?, resources: dynamic): Promise<HabitsCore> {
    val resourceMap = mutableMapOf<String, String>()
    for (key in js("Object.keys(resources)").unsafeCast<Array<String>>()) {
        resourceMap[key] = resources[key].unsafeCast<String>()
    }
    return GlobalScope.promise {
        val db = WebDatabase(sqlJs, data)
        if (data == null) db.setVersion(8)
        db.migrateTo(DATABASE_VERSION) { version ->
            val name = "migrations/${version.toString().padStart(2, '0')}.sql"
            resourceMap[name] ?: error("Missing migration: $name")
        }
        HabitsCore(sqlJs, db, resourceMap)
    }
}

@JsExport
class HabitsCore internal constructor(
    private val sqlJs: dynamic,
    private val db: WebDatabase,
    resources: Map<String, String>
) {
    private val storage = JsFileStorage()
    private val fileOpener = WebFileOpener(resources, storage)
    private val modelFactory = SQLModelFactory(db)
    private val habitList = modelFactory.buildHabitList()
    private val preferences = Preferences(LocalStoragePreferences())
    private val commandRunner = CommandRunner(CoroutineTaskRunner(Dispatchers.Default, Dispatchers.Default))
    private val lightTheme = LightTheme()
    private val darkTheme = DarkTheme()

    init {
        setToday(computeToday(preferences.midnightDelayHours, 0))
        setFirstWeekday(preferences.firstWeekday)
        for (h in habitList) h.recompute()
    }

    /** Registers a callback invoked whenever the database is modified. */
    fun setOnWrite(callback: () -> Unit) {
        db.onWrite = callback
    }

    /** Today's date, as days since 2000-01-01. */
    fun today(): Int = getToday().daysSince2000

    /** Re-reads the clock; returns true (and recomputes all habits) if the day changed. */
    fun refreshToday(): Boolean {
        val today = computeToday(preferences.midnightDelayHours, 0)
        if (today == getToday()) return false
        setToday(today)
        for (h in habitList) h.recompute()
        return true
    }

    fun listHabits(showArchived: Boolean, days: Int): Array<dynamic> {
        val today = getToday()
        return habitList
            .filter { showArchived || !it.isArchived }
            .map { habit ->
                val row = habitSummary(habit)
                row.score = habit.scores[today].value
                row.values = Array(days) { habit.computedEntries.get(today.minus(it)).value }
                row
            }.toTypedArray()
    }

    fun habitDetail(id: Int): dynamic {
        val habit = habit(id)
        val result = habitSummary(habit)
        val overview = OverviewCardPresenter.buildState(habit, lightTheme)
        result.score = overview.scoreToday.toDouble()
        result.scoreMonthDiff = overview.scoreMonthDiff.toDouble()
        result.scoreYearDiff = overview.scoreYearDiff.toDouble()
        result.totalCount = overview.totalCount.toInt()
        result.streakCount = habit.streaks.getBest(10).size
        result.targetRows = TargetCardPresenter.buildState(habit, preferences.firstWeekdayInt, lightTheme).intervals.size
        result.scoreSpinner = preferences.scoreCardSpinnerPosition
        result.barSpinner = if (habit.isNumerical) {
            preferences.barCardNumericalSpinnerPosition
        } else {
            preferences.barCardBoolSpinnerPosition
        }
        return result
    }

    /** Creates a habit (when form.id is null) or edits an existing one. Returns its id. */
    fun saveHabit(form: dynamic): Int {
        val id = form.id.unsafeCast<Int?>()
        val model = modelFactory.buildHabit()
        if (id != null) model.copyFrom(habit(id))
        model.name = form.name.unsafeCast<String>()
        model.question = form.question.unsafeCast<String>()
        model.description = form.description.unsafeCast<String>()
        model.color = PaletteColor(form.colorIndex.unsafeCast<Int>())
        model.frequency = Frequency(form.freqNum.unsafeCast<Int>(), form.freqDen.unsafeCast<Int>())
        if (id != null) {
            execute(EditHabitCommand(habitList, id.toLong(), model))
            return id
        }
        execute(CreateHabitCommand(modelFactory, habitList, model))
        return habitList.getByUUID(model.uuid)!!.id!!.toInt()
    }

    /** Cycles the check-in on [day] (days since 2000) like Android's short-toggle mode. Returns the new value. */
    fun toggle(id: Int, day: Int): Int {
        val habit = habit(id)
        val date = LocalDate(day)
        val entry = habit.computedEntries.get(date)
        if (habit.isNumerical) return entry.value
        val next = Entry.nextToggleValue(
            value = entry.value,
            isSkipEnabled = preferences.isSkipEnabled,
            areQuestionMarksEnabled = preferences.areQuestionMarksEnabled
        )
        execute(CreateRepetitionCommand(habitList, habit, date, next, entry.notes))
        return next
    }

    fun archive(ids: Array<Int>) = execute(ArchiveHabitsCommand(habitList, ids.map(::habit)))

    fun unarchive(ids: Array<Int>) = execute(UnarchiveHabitsCommand(habitList, ids.map(::habit)))

    fun delete(ids: Array<Int>) = execute(DeleteHabitsCommand(habitList, ids.map(::habit)))

    /** Moves habit [id] right before (or after) habit [refId]. */
    fun move(id: Int, refId: Int, before: Boolean) {
        val habit = habit(id)
        val ref = habit(refId)
        val target = if (before) ReorderTarget.Before(ref) else ReorderTarget.After(ref)
        execute(ReorderHabitCommand(habitList, habit, target, habit.category))
    }

    fun historyChart(canvas: HTMLCanvasElement, id: Int, dark: Boolean, padding: Double): ChartHandle =
        buildHistoryChart(canvas, habit(id), habitList, preferences, theme(dark), padding) { execute(it) }

    /** [bucket] is the position in Android's bar card spinner (Week..Year, or Day..Year if numerical). */
    fun barChart(canvas: HTMLCanvasElement, id: Int, dark: Boolean, bucket: Int): ChartHandle {
        val habit = habit(id)
        if (habit.isNumerical) {
            preferences.barCardNumericalSpinnerPosition = bucket
        } else {
            preferences.barCardBoolSpinnerPosition = bucket
        }
        return buildBarChart(canvas, habit, preferences, theme(dark))
    }

    /** [bucket] is the position in Android's score card spinner (Day, Week, Month, Quarter, Year). */
    fun scoreChart(canvas: HTMLCanvasElement, id: Int, dark: Boolean, bucket: Int): ChartHandle {
        preferences.scoreCardSpinnerPosition = bucket
        return buildScoreChart(canvas, habit(id), preferences, theme(dark), dark)
    }

    fun frequencyChart(canvas: HTMLCanvasElement, id: Int, dark: Boolean): ChartHandle =
        buildFrequencyChart(canvas, habit(id), preferences, theme(dark), dark)

    fun streakChart(canvas: HTMLCanvasElement, id: Int, dark: Boolean): ChartHandle =
        buildStreakChart(canvas, habit(id), theme(dark), dark)

    fun targetChart(canvas: HTMLCanvasElement, id: Int, dark: Boolean): ChartHandle =
        buildTargetChart(canvas, habit(id), preferences, theme(dark), dark)

    /** Zip of CSV files for the given habits, same as Android's "Export" (HabitsCSVExporter). */
    fun exportCsv(ids: Array<Int>): Promise<Uint8Array> = GlobalScope.promise {
        HabitsCSVExporter(habitList, ids.map(::habit)).writeArchive().toUint8Array()
    }

    /** Raw copy of the live database, used to persist it in the browser. */
    fun snapshot(): Uint8Array = db.export()

    /**
     * Backup file compatible with Loop for Android: same SQLite format as the
     * app's "Export full backup", downgraded to the released schema version.
     */
    fun exportBackup(): Uint8Array {
        val copy = WebDatabase(sqlJs, db.export())
        if (copy.getVersion() > BACKUP_DATABASE_VERSION) {
            // Version 26 only added Habits.category, which Android 2.3.2 does not know about.
            check(copy.getVersion() == 26) { "Cannot downgrade database version ${copy.getVersion()}" }
            copy.run("ALTER TABLE Habits DROP COLUMN category")
            copy.setVersion(BACKUP_DATABASE_VERSION)
        }
        copy.run("VACUUM")
        val bytes = copy.export()
        copy.close()
        return bytes
    }

    /** Imports a Loop backup (.db), merging it into the current habits. Resolves to false if unrecognized. */
    fun importBackup(data: Uint8Array): Promise<Boolean> = GlobalScope.promise {
        val path = "import.db"
        storage.write(path, data.toByteArray())
        try {
            val file = fileOpener.openUserFile(path)
            val importer = LoopDBImporter(
                habitList,
                modelFactory,
                WebDatabaseOpener(sqlJs, storage),
                commandRunner,
                StandardLogging(),
                fileOpener
            )
            if (!importer.canHandle(file)) return@promise false
            importer.importHabitsFromFile(file)
            true
        } finally {
            storage.delete(path)
        }
    }

    private fun execute(command: Command) {
        command.run()
        commandRunner.notifyListeners(command)
    }

    private fun habit(id: Int): Habit = habitList.getById(id.toLong()) ?: error("Habit not found: $id")

    private fun theme(dark: Boolean) = if (dark) darkTheme else lightTheme

    private fun habitSummary(habit: Habit): dynamic {
        val result: dynamic = js("{}")
        result.id = habit.id!!.toInt()
        result.name = habit.name
        result.question = habit.question
        result.description = habit.description
        result.colorIndex = habit.color.paletteIndex
        result.colorLight = lightTheme.color(habit.color).toHex()
        result.colorDark = darkTheme.color(habit.color).toHex()
        result.archived = habit.isArchived
        result.numerical = habit.isNumerical
        result.unit = habit.unit
        result.freqNum = habit.frequency.numerator
        result.freqDen = habit.frequency.denominator
        result.category = habit.category
        result.targetValue = habit.targetValue
        result.targetType = habit.targetType.value
        result.hasReminder = habit.hasReminder()
        return result
    }
}

private fun Color.toHex(): String {
    fun channel(v: Double) = (v * 255).roundToInt().coerceIn(0, 255).toString(16).padStart(2, '0')
    return "#${channel(red)}${channel(green)}${channel(blue)}"
}
