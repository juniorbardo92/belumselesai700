plugins {
    id("com.android.application")
}

val releaseKeystorePath = System.getenv("PANGLIMA_KEYSTORE_PATH")

android {
    namespace = "id.umkmnaikkelas.panglima"
    compileSdk = 35

    defaultConfig {
        applicationId = "id.umkmnaikkelas.panglima"
        minSdk = 23
        targetSdk = 35
        versionCode = 16
        versionName = "1.3.9-modul"
    }

    signingConfigs {
        if (!releaseKeystorePath.isNullOrBlank()) {
            create("release") {
                storeFile = file(releaseKeystorePath)
                storePassword = System.getenv("PANGLIMA_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("PANGLIMA_KEY_ALIAS")
                keyPassword = System.getenv("PANGLIMA_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false

            if (!releaseKeystorePath.isNullOrBlank()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    androidResources {
        noCompress += "pmod"
    }
}
