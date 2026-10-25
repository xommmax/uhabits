/*
 * This file is part of Loop Habit Tracker (web port).
 * Licensed under the GNU General Public License v3 or later; see LICENSE.txt.
 */

// Kotlin/JS bridge that exposes uhabits-core to the Preact app in ./app.
// Build with: ./gradlew :uhabits-web:jsBrowserProductionLibraryDistribution

plugins {
    kotlin("multiplatform")
}

kotlin {
    js(IR) {
        outputModuleName.set("habits-core")
        browser()
        useEsModules()
        binaries.library()
        generateTypeScriptDefinitions()
    }

    sourceSets {
        val jsMain by getting {
            dependencies {
                implementation(project(":uhabits-core"))
                implementation(libs.kotlinx.coroutines.core)
                implementation(libs.kotlin.inject.runtime)
            }
        }
    }
}
