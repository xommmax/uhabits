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
import org.isoron.platform.gui.View
import org.isoron.platform.time.JsLocalDateFormatter
import org.isoron.platform.time.LocalDate
import org.isoron.uhabits.core.commands.Command
import org.isoron.uhabits.core.commands.CreateRepetitionCommand
import org.isoron.uhabits.core.models.Entry
import org.isoron.uhabits.core.models.Habit
import org.isoron.uhabits.core.models.HabitList
import org.isoron.uhabits.core.preferences.Preferences
import org.isoron.uhabits.core.ui.screens.habits.show.views.BarCardPresenter
import org.isoron.uhabits.core.ui.screens.habits.show.views.FrequencyCardPresenter
import org.isoron.uhabits.core.ui.screens.habits.show.views.ScoreCardPresenter
import org.isoron.uhabits.core.ui.screens.habits.show.views.StreakCartPresenter
import org.isoron.uhabits.core.ui.screens.habits.show.views.TargetCardPresenter
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
    internal val view: View
) {
    private var onEdited: () -> Unit = {}
    private var onPopup: (Int) -> Unit = {}

    /** Registers a callback invoked after the user edits data through the chart. */
    fun setOnEdited(callback: () -> Unit) {
        onEdited = callback
    }

    /** Width of one scrollable column, available after the first [draw]; 0 if the chart does not scroll. */
    val columnWidth: Double
        get() = (view as? DataView)?.dataColumnWidth ?: 0.0

    fun draw() {
        val scale = window.devicePixelRatio
        canvas.width = (canvas.clientWidth * scale).roundToInt()
        canvas.height = (canvas.clientHeight * scale).roundToInt()
        view.draw(JsCanvas(canvas, scale))
    }

    /** Scrolls back in time by [columns] (negative scrolls forward). Returns true if the view moved. */
    fun scrollBy(columns: Int): Boolean {
        val view = view as? DataView ?: return false
        val offset = max(0, view.dataOffset + columns)
        if (offset == view.dataOffset) return false
        view.dataOffset = offset
        draw()
        return true
    }

    /** Registers a callback asking the app to show the check-in popup for a day (days since 2000). */
    fun setOnPopup(callback: (Int) -> Unit) {
        onPopup = callback
    }

    fun click(x: Double, y: Double) = view.onClick(x, y)

    fun longClick(x: Double, y: Double) = view.onLongClick(x, y)

    internal fun notifyEdited() = onEdited()

    internal fun requestPopup(date: LocalDate) = onPopup(date.daysSince2000)
}

internal fun buildHistoryChart(
    canvas: HTMLCanvasElement,
    habit: Habit,
    habitList: HabitList,
    preferences: Preferences,
    theme: Theme,
    padding: Double,
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
        firstWeekday = state.firstWeekday,
        padding = padding
    )
    val handle = ChartHandle(canvas, chart)
    fun redraw() {
        val updated = HistoryCardPresenter.buildState(habit, preferences.firstWeekday, theme)
        chart.series = updated.series
        chart.notesIndicators = updated.notesIndicators
        handle.draw()
        handle.notifyEdited()
    }
    fun toggle(date: LocalDate) {
        val entry = habit.computedEntries.get(date)
        val next = Entry.nextToggleValue(
            value = entry.value,
            isSkipEnabled = preferences.isSkipEnabled,
            areQuestionMarksEnabled = preferences.areQuestionMarksEnabled
        )
        execute(CreateRepetitionCommand(habitList, habit, date, next, entry.notes))
        redraw()
    }
    // Same rules as core's HistoryCardPresenter; popups are shown by the app.
    chart.onDateClickedListener = object : OnDateClickedListener {
        override fun onDateShortPress(date: LocalDate) {
            if (!habit.isNumerical && preferences.isShortToggleEnabled) toggle(date) else handle.requestPopup(date)
        }

        override fun onDateLongPress(date: LocalDate) {
            if (!habit.isNumerical && !preferences.isShortToggleEnabled) toggle(date) else handle.requestPopup(date)
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

internal fun buildScoreChart(
    canvas: HTMLCanvasElement,
    habit: Habit,
    preferences: Preferences,
    theme: Theme,
    dark: Boolean
): ChartHandle {
    val state = ScoreCardPresenter.buildState(
        habit = habit,
        firstWeekday = preferences.firstWeekdayInt,
        spinnerPosition = preferences.scoreCardSpinnerPosition,
        theme = theme
    )
    val chart = ScoreChart(state.scores, state.bucketSize, theme.color(habit.color), ChartPalette(dark), dateFormatter)
    return ChartHandle(canvas, chart)
}

internal fun buildFrequencyChart(
    canvas: HTMLCanvasElement,
    habit: Habit,
    preferences: Preferences,
    theme: Theme,
    dark: Boolean
): ChartHandle {
    val state = FrequencyCardPresenter.buildState(habit, preferences.firstWeekday, theme)
    val chart = FrequencyChart(
        state.frequency,
        state.isNumerical,
        state.firstWeekday,
        theme.color(habit.color),
        ChartPalette(dark),
        dateFormatter
    )
    return ChartHandle(canvas, chart)
}

internal fun buildStreakChart(canvas: HTMLCanvasElement, habit: Habit, theme: Theme, dark: Boolean): ChartHandle {
    val state = StreakCartPresenter.buildState(habit, theme)
    return ChartHandle(canvas, StreakChart(state.bestStreaks, theme.color(habit.color), ChartPalette(dark)))
}

/** Same labels as Android's TargetCardView.intervalToLabel. */
private fun intervalToLabel(interval: Int) = when (interval) {
    1 -> "Today"
    7 -> "Week"
    30 -> "Month"
    91 -> "Quarter"
    else -> "Year"
}

internal fun buildTargetChart(
    canvas: HTMLCanvasElement,
    habit: Habit,
    preferences: Preferences,
    theme: Theme,
    dark: Boolean
): ChartHandle {
    val state = TargetCardPresenter.buildState(habit, preferences.firstWeekdayInt, theme)
    val chart = TargetChart(
        state.intervals.map(::intervalToLabel),
        state.values,
        state.targets,
        theme.color(habit.color),
        ChartPalette(dark)
    )
    return ChartHandle(canvas, chart)
}
