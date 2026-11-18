# महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ - Android URL-Based (WebView) App Guide & Source Code

This guide provides everything needed to package your official website (`https://mahasangh.in`) into a high-performance, native Android App (.apk / .aab) for Google Play Console publishing under your account (`Padmakar Chandrakant Shinde`).

---

## 1. App Configuration Details (Google Play Console Setup)
* **App Name (अॅपचे नाव):** केंद्रप्रमुख व अधिकारी महासंघ
* **Package Name / Application ID:** `in.mahasangh.app`
* **Default URL:** `https://mahasangh.in`
* **Minimum SDK:** Android 7.0 (API 24) - Supports 99% of devices in India.
* **Target SDK:** Android 14 / 15 (API 34/35)

---

## 2. Android Project Source Code

### A. `AndroidManifest.xml`
```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="in.mahasangh.app">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/Theme.MahasanghApp"
        android:usesCleartextTraffic="true">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:configChanges="orientation|screenSize|keyboardHidden"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>

</manifest>
```

### B. `MainActivity.kt` (Kotlin)
```kotlin
package in.mahasangh.app

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.view.KeyEvent
import android.webkit.*
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private val targetUrl = "https://mahasangh.in"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        swipeRefresh = findViewById(R.id.swipeRefresh)
        webView = findViewById(R.id.webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            loadWithOverviewMode = true
            useWideViewPort = true
            cacheMode = WebSettings.LOAD_DEFAULT
            allowFileAccess = true
            allowContentAccess = true
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                view?.loadUrl(request?.url.toString())
                return true
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                swipeRefresh.isRefreshing = false
            }
        }

        webView.webChromeClient = WebChromeClient()

        // Handle PDF & ID Card downloads inside Android
        webView.setDownloadListener { url, userAgent, contentDisposition, mimeType, contentLength ->
            try {
                val request = DownloadManager.Request(Uri.parse(url))
                request.setMimeType(mimeType)
                request.allowScanningByMediaScanner()
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, Uri.parse(url).lastPathSegment ?: "Mahasangh_Download.pdf")
                val dm = getSystemService(DOWNLOAD_SERVICE) as DownloadManager
                dm.enqueue(request)
                Toast.makeText(this, "फाइल डाऊनलोड होत आहे...", Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                Toast.makeText(this, "डाऊनलोड करताना त्रुटी आली", Toast.LENGTH_SHORT).show()
            }
        }

        swipeRefresh.setOnRefreshListener {
            webView.reload()
        }

        webView.loadUrl(targetUrl)
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.goBack()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }
}
```

### C. `activity_main.xml` (Layout)
```xml
<?xml version="1.0" encoding="utf-8"?>
<androidx.swiperefreshlayout.widget.SwipeRefreshLayout
    xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/swipeRefresh"
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    <WebView
        android:id="@+id/webView"
        android:layout_width="match_parent"
        android:layout_height="match_parent" />

</androidx.swiperefreshlayout.widget.SwipeRefreshLayout>
```

---

## 3. Google Play Console वर ॲप अपलोड करण्याची स्टेप-बाय-स्टेप पद्धत:

1. **Google Play Console लॉगिन करा:**
   - तुमच्या `Padmakar Chandrakant Shinde` खात्यासह [play.google.com/console](https://play.google.com/console) वर जा.
2. **Create App वर क्लिक करा:**
   - स्क्रीनवर दिसणाऱ्या **"+ Create app"** बटणावर क्लिक करा (जसे तुमच्या स्क्रीनशॉटमध्ये दिसत आहे).
3. **अॅपची माहिती भरा:**
   - **App Name:** `केंद्रप्रमुख व अधिकारी महासंघ`
   - **Default Language:** `Marathi (mr)` किंवा `English (en)`
   - **App Type:** `App`
   - **Free or Paid:** `Free`
4. **App Access & Content Rating:**
   - सर्व वैशिष्ट्ये सर्वांसाठी खुली (`All functionality is available without special access`) असे निवडा.
   - Content Rating फॉर्म भरा (सर्व वयोगटासाठी योग्य).
5. **App Bundle (.aab) अपलोड करा:**
   - Android Studio मध्ये वरील कोड वापरून प्रोजेक्ट तयार करून **Build -> Build Bundle(s) / APK(s) -> Build Bundle(s)(.aab)** वर क्लिक करा.
   - तयार झालेली `.aab` फाईल Google Play Console वर Production / Testing विभागात अपलोड करा.
6. **Store Listing तयार करा:**
   - ॲपचा लोगो (Icon), वैशिष्ट्यपूर्ण बॅनर (Feature Graphic), आणि स्क्रीनशॉट्स अपलोड करून **"Send for Review"** वर क्लिक करा.
