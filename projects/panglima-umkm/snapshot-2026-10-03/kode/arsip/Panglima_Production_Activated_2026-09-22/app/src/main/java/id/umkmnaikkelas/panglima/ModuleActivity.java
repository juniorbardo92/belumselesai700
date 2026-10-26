package id.umkmnaikkelas.panglima;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.crypto.Cipher;
import javax.crypto.CipherInputStream;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import javax.net.ssl.HttpsURLConnection;

import android.graphics.pdf.PdfRenderer;

public final class ModuleActivity extends Activity {
    private static final String API_URL =
            "https://panglima-device-api.ruang-belajar-mandiri01.workers.dev/v1/module-key";
    private static final byte[] MAGIC = "PGLM1".getBytes(StandardCharsets.US_ASCII);
    private static final int MAX_RESPONSE_BYTES = 16000;
    private static final long MAX_DECRYPTED_BYTES = 100L * 1024L * 1024L;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private TextView statusView;
    private TextView pageView;
    private ImageView imageView;
    private Button previousButton;
    private Button nextButton;
    private PdfRenderer renderer;
    private ParcelFileDescriptor descriptor;
    private Bitmap bitmap;
    private File temporaryPdf;
    private int currentPage;
    private String moduleCode;
    private String moduleTitle;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        moduleCode = safeModuleCode(getIntent().getStringExtra("moduleCode"));
        moduleTitle = titleFor(moduleCode);
        String sessionToken = String.valueOf(getIntent().getStringExtra("sessionToken"));
        String deviceId = String.valueOf(getIntent().getStringExtra("deviceId"));

        buildInterface();
        if (moduleCode.isEmpty() || sessionToken.length() > 2048 ||
                !deviceId.matches("[a-fA-F0-9]{64}")) {
            showError("Akses modul tidak valid. Aktifkan kembali token Anda.");
            return;
        }

        loadModule(sessionToken, deviceId);
    }

    private void buildInterface() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(16), dp(14), dp(16), dp(12));
        root.setBackgroundColor(Color.rgb(248, 245, 241));

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        Button back = button("Kembali", false);
        back.setOnClickListener(view -> finish());
        header.addView(back, new LinearLayout.LayoutParams(dp(92), dp(44)));

        TextView title = new TextView(this);
        title.setText(moduleTitle.isEmpty() ? "Modul Spesialis" : moduleTitle);
        title.setTextSize(19);
        title.setTextColor(Color.rgb(70, 24, 34));
        title.setGravity(Gravity.CENTER);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(0, dp(44), 1);
        titleParams.setMargins(dp(8), 0, dp(100), 0);
        header.addView(title, titleParams);
        root.addView(header, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        statusView = new TextView(this);
        statusView.setText("Memverifikasi jalur produk dan menyiapkan modul...");
        statusView.setTextColor(Color.rgb(103, 91, 84));
        statusView.setTextSize(14);
        statusView.setGravity(Gravity.CENTER);
        statusView.setPadding(dp(8), dp(12), dp(8), dp(12));
        root.addView(statusView, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        imageView = new ImageView(this);
        imageView.setAdjustViewBounds(true);
        imageView.setScaleType(ImageView.ScaleType.FIT_CENTER);
        imageView.setBackgroundColor(Color.WHITE);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.addView(imageView, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT, ScrollView.LayoutParams.WRAP_CONTENT));
        root.addView(scroll, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));

        LinearLayout controls = new LinearLayout(this);
        controls.setOrientation(LinearLayout.HORIZONTAL);
        controls.setGravity(Gravity.CENTER_VERTICAL);
        controls.setPadding(0, dp(10), 0, 0);
        previousButton = button("Sebelumnya", false);
        nextButton = button("Berikutnya", true);
        previousButton.setEnabled(false);
        nextButton.setEnabled(false);
        previousButton.setOnClickListener(view -> showPage(currentPage - 1));
        nextButton.setOnClickListener(view -> showPage(currentPage + 1));
        controls.addView(previousButton, new LinearLayout.LayoutParams(dp(112), dp(46)));

        pageView = new TextView(this);
        pageView.setText("- / -");
        pageView.setTextSize(14);
        pageView.setTextColor(Color.rgb(70, 24, 34));
        pageView.setGravity(Gravity.CENTER);
        controls.addView(pageView, new LinearLayout.LayoutParams(0, dp(46), 1));
        controls.addView(nextButton, new LinearLayout.LayoutParams(dp(112), dp(46)));
        root.addView(controls, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        setContentView(root);
    }

    private Button button(String label, boolean primary) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextSize(13);
        button.setAllCaps(false);
        button.setTextColor(primary ? Color.WHITE : Color.rgb(100, 30, 45));
        GradientDrawable background = new GradientDrawable();
        background.setCornerRadius(dp(12));
        background.setColor(primary ? Color.rgb(132, 29, 42) : Color.WHITE);
        background.setStroke(dp(1), Color.rgb(218, 204, 196));
        button.setBackground(background);
        return button;
    }

    private void loadModule(String sessionToken, String deviceId) {
        executor.execute(() -> {
            try {
                String key = requestModuleKey(sessionToken, deviceId);
                temporaryPdf = decryptAsset(key);
                descriptor = ParcelFileDescriptor.open(
                        temporaryPdf, ParcelFileDescriptor.MODE_READ_ONLY);
                renderer = new PdfRenderer(descriptor);
                if (renderer.getPageCount() < 1) {
                    throw new IOException("Dokumen modul kosong.");
                }
                runOnUiThread(() -> {
                    statusView.setText("Akses terverifikasi. Modul hanya tersedia untuk jalur produk Anda.");
                    showPage(0);
                });
            } catch (Exception error) {
                runOnUiThread(() -> showError(cleanError(error)));
            }
        });
    }

    private String requestModuleKey(String sessionToken, String deviceId) throws Exception {
        JSONObject request = new JSONObject();
        request.put("sessionToken", sessionToken);
        request.put("deviceId", deviceId);
        request.put("moduleCode", moduleCode);
        byte[] bytes = request.toString().getBytes(StandardCharsets.UTF_8);

        HttpsURLConnection connection = (HttpsURLConnection) new URL(API_URL).openConnection();
        try {
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(12000);
            connection.setReadTimeout(30000);
            connection.setDoOutput(true);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setRequestProperty("Accept", "application/json");
            connection.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(bytes);
            }

            int status = connection.getResponseCode();
            InputStream input = status >= 400
                    ? connection.getErrorStream()
                    : connection.getInputStream();
            String raw = readLimited(input, MAX_RESPONSE_BYTES);
            JSONObject result = new JSONObject(raw);
            if (status < 200 || status >= 300 || !result.optBoolean("ok", false)) {
                throw new IOException(result.optString(
                        "message", "Akses modul belum dapat diverifikasi."));
            }
            String key = result.optString("key", "");
            if (!key.matches("[A-Za-z0-9_-]{43}")) {
                throw new IOException("Kunci modul tidak valid.");
            }
            return key;
        } finally {
            connection.disconnect();
        }
    }

    private File decryptAsset(String encodedKey) throws Exception {
        byte[] key = Base64.decode(encodedKey,
                Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
        if (key.length != 32) throw new IOException("Ukuran kunci modul tidak valid.");

        File output = File.createTempFile("panglima-" + moduleCode + "-", ".pdf", getCacheDir());
        String assetName = "modules/" + moduleCode + ".pmod";
        try (InputStream source = getAssets().open(assetName)) {
            byte[] magic = readExactly(source, MAGIC.length);
            if (!Arrays.equals(MAGIC, magic)) throw new IOException("Format modul tidak didukung.");
            byte[] iv = readExactly(source, 12);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"),
                    new GCMParameterSpec(128, iv));

            long total = 0;
            try (CipherInputStream decrypted = new CipherInputStream(source, cipher);
                 FileOutputStream destination = new FileOutputStream(output)) {
                byte[] buffer = new byte[8192];
                int count;
                while ((count = decrypted.read(buffer)) != -1) {
                    total += count;
                    if (total > MAX_DECRYPTED_BYTES) {
                        throw new IOException("Ukuran modul melebihi batas aman.");
                    }
                    destination.write(buffer, 0, count);
                }
            }
            return output;
        } catch (Exception error) {
            //noinspection ResultOfMethodCallIgnored
            output.delete();
            throw error;
        }
    }

    private void showPage(int index) {
        if (renderer == null || index < 0 || index >= renderer.getPageCount()) return;
        PdfRenderer.Page page = null;
        try {
            page = renderer.openPage(index);
            int width = Math.max(dp(320), getResources().getDisplayMetrics().widthPixels - dp(32));
            int height = Math.max(1, Math.round(width * (page.getHeight() / (float) page.getWidth())));
            Bitmap nextBitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
            nextBitmap.eraseColor(Color.WHITE);
            page.render(nextBitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
            if (bitmap != null) bitmap.recycle();
            bitmap = nextBitmap;
            imageView.setImageBitmap(bitmap);
            currentPage = index;
            pageView.setText((index + 1) + " / " + renderer.getPageCount());
            previousButton.setEnabled(index > 0);
            nextButton.setEnabled(index + 1 < renderer.getPageCount());
        } catch (Exception error) {
            showError("Halaman modul belum dapat ditampilkan.");
        } finally {
            if (page != null) page.close();
        }
    }

    private void showError(String message) {
        statusView.setText(message);
        statusView.setTextColor(Color.rgb(154, 38, 48));
        previousButton.setEnabled(false);
        nextButton.setEnabled(false);
    }

    private String cleanError(Exception error) {
        String message = String.valueOf(error.getMessage()).trim();
        return message.isEmpty() ? "Modul belum dapat dibuka. Periksa koneksi lalu coba lagi." : message;
    }

    private String safeModuleCode(String value) {
        String code = value == null ? "" : value.trim().toLowerCase();
        return code.equals("property") || code.equals("insurance") || code.equals("mlm")
                ? code : "";
    }

    private String titleFor(String code) {
        if ("property".equals(code)) return "Modul Agen Properti";
        if ("insurance".equals(code)) return "Modul Agen Asuransi";
        if ("mlm".equals(code)) return "Modul Mitra MLM / Direct Selling";
        return "";
    }

    private byte[] readExactly(InputStream input, int length) throws IOException {
        byte[] result = new byte[length];
        int offset = 0;
        while (offset < length) {
            int count = input.read(result, offset, length - offset);
            if (count < 0) throw new IOException("Data modul tidak lengkap.");
            offset += count;
        }
        return result;
    }

    private String readLimited(InputStream input, int maximum) throws IOException {
        if (input == null) throw new IOException("Server tidak mengirim jawaban.");
        try (InputStream stream = input;
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[2048];
            int count;
            int total = 0;
            while ((count = stream.read(buffer)) != -1) {
                total += count;
                if (total > maximum) throw new IOException("Jawaban server terlalu besar.");
                output.write(buffer, 0, count);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        if (bitmap != null) bitmap.recycle();
        if (renderer != null) renderer.close();
        if (descriptor != null) {
            try { descriptor.close(); } catch (IOException ignored) {}
        }
        if (temporaryPdf != null) {
            //noinspection ResultOfMethodCallIgnored
            temporaryPdf.delete();
        }
        super.onDestroy();
    }
}
