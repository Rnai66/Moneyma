// Place this in android/app/build.gradle after buildTypes section

signingConfigs {
    release {
        // Generate with: keytool -genkey -v -keystore ~/moneY-ma-key.keystore -keyalg RSA -keysize 2048 -validity 10000 -alias moneyma-key
        storeFile file('moneyma-key.keystore')
        storePassword System.getenv("KEYSTORE_PASSWORD")
        keyAlias System.getenv("KEYSTORE_ALIAS")
        keyPassword System.getenv("KEYSTORE_PASSWORD")
    }
}

buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled false
        proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
    }
}
