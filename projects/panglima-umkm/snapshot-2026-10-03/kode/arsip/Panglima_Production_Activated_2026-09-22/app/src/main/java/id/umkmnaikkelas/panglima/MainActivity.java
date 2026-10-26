package id.umkmnaikkelas.panglima;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.WebChromeClient;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.net.ssl.HttpsURLConnection;

public final class MainActivity extends Activity {
    private static final String LOCAL_ASSET_PREFIX = "file:///android_asset/";
    private static final String PANGLIMA_API_BASE =
            "https://panglima-device-api.ruang-belajar-mandiri01.workers.dev";
    private static final String PANGLIMA_CERTIFICATE_API_BASE =
            "https://panglima-certificate-api.ruang-belajar-mandiri01.workers.dev";
    private static final String PANGLIMA_ONBOARDING_API_BASE =
            "https://panglima-pretest-onboarding.ruang-belajar-mandiri01.workers.dev";
    private static final int MAX_API_REQUEST_BYTES = 16000;
    private static final int MAX_API_RESPONSE_BYTES = 32000;
    private static final int NOTIFICATION_PERMISSION_REQUEST = 1001;
    private final ExecutorService apiExecutor = Executors.newSingleThreadExecutor();
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#F8F5F1"));
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        WebView.setWebContentsDebuggingEnabled(debuggable);
        webView.addJavascriptInterface(new AppBridge(), "PanglimaAndroid");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new SafeLocalWebViewClient());
        webView.loadUrl(LOCAL_ASSET_PREFIX + "index.html");
    }

    private void openExternalUrl(String rawUrl) {
        if (rawUrl == null || rawUrl.trim().isEmpty()) {
            return;
        }

        Uri uri = Uri.parse(rawUrl);
        String scheme = uri.getScheme();
        if (!"https".equalsIgnoreCase(scheme) && !"mailto".equalsIgnoreCase(scheme)) {
            Toast.makeText(this, "Tautan tidak diizinkan.", Toast.LENGTH_SHORT).show();
            return;
        }

        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException exception) {
            Toast.makeText(this, "Tidak ada aplikasi untuk membuka tautan.", Toast.LENGTH_SHORT).show();
        }
    }

    private final class SafeLocalWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return handleNavigation(request.getUrl().toString());
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return handleNavigation(url);
        }

        private boolean handleNavigation(String url) {
            if (url.startsWith(LOCAL_ASSET_PREFIX)) {
                return false;
            }

            openExternalUrl(url);
            return true;
        }
    }

    private final class AppBridge {
        @JavascriptInterface
        public void openExternal(String url) {
            runOnUiThread(() -> openExternalUrl(url));
        }

        @JavascriptInterface
        public void openModule(String rawModuleCode, String rawSessionToken) {
            final String moduleCode = rawModuleCode == null
                    ? "" : rawModuleCode.trim().toLowerCase();
            final String sessionToken = rawSessionToken == null
                    ? "" : rawSessionToken.trim();
            if (!("property".equals(moduleCode) || "insurance".equals(moduleCode)
                    || "mlm".equals(moduleCode)) || sessionToken.isEmpty()
                    || sessionToken.length() > 2048) {
                runOnUiThread(() -> Toast.makeText(
                        MainActivity.this,
                        "Akses modul belum tersedia. Aktifkan kembali token Anda.",
                        Toast.LENGTH_SHORT).show());
                return;
            }

            try {
                final String deviceId = deviceFingerprint();
                runOnUiThread(() -> {
                    Intent intent = new Intent(MainActivity.this, ModuleActivity.class);
                    intent.putExtra("moduleCode", moduleCode);
                    intent.putExtra("sessionToken", sessionToken);
                    intent.putExtra("deviceId", deviceId);
                    startActivity(intent);
                });
            } catch (Exception exception) {
                runOnUiThread(() -> Toast.makeText(
                        MainActivity.this,
                        "Perangkat belum dapat diverifikasi.",
                        Toast.LENGTH_SHORT).show());
            }
        }

        @JavascriptInterface
        public void shareText(String content) {
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_SEND);
                intent.setType("text/plain");
                intent.putExtra(Intent.EXTRA_TEXT, content);
                startActivity(Intent.createChooser(intent, "Bagikan laporan"));
            });
        }

        @JavascriptInterface
        public void syncActionPlanReminder(boolean enabled) {
            runOnUiThread(() -> ActionPlanReminderReceiver.setEnabled(
                    MainActivity.this, enabled));
        }

        @JavascriptInterface
        public void setActionPlanReminder(boolean enabled) {
            runOnUiThread(() -> {
                ActionPlanReminderReceiver.setEnabled(MainActivity.this, enabled);
                if (enabled) {
                    requestNotificationPermission();
                }
            });
        }

        @JavascriptInterface
        public void postApi(String endpoint, String payload, String requestId) {
            if (requestId == null || !requestId.matches("[A-Za-z0-9-]{1,64}")) {
                return;
            }

            boolean certificateEndpoint = "/v1/completion".equals(endpoint)
                    || "/v1/certificate".equals(endpoint);
            boolean onboardingEndpoint = "/v1/onboarding/request-token".equals(endpoint);
            if (!"/v1/activate".equals(endpoint) && !"/v1/consultation".equals(endpoint)
                    && !certificateEndpoint && !onboardingEndpoint) {
                deliverApiResult(requestId, 0,
                        "{\"ok\":false,\"code\":\"INVALID_ENDPOINT\",\"message\":\"Endpoint tidak diizinkan.\"}");
                return;
            }

            final byte[] requestBytes;
            try {
                JSONObject requestBody = new JSONObject(payload == null ? "" : payload);
                requestBody.put("deviceId", deviceFingerprint());
                requestBytes = requestBody.toString().getBytes(StandardCharsets.UTF_8);
            } catch (Exception exception) {
                deliverApiResult(requestId, 0,
                        "{\"ok\":false,\"code\":\"DEVICE_UNAVAILABLE\",\"message\":\"Identitas perangkat tidak dapat diverifikasi.\"}");
                return;
            }
            if (requestBytes.length == 0 || requestBytes.length > MAX_API_REQUEST_BYTES) {
                deliverApiResult(requestId, 0,
                        "{\"ok\":false,\"code\":\"INVALID_BODY\",\"message\":\"Data permintaan tidak valid.\"}");
                return;
            }

            apiExecutor.execute(() -> {
                HttpsURLConnection connection = null;
                int status = 0;
                String responseBody;

                try {
                    String apiBase = certificateEndpoint
                            ? PANGLIMA_CERTIFICATE_API_BASE
                            : onboardingEndpoint
                                    ? PANGLIMA_ONBOARDING_API_BASE
                                    : PANGLIMA_API_BASE;
                    connection = (HttpsURLConnection) new URL(apiBase + endpoint)
                            .openConnection();
                    connection.setRequestMethod("POST");
                    connection.setInstanceFollowRedirects(false);
                    connection.setConnectTimeout(12000);
                    connection.setReadTimeout(45000);
                    connection.setDoOutput(true);
                    connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                    connection.setRequestProperty("Accept", "application/json");
                    connection.setFixedLengthStreamingMode(requestBytes.length);

                    try (OutputStream output = connection.getOutputStream()) {
                        output.write(requestBytes);
                    }

                    status = connection.getResponseCode();
                    InputStream responseStream = status >= 400
                            ? connection.getErrorStream()
                            : connection.getInputStream();
                    responseBody = readApiResponse(responseStream);
                } catch (Exception exception) {
                    responseBody =
                            "{\"ok\":false,\"code\":\"NETWORK_ERROR\",\"message\":\"Koneksi AI online belum tersedia.\"}";
                } finally {
                    if (connection != null) {
                        connection.disconnect();
                    }
                }

                deliverApiResult(requestId, status, responseBody);
            });
        }
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(
                    new String[]{Manifest.permission.POST_NOTIFICATIONS},
                    NOTIFICATION_PERMISSION_REQUEST);
        }
    }

    private String deviceFingerprint() throws Exception {
        String identifier = Settings.Secure.getString(
                getContentResolver(), Settings.Secure.ANDROID_ID);
        if (identifier == null || identifier.trim().isEmpty()
                || "9774d56d682e549c".equalsIgnoreCase(identifier)) {
            SharedPreferences preferences = getSharedPreferences(
                    "panglima_device_identity", MODE_PRIVATE);
            identifier = preferences.getString("installation_identity", "");
            if (identifier == null || identifier.isEmpty()) {
                identifier = UUID.randomUUID().toString();
                preferences.edit().putString("installation_identity", identifier).apply();
            }
        }

        byte[] digest = MessageDigest.getInstance("SHA-256").digest(
                ("panglima-device-v1:" + getPackageName() + ":" + identifier)
                        .getBytes(StandardCharsets.UTF_8));
        StringBuilder result = new StringBuilder(digest.length * 2);
        for (byte value : digest) {
            result.append(Character.forDigit((value >> 4) & 0x0f, 16));
            result.append(Character.forDigit(value & 0x0f, 16));
        }
        return result.toString();
    }

    private String readApiResponse(InputStream input) throws IOException {
        if (input == null) {
            return "{\"ok\":false,\"code\":\"EMPTY_RESPONSE\",\"message\":\"Server tidak mengirim jawaban.\"}";
        }

        try (InputStream stream = input;
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int count;
            int total = 0;
            while ((count = stream.read(buffer)) != -1) {
                total += count;
                if (total > MAX_API_RESPONSE_BYTES) {
                    throw new IOException("Response exceeds the allowed size.");
                }
                output.write(buffer, 0, count);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    private void deliverApiResult(String requestId, int status, String responseBody) {
        runOnUiThread(() -> {
            if (isFinishing() || isDestroyed() || webView == null) {
                return;
            }

            String script = "window.panglimaApiResult && window.panglimaApiResult("
                    + JSONObject.quote(requestId) + ","
                    + status + ","
                    + JSONObject.quote(responseBody == null ? "" : responseBody) + ")";
            webView.evaluateJavascript(script, null);
        });
    }

    @Override
    public void onBackPressed() {
        webView.evaluateJavascript("window.panglimaBack && window.panglimaBack()", result -> {
            if (!"true".equals(result)) {
                MainActivity.super.onBackPressed();
            }
        });
    }

    @Override
    protected void onDestroy() {
        apiExecutor.shutdownNow();
        if (webView != null) {
            webView.removeJavascriptInterface("PanglimaAndroid");
            webView.destroy();
        }
        super.onDestroy();
    }
}
