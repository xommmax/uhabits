/*
 * This file is part of Loop Habit Tracker (web port).
 * Licensed under the GNU General Public License v3 or later; see LICENSE.txt.
 */

package org.isoron.uhabits.web

import org.isoron.platform.gui.Canvas
import org.isoron.platform.gui.Color
import org.isoron.platform.gui.DataView
import org.isoron.platform.gui.TextAlign
import org.isoron.platform.gui.View
import org.isoron.platform.time.DayOfWeek
import org.isoron.platform.time.LocalDate
import org.isoron.platform.time.LocalDateFormatter
import org.isoron.platform.time.countWeekdayOccurrencesInMonth
import org.isoron.platform.time.getToday
import org.isoron.platform.time.getWeekdaySequence
import org.isoron.uhabits.core.models.Score
import org.isoron.uhabits.core.models.Streak
import org.isoron.uhabits.core.ui.views.DarkTheme
import org.isoron.uhabits.core.ui.views.PureBlackTheme
import org.isoron.uhabits.core.ui.views.Theme
import org.isoron.uhabits.core.ui.views.toShortString
import kotlin.js.Date
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

// Ports of the Android-only charts in uhabits-android/.../activities/common/views,
// drawn through core's Canvas so they look the same as on Android. Sizes are in dp.

private const val TINY_TEXT_SIZE = 10.0
private const val REGULAR_TEXT_SIZE = 16.0
private const val BASE_SIZE = 20.0
private const val FONT_SPACING = 1.17

/** Android's ?attr/contrastNN theme colors for the light, dark and pure black themes. */
class ChartPalette(theme: Theme) {
    private val pureBlack = theme is PureBlackTheme || theme is CustomPureBlackTheme
    private val dark = theme is DarkTheme
    val contrast0 = Color(if (pureBlack) 0x000000 else if (dark) 0x212121 else 0xFFFFFF)
    val contrast20 = Color(if (pureBlack) 0x212121 else if (dark) 0x424242 else 0xE0E0E0)
    val contrast60 = Color(0x9E9E9E)
    val cardBackground = Color(if (pureBlack) 0x000000 else if (dark) 0x303030 else 0xFAFAFA)
}

/** Android draws text at a baseline; core's Canvas centers it vertically. */
private fun Canvas.drawTextAtBaseline(text: String, x: Double, baseline: Double, size: Double) =
    drawText(text, x, baseline - size * 0.36)

/** Same as Android's ColorUtils.mixColors: [amount] of [c1] plus the rest of [c2]. */
private fun mix(c1: Color, c2: Color, amount: Double) = Color(
    c1.red * amount + c2.red * (1 - amount),
    c1.green * amount + c2.green * (1 - amount),
    c1.blue * amount + c2.blue * (1 - amount),
    1.0
)

private fun stepMonth(date: LocalDate, months: Int): LocalDate {
    var y = date.year
    var m = date.month + months
    while (m < 1) { m += 12; y -= 1 }
    while (m > 12) { m -= 12; y += 1 }
    return LocalDate(y, m, 1)
}

/** Medium date format, e.g. "Oct 25, 2026", like Android's DateFormat.MEDIUM. */
internal fun longFormat(date: LocalDate): String {
    val jsDate = Date(date.unixTime.toDouble())
    val options: dynamic = js("({month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'})")
    return jsDate.asDynamic().toLocaleDateString("en-US", options).unsafeCast<String>()
}

class ScoreChart(
    private val scores: List<Score>,
    private val bucketSize: Int,
    private val color: Color,
    private val palette: ChartPalette,
    private val dateFormatter: LocalDateFormatter
) : DataView {
    override var dataOffset = 0
    private var columnWidth = 0.0
    override val dataColumnWidth: Double
        get() = columnWidth

    override fun draw(canvas: Canvas) {
        val width = canvas.getWidth()
        val height = canvas.getHeight()
        canvas.setColor(palette.cardBackground)
        canvas.fill()

        val textSize = min(height * 0.06, TINY_TEXT_SIZE)
        canvas.setFontSize(textSize)
        val em = textSize * FONT_SPACING
        val paddingTop = em
        val baseSize = floor((height - 3 * em - paddingTop) / 8)
        val maxMonthWidth = (1..12).maxOf { canvas.measureText(dateFormatter.shortMonthName(LocalDate(2020, it, 1))) }
        columnWidth = max(baseSize, maxMonthWidth * 1.5)
        val nColumns = max(1, (width / columnWidth).toInt())
        columnWidth = width / nColumns
        val columnHeight = 8 * baseSize

        // Grid
        canvas.setStrokeWidth(min(1.0, baseSize * 0.05))
        canvas.setTextAlign(TextAlign.LEFT)
        val rowHeight = columnHeight / 5
        for (i in 0 until 5) {
            val top = paddingTop + i * rowHeight
            canvas.setColor(palette.contrast60)
            canvas.drawTextAtBaseline("${100 - i * 20}%", 0.5 * em, top + em, textSize)
            canvas.setColor(palette.contrast20)
            canvas.drawLine(0.0, top, nColumns * columnWidth, top)
        }
        canvas.drawLine(0.0, paddingTop + columnHeight, nColumns * columnWidth, paddingTop + columnHeight)

        // Line, markers and footer
        canvas.setTextAlign(TextAlign.CENTER)
        var prevX = Double.NaN
        var prevY = Double.NaN
        var previousYear = ""
        var previousMonth = ""
        var skipYear = 0
        val bottom = paddingTop + columnHeight
        for (k in 0 until nColumns) {
            val offset = nColumns - k - 1 + dataOffset
            if (offset >= scores.size) continue
            val score = scores[offset]
            val x = k * columnWidth + columnWidth / 2
            val y = paddingTop + columnHeight - (columnHeight * score.value).toInt()
            if (!prevX.isNaN()) {
                canvas.setColor(color)
                canvas.setStrokeWidth(baseSize * 0.1)
                canvas.drawLine(prevX, prevY, x, y)
                drawMarker(canvas, prevX, prevY, baseSize)
            }
            if (k == nColumns - 1) drawMarker(canvas, x, y, baseSize)
            prevX = x
            prevY = y

            val year = score.date.year.toString()
            val month = dateFormatter.shortMonthName(score.date)
            var printYear = year != previousYear
            if (bucketSize >= 365 && score.date.year % 2 != 0) printYear = false
            if (skipYear > 0) {
                skipYear--
                printYear = false
            }
            canvas.setColor(palette.contrast60)
            canvas.setFontSize(textSize)
            if (printYear) {
                previousYear = year
                previousMonth = ""
                canvas.drawTextAtBaseline(year, x, bottom + em * 2.2, textSize)
                skipYear = 1
            }
            if (bucketSize < 365) {
                val text = if (month != previousMonth) month.also { previousMonth = it } else score.date.day.toString()
                canvas.drawTextAtBaseline(text, x, bottom + em * 1.2, textSize)
            }
        }
    }

    private fun drawMarker(canvas: Canvas, x: Double, y: Double, baseSize: Double) {
        canvas.setColor(palette.cardBackground)
        canvas.fillCircle(x, y, baseSize * 0.275)
        canvas.setColor(color)
        canvas.fillCircle(x, y, baseSize * 0.175)
    }
}

class FrequencyChart(
    private val frequency: Map<LocalDate, Array<Int>>,
    private val isNumerical: Boolean,
    private val firstWeekday: DayOfWeek,
    private val color: Color,
    private val palette: ChartPalette,
    private val dateFormatter: LocalDateFormatter
) : DataView {
    override var dataOffset = 0
    private var columnWidth = 0.0
    override val dataColumnWidth: Double
        get() = columnWidth

    private val maxFreq = max(1, frequency.values.maxOfOrNull { it.maxOrNull() ?: 0 } ?: 0)
    private val colors = listOf(
        palette.contrast20,
        mix(palette.contrast20, color, 0.66),
        mix(palette.contrast20, color, 0.33),
        color
    )

    override fun draw(canvas: Canvas) {
        val width = canvas.getWidth()
        val height = canvas.getHeight()
        canvas.setColor(palette.cardBackground)
        canvas.fill()

        val baseSize = floor(height / 8)
        val textSize = baseSize * 0.4
        canvas.setFontSize(textSize)
        val em = textSize * FONT_SPACING
        val maxMonthWidth = (1..12).maxOf { canvas.measureText(dateFormatter.shortMonthName(LocalDate(2020, it, 1))) }
        columnWidth = max(baseSize, maxMonthWidth * 1.2)
        val nColumns = (width / columnWidth).toInt()
        val columnHeight = 8 * baseSize
        val weekdays = getWeekdaySequence(firstWeekday)

        // Grid with weekday labels on the right
        val rowHeight = columnHeight / 8
        canvas.setStrokeWidth(1.0)
        canvas.setTextAlign(TextAlign.LEFT)
        for ((row, day) in weekdays.withIndex()) {
            val top = row * rowHeight
            canvas.setColor(palette.contrast60)
            canvas.drawTextAtBaseline(
                dateFormatter.shortWeekdayName(day),
                nColumns * columnWidth - columnWidth,
                top + rowHeight / 2 + 0.25 * em,
                textSize
            )
            canvas.setColor(palette.contrast20)
            canvas.drawLine(0.0, top, nColumns * columnWidth, top)
        }
        canvas.drawLine(0.0, 7 * rowHeight, nColumns * columnWidth, 7 * rowHeight)

        // One column per month, oldest on the left
        canvas.setTextAlign(TextAlign.CENTER)
        var date = stepMonth(LocalDate(getToday().year, getToday().month, 1), -nColumns + 2 - dataOffset)
        for (i in 0 until nColumns - 1) {
            val left = i * columnWidth
            val values = frequency[date]
            val weekdaysInMonth = countWeekdayOccurrencesInMonth(date)
            for ((j, day) in weekdays.withIndex()) {
                val index = (day.daysSinceSunday + 1) % 7
                if (values != null) {
                    drawMarker(canvas, left + baseSize / 2, baseSize * j + baseSize / 2, baseSize, values[index], weekdaysInMonth[index])
                }
            }
            val centerX = left + baseSize / 2
            val centerY = 7.5 * baseSize
            canvas.setColor(palette.contrast60)
            canvas.drawTextAtBaseline(dateFormatter.shortMonthName(date), centerX, centerY - 0.1 * em, textSize)
            if (date.month == 2) canvas.drawTextAtBaseline(date.year.toString(), centerX, centerY + 0.9 * em, textSize)
            date = stepMonth(date, 1)
        }
    }

    private fun drawMarker(canvas: Canvas, x: Double, y: Double, size: Double, value: Int, weekdayFrequency: Int) {
        val maxRadius = (size - 2 * size * 0.2) / 2
        val scalingFactor = if (isNumerical) maxFreq else weekdayFrequency
        val scale = max(0, value).toDouble() / scalingFactor
        val colorIndex = min(colors.size - 1, ((colors.size - 1) * scale).roundToInt())
        canvas.setColor(colors[colorIndex])
        canvas.fillCircle(x, y, maxRadius * scale)
    }
}

class StreakChart(
    private val streaks: List<Streak>,
    private val color: Color,
    private val palette: ChartPalette
) : View {
    override fun draw(canvas: Canvas) {
        val width = canvas.getWidth()
        canvas.setColor(palette.cardBackground)
        canvas.fill()
        if (streaks.isEmpty()) return

        val textSize = max(min(BASE_SIZE * 0.5, REGULAR_TEXT_SIZE), TINY_TEXT_SIZE)
        canvas.setFontSize(textSize)
        val em = textSize * FONT_SPACING
        val textMargin = 0.5 * em
        val maxLength = streaks.maxOf { it.length }
        var maxLabelWidth = streaks.maxOf {
            max(canvas.measureText(longFormat(it.start)), canvas.measureText(longFormat(it.end)))
        }
        var showLabels = true
        if (width - 2 * maxLabelWidth < width * 0.25) {
            maxLabelWidth = 0.0
            showLabels = false
        }

        val barColors = listOf(palette.contrast20, color.copy(alpha = 96 / 255.0), color.copy(alpha = 192 / 255.0), color)
        for ((row, streak) in streaks.withIndex()) {
            val top = row * BASE_SIZE
            val percentage = streak.length.toDouble() / maxLength
            var available = width - 2 * maxLabelWidth
            if (showLabels) available -= 2 * textMargin
            val label = streak.length.toString()
            val barWidth = max(percentage * available, canvas.measureText(label) + em)
            val gap = (width - barWidth) / 2
            canvas.setColor(
                when {
                    percentage >= 1.0 -> barColors[3]
                    percentage >= 0.8 -> barColors[2]
                    percentage >= 0.5 -> barColors[1]
                    else -> barColors[0]
                }
            )
            canvas.fillRoundRect(gap, top + BASE_SIZE * 0.05, barWidth, BASE_SIZE * 0.9, 2.0)

            val baseline = top + BASE_SIZE / 2 + 0.3 * em
            canvas.setColor(if (percentage >= 0.5) palette.contrast0 else palette.contrast60)
            canvas.setTextAlign(TextAlign.CENTER)
            canvas.drawTextAtBaseline(label, width / 2, baseline, textSize)
            if (showLabels) {
                canvas.setColor(palette.contrast60)
                canvas.setTextAlign(TextAlign.RIGHT)
                canvas.drawTextAtBaseline(longFormat(streak.start), gap - textMargin, baseline, textSize)
                canvas.setTextAlign(TextAlign.LEFT)
                canvas.drawTextAtBaseline(longFormat(streak.end), width - gap + textMargin, baseline, textSize)
            }
        }
    }
}

class TargetChart(
    private val labels: List<String>,
    private val values: List<Double>,
    private val targets: List<Double>,
    private val color: Color,
    private val palette: ChartPalette
) : View {
    override fun draw(canvas: Canvas) {
        val width = canvas.getWidth()
        canvas.setColor(palette.cardBackground)
        canvas.fill()
        if (labels.isEmpty()) return

        val padding = 4.0
        val round = 2.0
        canvas.setFontSize(TINY_TEXT_SIZE)
        val stop = labels.maxOf { canvas.measureText(it) } + padding * 2
        for (row in labels.indices) {
            val top = row * BASE_SIZE
            val centerY = top + BASE_SIZE / 2

            canvas.setColor(palette.contrast60)
            canvas.setTextAlign(TextAlign.RIGHT)
            canvas.drawText(labels[row], stop - padding, centerY)

            val barLeft = stop + padding
            val barWidth = width - padding - barLeft
            val barTop = top + BASE_SIZE * 0.05
            val barHeight = BASE_SIZE * 0.9
            canvas.setColor(palette.contrast20)
            canvas.fillRoundRect(barLeft, barTop, barWidth, barHeight, round)

            val percentage = min(1.0, if (targets[row] > 0) values[row] / targets[row] else 1.0)
            var completedWidth = percentage * barWidth
            if (completedWidth > 0 && completedWidth < 2 * round) completedWidth = 2 * round
            val remainingWidth = barWidth - completedWidth
            canvas.setColor(color)
            canvas.fillRoundRect(barLeft, barTop, completedWidth, barHeight, round)

            canvas.setTextAlign(TextAlign.CENTER)
            val completedText = values[row].toShortString()
            val remainingText = (targets[row] - values[row]).toShortString()
            if (completedWidth > canvas.measureText(completedText) + 2 * padding) {
                canvas.setColor(palette.contrast0)
                canvas.drawText(completedText, barLeft + completedWidth / 2, centerY)
            }
            if (remainingWidth > canvas.measureText(remainingText) + 2 * padding) {
                canvas.setColor(palette.contrast60)
                canvas.drawText(remainingText, barLeft + completedWidth + remainingWidth / 2, centerY)
            }
        }
    }
}
