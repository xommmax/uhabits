/*
 * This file is part of Loop Habit Tracker (web port).
 * Licensed under the GNU General Public License v3 or later; see LICENSE.txt.
 */

@file:OptIn(ExperimentalJsExport::class)
@file:Suppress("DEPRECATION")

package org.isoron.uhabits.web

import kotlinx.browser.window
import org.isoron.platform.gui.DataView
import org.isoron.platform.gui.JsCanvas
import org.isoron.platform.time.JsLocalDateFormatter
import org.isoron.platform.time.LocalDate
import org.isoron.uhabits.core.commands.Command
import org.isoron.uhabits.core.commands.CreateRepetitionCommand
import org.isoron.uhabits.core.models.Entry
import org.isoron.uhabits.core.models.Habit
import org.isoron.uhabits.core.models.HabitList
import org.isoron.uhabits.core.preferences.Preferences
import org.isoron.uhabits.core.ui.screens.habits.show.views.BarCardPresenter
import org.isoron.uhabits.core.ui.screens.habits.show.views.HistoryCardPresenter
import org.isoron.uhabits.core.ui.views.BarChart
import org.isoron.uhabits.core.ui.views.HistoryChart
import org.isoron.uhabits.core.ui.views.OnDateClickedListener
import org.isoron.uhabits.core.ui.views.Theme
import org.w3c.dom.HTMLCanvasElement
import kotlin.math.max
import kotlin.math.roundToInt

private val dateFormatter = JsLocalDateFormatter("en-US")

/** A core chart drawn on an HTML canvas. Coordinates are in CSS pixels. */
@JsExport
class ChartHandle internal constructor(
    private val canvas: HTMLCanvasElement,
    internal val view: DataView
) {
    private var onEdited: () -> Unit = {}

    /** Registers a callback invoked after the user edits data through the chart. */
    fun setOnEdited(callback: () -> Unit) {
        onEdited = callback
    }

    /** Width of one scrollable column, available after the first [draw]. */
    val columnWidth: Double
        get() = view.dataColumnWidth

    fun draw() {
        val scale = window.devicePixelRatio
        canvas.width = (canvas.clientWidth * scale).roundToInt()
        canvas.height = (canvas.clientHeight * scale).roundToInt()
        view.draw(JsCanvas(canvas, scale))
    }

    /** Scrolls back in time by [columns] (negative scrolls forward). Returns true if the view moved. */
    fun scrollBy(columns: Int): Boolean {
        val offset = max(0, view.dataOffset + columns)
        if (offset == view.dataOffset) return false
        view.dataOffset = offset
        draw()
        return true
    }

    fun click(x: Double, y: Double) = view.onClick(x, y)

    internal fun notifyEdited() = onEdited()
}

internal fun buildHistoryChart(
    canvas: HTMLCanvasElement,
    habit: Habit,
    habitList: HabitList,
    preferences: Preferences,
    theme: Theme,
    execute: (Command) -> Unit
): ChartHandle {
    val state = HistoryCardPresenter.buildState(habit, preferences.firstWeekday, theme)
    val chart = HistoryChart(
        today = state.today,
        paletteColor = state.color,
        theme = theme,
        dateFormatter = dateFormatter,
        series = state.series,
        defaultSquare = state.defaultSquare,
        notesIndicators = state.notesIndicators,
        firstWeekday = state.firstWeekday
    )
    val handle = ChartHandle(canvas, chart)
    chart.onDateClickedListener = object : OnDateClickedListener {
        override fun onDateShortPress(date: LocalDate) {
            val entry = habit.computedEntries.get(date)
            val next = Entry.nextToggleValue(
                value = entry.value,
                isSkipEnabled = preferences.isSkipEnabled,
                areQuestionMarksEnabled = preferences.areQuestionMarksEnabled
            )
            execute(CreateRepetitionCommand(habitList, habit, date, next, entry.notes))
            val updated = HistoryCardPresenter.buildState(habit, preferences.firstWeekday, theme)
            chart.series = updated.series
            chart.notesIndicators = updated.notesIndicators
            handle.draw()
            handle.notifyEdited()
        }
    }
    return handle
}

internal fun buildBarChart(
    canvas: HTMLCanvasElement,
    habit: Habit,
    preferences: Preferences,
    theme: Theme
): ChartHandle {
    val state = BarCardPresenter.buildState(
        habit = habit,
        firstWeekday = preferences.firstWeekdayInt,
        numericalSpinnerPosition = preferences.barCardNumericalSpinnerPosition,
        boolSpinnerPosition = preferences.barCardBoolSpinnerPosition,
        theme = theme
    )
    val chart = BarChart(theme, dateFormatter).apply {
        series = mutableListOf(state.entries.map { it.value / 1000.0 })
        colors = mutableListOf(theme.color(state.color.paletteIndex))
        axis = state.entries.map { it.date }
    }
    return ChartHandle(canvas, chart)
}
