plugins {
    id("com.android.application")
    kotlin("android") version "2.1.0"
}

android {
    namespace = "com.tapchipswipe.fireclock"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.tapchipswipe.fireclock"
        minSdk = 24
        targetSdk = 34
        versionCode = 14
        versionName = "1.1.3"
    }

    signingConfigs {
        create("release") {
            storeFile = file("keystore.jks")
            storePassword = "android"
            keyAlias = "fireclock"
            keyPassword = "android"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
        debug {
            isDebuggable = true
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        viewBinding = false
    }
}

val copyWebAssets = tasks.register<Copy>("copyWebAssets") {
    from("..") {
        include("index.html", "style.css", "script.js", "fireclock_user.json")
    }
    into("src/main/assets")
}

tasks.named("preBuild") {
    dependsOn(copyWebAssets)
}

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("androidx.core:core-ktx:1.13.1")
}
