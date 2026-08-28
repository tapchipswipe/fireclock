plugins {
    id("com.android.application")
    kotlin("android")
}

android {
    namespace = "com.tapchipswipe.fireclock"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.tapchipswipe.fireclock"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
        debug {
            isDebuggable = true
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

dependencies {
    implementation("org.nanohttpd:nanohttpd:2.3.1")
}
