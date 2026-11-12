plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
val webUrl = (project.findProperty("WEB_URL") as String?)?.takeIf { it.isNotBlank() } ?: "https://your-site.netlify.app"
android {
    namespace = "uz.mivo"
    compileSdk = 35
    defaultConfig {
        applicationId = "uz.mivo.app"
        minSdk = 26; targetSdk = 35
        versionCode = 2; versionName = "0.2.0"
        buildConfigField("String", "WEB_URL", "\"$webUrl\"")
    }
    buildFeatures { buildConfig = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}
dependencies {
    implementation("androidx.activity:activity-ktx:1.9.3")
}
