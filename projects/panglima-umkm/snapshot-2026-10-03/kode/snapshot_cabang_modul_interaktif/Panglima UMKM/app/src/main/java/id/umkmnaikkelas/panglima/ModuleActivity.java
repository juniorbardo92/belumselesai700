package id.umkmnaikkelas.panglima;

import android.app.Activity;
import android.app.AlertDialog;
import android.Manifest;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.text.Editable;
import android.text.InputFilter;
import android.text.TextWatcher;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.ArrayAdapter;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.KeyStore;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.crypto.Cipher;
import javax.crypto.CipherInputStream;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import javax.net.ssl.HttpsURLConnection;

public final class ModuleActivity extends Activity {
    private static final String API_URL =
            "https://panglima-device-api.ruang-belajar-mandiri01.workers.dev/v1/module-key";
    private static final byte[] MAGIC = "PGLM1".getBytes(StandardCharsets.US_ASCII);
    private static final int MAX_RESPONSE_BYTES = 16000;
    private static final int MAX_WORKBOOK_BYTES = 2 * 1024 * 1024;
    private static final String OFFLINE_KEY_ALIAS = "panglima_module_access_v1";
    private static final long OFFLINE_ACCESS_MS = 30L * 24 * 60 * 60 * 1000;
    private static final int EXPORT_DOCUMENT = 203;
    private static final int IMPORT_DOCUMENT = 204;
    private static final int MODULE_NOTIFICATION_PERMISSION = 205;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private TextView statusView;
    private TextView pageView;
    private Button previousButton;
    private Button nextButton;
    private Button readingButton;
    private ScrollView scrollView;
    private LinearLayout bottomNav;
    private ProgressBar sectionProgress;
    private LinearLayout workbookView;
    private JSONObject workbookData;
    private JSONObject answers;
    private String participantId;
    private int chapterIndex;
    private int strategyIndex;
    private int guideStep;
    private int extraGroupIndex;
    private int resumeStep;
    private boolean readingMode;
    private int readingPage;
    private volatile boolean destroyed;
    private String moduleCode;
    private String moduleTitle;
    private boolean offlineMode;
    private boolean darkMode;
    private int diagnosisIndex;
    private String currentTab = "home";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        moduleCode = safeModuleCode(getIntent().getStringExtra("moduleCode"));
        moduleTitle = titleFor(moduleCode);
        darkMode = getSharedPreferences("panglima_module_settings", MODE_PRIVATE)
                .getBoolean("darkMode", false);
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
        root.setPadding(dp(16), dp(10), dp(16), dp(12));
        root.setBackgroundColor(darkMode ? Color.rgb(18, 18, 18) : Color.rgb(245, 247, 250));

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        Button back = button("Kembali", false);
        back.setOnClickListener(view -> finish());
        header.addView(back, new LinearLayout.LayoutParams(dp(82), dp(48)));

        TextView title = new TextView(this);
        title.setText(moduleTitle.isEmpty() ? "Modul Spesialis" : moduleTitle);
        title.setTextSize(18);
        title.setTextColor(darkMode ? Color.WHITE : Color.rgb(31, 41, 55));
        title.setGravity(Gravity.CENTER_VERTICAL | Gravity.END);
        title.setMaxLines(2);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(0, dp(56), 1);
        titleParams.setMargins(dp(8), 0, 0, 0);
        header.addView(title, titleParams);
        root.addView(header, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        statusView = new TextView(this);
        statusView.setText("Memverifikasi jalur produk dan menyiapkan modul...");
        statusView.setTextColor(darkMode ? Color.rgb(210, 220, 234) : Color.rgb(70, 80, 95));
        statusView.setTextSize(14);
        statusView.setGravity(Gravity.CENTER_VERTICAL);
        statusView.setPadding(dp(8), dp(6), dp(8), dp(6));
        root.addView(statusView, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        sectionProgress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        sectionProgress.setMax(7);
        sectionProgress.setProgress(0);
        sectionProgress.setVisibility(View.GONE);
        root.addView(sectionProgress, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(5)));

        readingButton = button("Kembali ke panduan", false);
        readingButton.setEnabled(false);
        readingButton.setVisibility(View.GONE);
        readingButton.setOnClickListener(view -> showWorkbook());
        LinearLayout.LayoutParams readingParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(44));
        readingParams.setMargins(0, dp(6), 0, 0);
        root.addView(readingButton, readingParams);

        scrollView = new ScrollView(this);
        scrollView.setFillViewport(true);
        workbookView = new LinearLayout(this);
        workbookView.setOrientation(LinearLayout.VERTICAL);
        scrollView.addView(workbookView, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT, ScrollView.LayoutParams.WRAP_CONTENT));
        root.addView(scrollView, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));

        LinearLayout controls = new LinearLayout(this);
        controls.setOrientation(LinearLayout.HORIZONTAL);
        controls.setGravity(Gravity.CENTER_VERTICAL);
        controls.setPadding(0, dp(10), 0, 0);
        previousButton = button("Kembali", false);
        nextButton = button("Lanjut", true);
        previousButton.setEnabled(false);
        nextButton.setEnabled(false);
        previousButton.setOnClickListener(view -> navigate(-1));
        nextButton.setOnClickListener(view -> navigate(1));
        controls.addView(previousButton, new LinearLayout.LayoutParams(dp(96), dp(50)));

        pageView = new TextView(this);
        pageView.setText("- / -");
        pageView.setTextSize(14);
        pageView.setTextColor(darkMode ? Color.WHITE : Color.rgb(31, 41, 55));
        pageView.setGravity(Gravity.CENTER);
        controls.addView(pageView, new LinearLayout.LayoutParams(0, dp(46), 1));
        controls.addView(nextButton, new LinearLayout.LayoutParams(dp(96), dp(50)));
        root.addView(controls, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        bottomNav = new LinearLayout(this);
        bottomNav.setOrientation(LinearLayout.HORIZONTAL);
        bottomNav.setGravity(Gravity.CENTER_VERTICAL);
        String[] destinations = {"Home", "Journey", "Hari Ini", "Progres", "Profil"};
        for (int item = 0; item < destinations.length; item++) {
            final int destination = item;
            Button tab = button(destinations[item], item == 2);
            tab.setTextSize(11);
            tab.setContentDescription(destinations[item] + " modul " + moduleTitle);
            tab.setOnClickListener(view -> openTab(destination));
            LinearLayout.LayoutParams size = new LinearLayout.LayoutParams(0, dp(52), 1);
            size.setMargins(dp(2), dp(3), dp(2), 0);
            bottomNav.addView(tab, size);
        }
        root.addView(bottomNav, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(56)));

        setContentView(root);
    }

    private Button button(String label, boolean primary) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextSize(14);
        button.setAllCaps(false);
        button.setTextColor(primary ? Color.WHITE : darkMode ? Color.rgb(219, 230, 255) : Color.rgb(30, 70, 145));
        GradientDrawable background = new GradientDrawable();
        background.setCornerRadius(dp(14));
        background.setColor(primary ? Color.rgb(47, 111, 237) : darkMode ? Color.rgb(30, 35, 44) : Color.WHITE);
        background.setStroke(dp(1), darkMode ? Color.rgb(77, 91, 112) : Color.rgb(196, 211, 230));
        button.setBackground(background);
        return button;
    }

    private GradientDrawable panelBackground(boolean emphasized) {
        GradientDrawable panel = new GradientDrawable();
        panel.setCornerRadius(dp(16));
        panel.setColor(darkMode ? Color.rgb(30, 30, 30) : emphasized ? Color.rgb(234, 242, 255) : Color.WHITE);
        panel.setStroke(dp(1), darkMode ? Color.rgb(77, 91, 112) :
                emphasized ? Color.rgb(97, 146, 228) : Color.rgb(220, 228, 239));
        return panel;
    }

    private void loadModule(String sessionToken, String deviceId) {
        executor.execute(() -> {
            try {
                String verifiedId = participantFromSession(sessionToken);
                String key;
                boolean localAccess = false;
                try {
                    key = requestModuleKey(sessionToken, deviceId);
                    cacheModuleKey(verifiedId, deviceId, key);
                } catch (AccessDeniedException denied) {
                    throw denied;
                } catch (IOException networkFailure) {
                    key = cachedModuleKey(verifiedId, deviceId);
                    if (key == null) throw networkFailure;
                    localAccess = true;
                }
                JSONObject catalog = decryptWorkbookAsset(key);
                final boolean openingOffline = localAccess;
                if (destroyed) return;
                runOnUiThread(() -> {
                    if (destroyed) return;
                    participantId = verifiedId;
                    offlineMode = openingOffline;
                    workbookData = catalog;
                    answers = loadAnswers();
                    chapterIndex = Math.max(0, Math.min(9, answers.optInt("guide-chapter", 0)));
                    strategyIndex = Math.max(0, Math.min(9, answers.optInt("guide-strategy", 0)));
                    int oldStep = Math.max(0, Math.min(5, answers.optInt("guide-step", 0)));
                    resumeStep = Math.max(0, Math.min(6, answers.optInt("guide-v2-step",
                            oldStep > 1 ? oldStep + 1 : oldStep)));
                    if (answers.optInt("guide-v2-step", -1) > 3) resumeStep = 0;
                    guideStep = -1;
                    readingButton.setEnabled(true);
                    showWorkbook();
                });
            } catch (Exception error) {
                runOnUiThread(() -> { if (!destroyed) showError(cleanError(error)); });
            }
        });
    }

    private String requestModuleKey(String sessionToken, String deviceId) throws Exception {
        JSONObject request = new JSONObject();
        request.put("sessionToken", sessionToken);
        request.put("deviceId", deviceId);
        request.put("moduleCode", moduleCode);
        request.put("assetVersion", 2);
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
                throw new AccessDeniedException(result.optString(
                        "message", "Akses modul belum dapat diverifikasi."));
            }
            String key = result.optString("key", "");
            if (result.optInt("assetVersion", -1) != 2) {
                throw new AccessDeniedException("Versi materi modul belum tersedia. Coba lagi setelah pembaruan layanan.");
            }
            if (!key.matches("[A-Za-z0-9_-]{43}")) {
                throw new AccessDeniedException("Kunci modul tidak valid.");
            }
            return key;
        } finally {
            connection.disconnect();
        }
    }

    private static final class AccessDeniedException extends IOException {
        AccessDeniedException(String message) { super(message); }
    }

    private String offlineScope(String id, String device) {
        return id + ":" + moduleCode + ":" + device;
    }

    private SecretKey deviceKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(OFFLINE_KEY_ALIAS))
            return ((KeyStore.SecretKeyEntry) store.getEntry(OFFLINE_KEY_ALIAS, null)).getSecretKey();
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(OFFLINE_KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }

    private void cacheModuleKey(String id, String device, String key) {
        try {
            String scope = offlineScope(id, device);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, deviceKey());
            cipher.updateAAD(scope.getBytes(StandardCharsets.UTF_8));
            byte[] ciphertext = cipher.doFinal(key.getBytes(StandardCharsets.US_ASCII));
            byte[] stored = new byte[12 + ciphertext.length];
            System.arraycopy(cipher.getIV(), 0, stored, 0, 12);
            System.arraycopy(ciphertext, 0, stored, 12, ciphertext.length);
            getSharedPreferences("panglima_module_offline_v1", MODE_PRIVATE).edit()
                    .putString(scope, Base64.encodeToString(stored, Base64.NO_WRAP))
                    .putLong(scope + ":checked", System.currentTimeMillis()).apply();
        } catch (Exception ignored) {
            // Online access still works when Android Keystore is unavailable on a device.
        }
    }

    private String cachedModuleKey(String id, String device) {
        try {
            String scope = offlineScope(id, device);
            SharedPreferences store = getSharedPreferences("panglima_module_offline_v1", MODE_PRIVATE);
            long checked = store.getLong(scope + ":checked", 0L);
            long age = System.currentTimeMillis() - checked;
            if (checked <= 0 || age < 0 || age > OFFLINE_ACCESS_MS) return null;
            byte[] stored = Base64.decode(store.getString(scope, ""), Base64.NO_WRAP);
            if (stored.length < 29) return null;
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, deviceKey(),
                    new GCMParameterSpec(128, Arrays.copyOfRange(stored, 0, 12)));
            cipher.updateAAD(scope.getBytes(StandardCharsets.UTF_8));
            String key = new String(cipher.doFinal(stored, 12, stored.length - 12),
                    StandardCharsets.US_ASCII);
            return key.matches("[A-Za-z0-9_-]{43}") ? key : null;
        } catch (Exception ignored) { return null; }
    }

    private String participantFromSession(String token) throws Exception {
        String[] parts = token.split("\\.", -1);
        if (parts.length != 2) throw new IOException("Sesi peserta tidak valid.");
        String payload = new String(Base64.decode(parts[0],
                Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING),
                StandardCharsets.UTF_8);
        String id = new JSONObject(payload).optString("pid", "").toLowerCase(Locale.ROOT);
        if (!id.matches("[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}")) {
            throw new IOException("Identitas peserta tidak valid.");
        }
        // The parsed ID is only authorized when the server responds successfully,
        // or when a matching device-bound Keystore entry authenticates offline access.
        return id;
    }

    private JSONObject decryptWorkbookAsset(String encodedKey) throws Exception {
        byte[] key = Base64.decode(encodedKey,
                Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
        if (key.length != 32) throw new IOException("Kunci modul tidak valid.");
        try (InputStream source = getAssets().open("modules/" + moduleCode + "-workbook.pmod")) {
            if (!Arrays.equals(MAGIC, readExactly(source, MAGIC.length))) {
                throw new IOException("Format lembar kerja tidak didukung.");
            }
            byte[] iv = readExactly(source, 12);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"),
                    new GCMParameterSpec(128, iv));
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (CipherInputStream decrypted = new CipherInputStream(source, cipher)) {
                byte[] buffer = new byte[4096];
                int count;
                while ((count = decrypted.read(buffer)) != -1) {
                    if (bytes.size() + count > MAX_WORKBOOK_BYTES) {
                        throw new IOException("Lembar kerja melebihi batas aman.");
                    }
                    bytes.write(buffer, 0, count);
                }
            }
            JSONObject catalog = new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
            JSONArray sheets = catalog.optJSONArray("sheets");
            JSONArray exercises = catalog.optJSONArray("exercises");
            JSONArray pages = catalog.optJSONArray("pages");
            JSONArray chapterPages = catalog.optJSONArray("chapterPages");
            JSONArray chapterGoals = catalog.optJSONArray("chapterGoals");
            JSONArray extraGroups = catalog.optJSONArray("extras");
            if (catalog.optInt("schema") != 6 ||
                    !moduleCode.equals(catalog.optString("code")) ||
                    sheets == null || sheets.length() != 10 ||
                    exercises == null || exercises.length() != 100 ||
                    pages == null || pages.length() < 250 || pages.length() > 350 ||
                    chapterPages == null || chapterPages.length() != 10 ||
                    chapterGoals == null || chapterGoals.length() != 10 ||
                    catalog.optJSONArray("chapterHooks") == null ||
                    catalog.optJSONArray("chapterHooks").length() != 10 ||
                    extraGroups == null ||
                    catalog.optJSONArray("diagnosisScale") == null) {
                throw new IOException("Lembar kerja jalur produk tidak sesuai.");
            }
            for (int chapter = 0; chapter < 10; chapter++) {
                int page = chapterPages.optInt(chapter, -1);
                if (page < 0 || page >= pages.length()) {
                    throw new IOException("Navigasi modul tidak lengkap.");
                }
                if (chapterGoals.optString(chapter).trim().isEmpty()) {
                    throw new IOException("Hasil bab tidak lengkap.");
                }
            }
            for (int index = 0; index < sheets.length(); index++) {
                JSONObject sheet = sheets.optJSONObject(index);
                if (sheet == null || sheet.optInt("chapter") != index + 1 ||
                        sheet.optJSONObject("fields") == null) {
                    throw new IOException("Data lembar kerja tidak lengkap.");
                }
                for (char letter = 'A'; letter <= 'H'; letter++) {
                    if (sheet.getJSONObject("fields").optString(String.valueOf(letter)).isEmpty()) {
                        throw new IOException("Isian lembar kerja tidak lengkap.");
                    }
                }
            }
            for (int index = 0; index < exercises.length(); index++) {
                JSONObject entry = exercises.optJSONObject(index);
                if (entry == null || entry.optInt("chapter") != index / 10 + 1 ||
                        entry.optInt("strategy") != index % 10 + 1 ||
                        entry.optString("lesson").isEmpty() ||
                        entry.optString("title").isEmpty() ||
                        entry.optString("case").isEmpty() ||
                        entry.optString("reflection").isEmpty() ||
                        entry.optString("exercise").isEmpty() ||
                        !entry.optString("bookPages").matches("[0-9]+-[0-9]+") ||
                        entry.optJSONArray("checklist") == null ||
                        entry.optJSONArray("checklist").length() !=
                                ("insurance".equals(moduleCode) ? 2 : 3) ||
                        entry.optInt("sourcePage", -1) < 0 ||
                        entry.optInt("sourcePage", -1) + 1 >= pages.length()) {
                    throw new IOException("Materi latihan jalur produk tidak lengkap.");
                }
            }
            for (int index = 0; index < extraGroups.length(); index++) {
                JSONObject group = extraGroups.optJSONObject(index);
                JSONArray fields = group == null ? null : group.optJSONArray("fields");
                if (group == null || group.optString("title").isEmpty() ||
                        fields == null || fields.length() < 1) {
                    throw new IOException("Catatan pendamping tidak lengkap.");
                }
                for (int item = 0; item < fields.length(); item++) {
                    JSONObject field = fields.optJSONObject(item);
                    if (field == null || field.optString("id").isEmpty() ||
                            field.optString("label").isEmpty()) {
                        throw new IOException("Label catatan pendamping tidak lengkap.");
                    }
                }
            }
            return catalog;
        }
    }

    private String answerStorageKey() {
        return participantId + ":" + moduleCode;
    }

    private JSONObject loadAnswers() {
        try {
            SharedPreferences storage = getSharedPreferences("panglima_specialist_workbook_v1", MODE_PRIVATE);
            return new JSONObject(storage.getString(answerStorageKey(), "{}"));
        } catch (Exception ignored) {
            return new JSONObject();
        }
    }

    private void saveAnswer(String field, String value) {
        try {
            answers.put(field, value);
            getSharedPreferences("panglima_specialist_workbook_v1", MODE_PRIVATE)
                    .edit().putString(answerStorageKey(), answers.toString()).apply();
            updateWorkbookStatus();
        } catch (Exception ignored) {
            statusView.setText("Jawaban belum dapat disimpan. Periksa ruang penyimpanan.");
        }
    }

    private void updateWorkbookStatus() {
        int count = 0;
        for (int chapter = 1; chapter <= 10; chapter++) {
            for (char letter = 'A'; letter <= 'H'; letter++) {
                if (!answers.optString(chapter + "-" + letter).trim().isEmpty()) count++;
            }
        }
        statusView.setText("Jawaban tersimpan di perangkat ini · " + count + "/80 isian bab terisi");
    }

    private void rememberPosition() {
        try {
            answers.put("guide-chapter", chapterIndex);
            answers.put("guide-strategy", strategyIndex);
            if (guideStep >= 0 && guideStep <= 6) {
                answers.put("guide-v2-step", guideStep);
                resumeStep = guideStep;
            }
            getSharedPreferences("panglima_specialist_workbook_v1", MODE_PRIVATE)
                    .edit().putString(answerStorageKey(), answers.toString()).apply();
        } catch (Exception ignored) {
            statusView.setText("Posisi membaca belum tersimpan. Periksa ruang penyimpanan.");
        }
    }

    private void showWorkbook() {
        if (workbookData == null) return;
        readingMode = false;
        readingButton.setVisibility(View.GONE);
        if (guideStep == -1) showDashboard();
        else if (guideStep == 7) showExtras();
        else if (guideStep == 8) showDiagnosis();
        else if (guideStep >= 9) showChapterSheet(guideStep);
        else showWorksheet(chapterIndex);
    }

    private void showDashboard() {
        guideStep = -1;
        currentTab = "home";
        workbookView.removeAllViews();
        sectionProgress.setVisibility(View.GONE);
        int finished = finishedStrategies();
        addSection("Halo, " + displayName() + " 👋", moduleTitle +
                (offlineMode ? " · tersedia offline" : " · jawaban tersimpan otomatis"));
        addSection("Perjalananmu · " + finished + "/100 strategi",
                "Level " + (1 + finished / 10) + " · " + (finished * 10) +
                " XP · " + currentStreak() + " hari belajar berturut-turut");
        addSection("Hari ini · satu langkah kecil",
                "Kerjakan satu latihan, tulis buktinya, lalu tentukan tindak lanjut. Waktu sekitar 10 menit.");
        Button continueButton = button("Lanjutkan strategi " +
                (chapterIndex + 1) + "." + (strategyIndex + 1), true);
        continueButton.setOnClickListener(view -> {
            guideStep = resumeStep;
            showWorksheet(chapterIndex);
        });
        workbookView.addView(continueButton, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(56)));
        addSection("Buku utama ↔ modul jalur",
                "Nomor strategi di aplikasi sama dengan buku 100 Strategi Sun Tzu. " +
                "Baca rujukan buku, terapkan pada jalur Anda, lalu isi buktinya di sini.");
        if (!answers.optBoolean("intro-done")) {
            Button intro = button("Pengenalan singkat · Belajar, Latihan, Bertumbuh", false);
            intro.setOnClickListener(view -> showIntroduction(0));
            workbookView.addView(intro, new LinearLayout.LayoutParams(-1, dp(52)));
        }
        pageView.setText("Beranda");
        previousButton.setEnabled(false);
        nextButton.setText("Mulai");
        nextButton.setEnabled(true);
        updateWorkbookStatus();
        scrollView.scrollTo(0, 0);
    }

    private void showWorksheet(int index) {
        if (workbookData == null || index < 0 || index >= 10) return;
        chapterIndex = index;
        currentTab = "journey";
        rememberPosition();
        workbookView.removeAllViews();
        sectionProgress.setVisibility(View.VISIBLE);
        sectionProgress.setProgress(guideStep + 1);
        JSONObject sheet = workbookData.optJSONArray("sheets").optJSONObject(index);
        JSONObject exercise = workbookData.optJSONArray("exercises")
                .optJSONObject(index * 10 + strategyIndex);
        if (sheet == null || exercise == null) return;
        String number = (index + 1) + "." + (strategyIndex + 1);
        String[] stages = {"Mulai", "Konsep", "Contoh", "Latihan", "Refleksi", "Aksi kecil", "Cek hasil"};
        addSection("Bagian " + (guideStep + 1) + " dari 7 · " + stages[guideStep],
                "Bab " + (index + 1) + " · Strategi " + number + " · " + exercise.optString("title"));
        if (guideStep == 0) {
            addSection("Pertanyaan pembuka", workbookData.optJSONArray("chapterHooks").optString(index));
            addSection("Tujuan bab", workbookData.optJSONArray("chapterGoals").optString(index));
            addSection("Buku utama · hlm. " + exercise.optString("bookPages"),
                    "Nomor strategi ini sama dengan buku utama. Baca prinsipnya bila tersedia, lalu lanjutkan penerapannya di modul jalur.");
        } else if (guideStep == 1) {
            addSection("Konsep inti · " + number, exercise.optString("lesson"));
            Button source = button("Baca materi lengkap strategi ini", false);
            source.setOnClickListener(view -> showReadingPage(exercise.optInt("sourcePage")));
            workbookView.addView(source, new LinearLayout.LayoutParams(-1, dp(52)));
        } else if (guideStep == 2) {
            addSection("Contoh nyata · ilustrasi", exercise.optString("case"));
        } else if (guideStep == 3) {
            addSection("Latihan untuk pekerjaan Anda", exercise.optString("exercise"));
            addAnswer(number + "-exercise", "Tulis hasil latihan dari situasi Anda");
        } else if (guideStep == 4) {
            addSection("Refleksi", exercise.optString("reflection"));
            addAnswer(number + "-reflection", "Apa yang Anda pelajari dari situasi Anda?");
        } else if (guideStep == 5) {
            addSection("Satu aksi kecil hari ini", "Tentukan tindakan yang benar-benar dapat Anda lakukan. Cantumkan bukti, penanggung jawab, dan tanggal tinjau.");
            addAnswer(number + "-action", "Aksi dan kapan akan dilakukan");
            addAnswer(number + "-evidence", "Bukti yang bisa diperiksa dan tanggal tinjau");
        } else {
            addSection("Periksa sebelum lanjut", "Tandai hanya hal yang sudah Anda periksa. XP diperoleh ketika latihan dan bukti terisi.");
            JSONArray checks = exercise.optJSONArray("checklist");
            for (int item = 0; item < checks.length(); item++) {
                final String key = number + "-check-" + item;
                CheckBox check = new CheckBox(this);
                check.setText(checks.optString(item));
                check.setTextSize(16);
                check.setTextColor(darkMode ? Color.WHITE : Color.rgb(31, 41, 55));
                check.setMinHeight(dp(48));
                check.setChecked("true".equals(answers.optString(key)));
                check.setOnCheckedChangeListener((control, checked) -> saveAnswer(key, String.valueOf(checked)));
                workbookView.addView(check);
            }
            addSection("Kesiapan langkah berikutnya", "Tuliskan nilai 1–10 dan cek lagi setelah mencoba aksi kecil.");
            addShortAnswer(number + "-rating", "Kesiapan 1–10");
            Button done = button(answers.optBoolean("done:" + number) ? "Sudah selesai ✓" : "Selesaikan latihan · +10 XP", true);
            done.setOnClickListener(view -> completeStrategy(number));
            workbookView.addView(done, new LinearLayout.LayoutParams(-1, dp(52)));
            Button sheetButton = button("Isi lembar kerja bab ini (A–H)", false);
            sheetButton.setOnClickListener(view -> showChapterSheet(9));
            workbookView.addView(sheetButton, new LinearLayout.LayoutParams(-1, dp(52)));
        }
        previousButton.setText("Kembali");
        nextButton.setText(guideStep == 6 ? "Strategi berikut" : "Lanjut");
        pageView.setText((guideStep + 1) + "/7");
        previousButton.setEnabled(true);
        nextButton.setEnabled(true);
        updateWorkbookStatus();
        scrollView.scrollTo(0, 0);
    }

    private void showChapterSheet(int step) {
        guideStep = step;
        currentTab = "journey";
        readingMode = false;
        sectionProgress.setVisibility(View.GONE);
        workbookView.removeAllViews();
        JSONObject sheet = workbookData.optJSONArray("sheets").optJSONObject(chapterIndex);
        if (sheet == null) return;
        String[] titles = {"Bagian A–D", "Bagian E–H", "Keputusan 7 hari"};
        addSection("Lembar kerja bab " + (chapterIndex + 1) + " · " + titles[step - 9],
                "Jawaban Anda tersimpan otomatis. Gunakan kode kasus yang sama saat berpindah strategi.");
        if (step <= 10) {
            if ("mlm".equals(moduleCode)) {
                String segment = step == 9 ? "ABCD" : "EFGH";
                addShortAnswer("pdf-extra:" + String.format(Locale.ROOT,
                        "MLM.LK%02d.%s.kode_tanggal", chapterIndex + 1, segment), "Kode kasus dan tanggal");
            }
            addChapterFields(sheet, step == 9 ? 'A' : 'E', step == 9 ? 'D' : 'H');
        } else {
            String prefix = "chapter-" + (chapterIndex + 1) + "-";
            addLabeledAnswer("Keputusan", prefix + "decision", "Satu keputusan Anda");
            addLabeledAnswer("Tindakan dan waktu", prefix + "action", "Langkah pertama dalam 7 hari");
            addLabeledAnswer("Penanggung jawab", prefix + "owner", "Nama atau peran");
            addLabeledAnswer("Ukuran keberhasilan", prefix + "kpi", "Ukuran dan target");
            addLabeledAnswer("Risiko dan antisipasi", prefix + "risk", "Risiko dan langkah cadangan");
        }
        previousButton.setEnabled(true);
        nextButton.setEnabled(true);
        pageView.setText((step - 8) + "/3");
        nextButton.setText(step == 11 ? "Journey" : "Lanjut");
        scrollView.scrollTo(0, 0);
    }

    private void openTab(int tab) {
        if (workbookData == null) return;
        readingMode = false;
        readingButton.setVisibility(View.GONE);
        sectionProgress.setVisibility(View.GONE);
        switch (tab) {
            case 0: showDashboard(); break;
            case 1: showJourney(); break;
            case 2: showQuickActions(); break;
            case 3: showProgress(); break;
            default: showProfile();
        }
    }

    private void showJourney() {
        currentTab = "journey";
        workbookView.removeAllViews();
        addSection("Journey · pilih satu fokus", "10 bidang · 100 strategi. Anda boleh mulai dari masalah yang paling penting.");
        JSONArray sheets = workbookData.optJSONArray("sheets");
        String[] chapterNames = new String[10];
        for (int i = 0; i < 10; i++) {
            String title = sheets.optJSONObject(i).optString("title");
            chapterNames[i] = "Bab " + (i + 1) + " · " + title.replaceFirst("^LK-[^ ]+\\s*·\\s*", "");
        }
        Spinner chapterPicker = new Spinner(this);
        ArrayAdapter<String> adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_item, chapterNames);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        chapterPicker.setAdapter(adapter);
        chapterPicker.setSelection(chapterIndex);
        chapterPicker.setContentDescription("Pilih bidang dari sepuluh bab modul");
        workbookView.addView(chapterPicker, new LinearLayout.LayoutParams(-1, dp(56)));
        chapterPicker.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener() {
            @Override public void onNothingSelected(android.widget.AdapterView<?> parent) {}
            @Override public void onItemSelected(android.widget.AdapterView<?> parent, View view,
                                                 int position, long id) {
                if (position != chapterIndex) { chapterIndex = position; showJourney(); }
            }
        });
        addSection("Fokus bab ini · " + finishedChapter(chapterIndex) + "/10 selesai",
                workbookData.optJSONArray("chapterGoals").optString(chapterIndex));
        JSONArray exercises = workbookData.optJSONArray("exercises");
        for (int item = 0; item < 10; item++) {
            final int selected = item;
            String number = (chapterIndex + 1) + "." + (item + 1);
            JSONObject exercise = exercises.optJSONObject(chapterIndex * 10 + item);
            Button strategy = button((answers.optBoolean("done:" + number) ? "✓ " : "○ ") +
                    number + " · " + exercise.optString("title"), false);
            strategy.setGravity(Gravity.CENTER_VERTICAL | Gravity.START);
            strategy.setPadding(dp(12), 0, dp(8), 0);
            strategy.setOnClickListener(view -> { strategyIndex = selected; guideStep = 0; showWorksheet(chapterIndex); });
            LinearLayout.LayoutParams size = new LinearLayout.LayoutParams(-1, dp(56));
            size.setMargins(0, dp(4), 0, 0);
            workbookView.addView(strategy, size);
        }
        Button sheet = button("Lembar kerja bab · A–H dan keputusan", false);
        sheet.setOnClickListener(view -> showChapterSheet(9));
        workbookView.addView(sheet, new LinearLayout.LayoutParams(-1, dp(52)));
        Button book = button("Baca materi lengkap bab ini", false);
        book.setOnClickListener(view -> showReadingPage(
                workbookData.optJSONArray("chapterPages").optInt(chapterIndex)));
        workbookView.addView(book, new LinearLayout.LayoutParams(-1, dp(52)));
        previousButton.setEnabled(false);
        nextButton.setEnabled(false);
        pageView.setText((chapterIndex + 1) + "/10 bab");
        updateWorkbookStatus();
        scrollView.scrollTo(0, 0);
    }

    private void showQuickActions() {
        String number = (chapterIndex + 1) + "." + (strategyIndex + 1);
        new AlertDialog.Builder(this).setTitle("Hari Ini · pilih satu aksi")
                .setItems(new String[]{"Mulai latihan strategi " + number,
                        "Tulis refleksi singkat", "Cek tantangan dan bukti hari ini"}, (dialog, which) -> {
                    guideStep = which == 0 ? 3 : which == 1 ? 4 : 5;
                    showWorksheet(chapterIndex);
                }).setNegativeButton("Tutup", null).show();
    }

    private String displayName() {
        String name = answers.optString("profile-name", "").trim();
        return name.isEmpty() ? "Peserta" : name;
    }

    private int finishedStrategies() {
        int total = 0;
        for (int chapter = 1; chapter <= 10; chapter++) {
            total += finishedChapter(chapter - 1);
        }
        return total;
    }

    private int finishedChapter(int chapter) {
        int total = 0;
        for (int strategy = 1; strategy <= 10; strategy++) {
            if (answers.optBoolean("done:" + (chapter + 1) + "." + strategy)) total++;
        }
        return total;
    }

    private int currentStreak() {
        int streak = 0;
        long now = System.currentTimeMillis();
        for (int day = 0; day < 366; day++) {
            String stamp = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT)
                    .format(new Date(now - day * 86400000L));
            if (answers.optBoolean("day:" + stamp)) streak++;
            else if (day != 0) break;
        }
        return streak;
    }

    private void completeStrategy(String number) {
        if (answers.optString(number + "-exercise").trim().isEmpty() ||
                answers.optString(number + "-evidence").trim().isEmpty()) {
            new AlertDialog.Builder(this).setTitle("Satu langkah lagi")
                    .setMessage("Isi hasil latihan dan bukti beserta tanggal tinjau terlebih dahulu. Isian akan tersimpan otomatis.")
                    .setPositiveButton("Isi latihan", (dialog, which) -> { guideStep = 3; showWorksheet(chapterIndex); })
                    .setNegativeButton("Nanti", null).show();
            return;
        }
        boolean first = !answers.optBoolean("done:" + number);
        if (first) {
            saveAnswer("done:" + number, "true");
            String day = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date());
            saveAnswer("day:" + day, "true");
            saveAnswer("day-count:" + day,
                    String.valueOf(answers.optInt("day-count:" + day, 0) + 1));
        }
        new AlertDialog.Builder(this).setTitle(first ? "✓ Latihan selesai · +10 XP" : "✓ Latihan sudah tercatat")
                .setMessage("Bukti tersimpan di perangkat Anda. Lanjutkan strategi berikutnya saat siap.")
                .setPositiveButton("Lanjut", (dialog, which) -> navigate(1))
                .setNegativeButton("Lihat progres", (dialog, which) -> showProgress()).show();
    }

    private void showProgress() {
        currentTab = "progress";
        sectionProgress.setVisibility(View.GONE);
        workbookView.removeAllViews();
        int finished = finishedStrategies();
        addSection("Progres yang benar-benar dikerjakan", finished + "/100 strategi · " +
                finished * 10 + " XP · Level " + (1 + finished / 10));
        addSection("Kebiasaan belajar", currentStreak() + " hari berturut-turut. " +
                "Satu strategi mendapat poin setelah latihan dan bukti diisi.");
        addSection("Tujuh hari terakhir", "Setiap baris menunjukkan latihan yang benar-benar selesai pada hari tersebut.");
        for (int offset = 6; offset >= 0; offset--) {
            String day = new SimpleDateFormat("EEE dd/MM", new Locale("id", "ID"))
                    .format(new Date(System.currentTimeMillis() - offset * 86400000L));
            String stamp = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT)
                    .format(new Date(System.currentTimeMillis() - offset * 86400000L));
            int count = answers.optInt("day-count:" + stamp, 0);
            addSection(day + " · " + count + " latihan", count == 0 ? "Belum ada latihan tercatat" :
                    "✓ " + count + " latihan selesai");
        }
        if (finished > 0) addSection("Badge · Latihan pertama", "Satu hasil latihan sudah dicatat.");
        if (currentStreak() >= 7) addSection("Badge · Konsisten 7 hari", "Tujuh hari belajar berturut-turut.");
        for (int chapter = 0; chapter < 10; chapter++) {
            int count = finishedChapter(chapter);
            JSONObject sheet = workbookData.optJSONArray("sheets").optJSONObject(chapter);
            addSection("Bab " + (chapter + 1) + " · " + count + "/10" +
                    (count == 10 ? " ✓" : ""), sheet.optString("title"));
        }
        Button reflect = button("Lihat refleksi terakhir", false);
        reflect.setOnClickListener(view -> { guideStep = 4; showWorksheet(chapterIndex); });
        workbookView.addView(reflect, new LinearLayout.LayoutParams(-1, dp(52)));
        previousButton.setEnabled(false);
        nextButton.setEnabled(false);
        pageView.setText(finished + "%");
        scrollView.scrollTo(0, 0);
    }

    private void showProfile() {
        currentTab = "profile";
        sectionProgress.setVisibility(View.GONE);
        workbookView.removeAllViews();
        addSection("Profil belajar", "Data modul tersimpan di perangkat ini. Nama di bawah hanya untuk sapaan di aplikasi.");
        addShortAnswer("profile-name", "Nama panggilan");
        addShortAnswer("profile-goal", "Tujuan belajar Anda");
        addSection("Kasus aktif", "Gunakan kode kasus yang sama di bab dan strategi terkait. Hindari data pribadi pelanggan.");
        addShortAnswer("linked-case-id", "Contoh: C-001, P-001, atau K-001");
        addShortAnswer("linked-case-date", "Tanggal catatan");
        if (availableExtras().length() > 0) {
            Button extras = button("Catatan pendamping", false);
            extras.setOnClickListener(view -> showExtras());
            workbookView.addView(extras, new LinearLayout.LayoutParams(-1, dp(52)));
        }
        Button diagnosis = button("Pilih prioritas · diagnosis awal", false);
        diagnosis.setOnClickListener(view -> { diagnosisIndex = chapterIndex; showDiagnosis(); });
        workbookView.addView(diagnosis, new LinearLayout.LayoutParams(-1, dp(52)));
        Button export = button("Ekspor jawaban ke file / Google Drive", true);
        export.setOnClickListener(view -> exportAnswers());
        workbookView.addView(export, new LinearLayout.LayoutParams(-1, dp(52)));
        Button restore = button("Pulihkan jawaban dari file", false);
        restore.setOnClickListener(view -> importAnswers());
        workbookView.addView(restore, new LinearLayout.LayoutParams(-1, dp(52)));
        Button theme = button(darkMode ? "Tema terang" : "Tema gelap", false);
        theme.setOnClickListener(view -> changeTheme());
        workbookView.addView(theme, new LinearLayout.LayoutParams(-1, dp(52)));
        Button reminder = button(ModuleReminderReceiver.isEnabled(this, moduleCode)
                ? "Matikan pengingat belajar 09.00" : "Aktifkan pengingat belajar 09.00", false);
        reminder.setOnClickListener(view -> toggleReminder());
        workbookView.addView(reminder, new LinearLayout.LayoutParams(-1, dp(52)));
        Button reset = button("Reset jawaban modul ini", false);
        reset.setOnClickListener(view -> confirmReset());
        workbookView.addView(reset, new LinearLayout.LayoutParams(-1, dp(52)));
        addSection("Akses offline", offlineMode ?
                "Anda memakai aktivasi tersimpan. Sambungkan internet dalam 30 hari untuk memperbarui akses." :
                "Setelah akses pertama diverifikasi, materi dan jawaban dapat dibuka tanpa koneksi hingga 30 hari. Akses server yang ditolak tetap berlaku.");
        previousButton.setEnabled(false);
        nextButton.setEnabled(false);
        pageView.setText("Profil");
        scrollView.scrollTo(0, 0);
    }

    private void showIntroduction(int step) {
        String[] titles = {"Belajar", "Latihan", "Bertumbuh"};
        String[] bodies = {"Pilih satu masalah. Nomor strategi menghubungkan buku utama dan modul jalur.",
                "Kerjakan latihan dari pengalaman Anda; jawaban tersimpan otomatis di perangkat.",
                "Catat bukti dan tinjau hasilnya. Luangkan sekitar 10 menit sehari."};
        workbookView.removeAllViews();
        addSection((step + 1) + "/3 · " + titles[step], bodies[step]);
        Button next = button(step == 2 ? "Mulai belajar" : "Berikutnya", true);
        next.setOnClickListener(view -> {
            if (step == 2) { saveAnswer("intro-done", "true"); showDashboard(); }
            else showIntroduction(step + 1);
        });
        workbookView.addView(next, new LinearLayout.LayoutParams(-1, dp(52)));
        previousButton.setEnabled(false);
        nextButton.setEnabled(false);
        pageView.setText((step + 1) + "/3");
        scrollView.scrollTo(0, 0);
    }

    private void exportAnswers() {
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, "panglima-" + moduleCode + "-jawaban.json");
        startActivityForResult(intent, EXPORT_DOCUMENT);
    }

    private void importAnswers() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        startActivityForResult(intent, IMPORT_DOCUMENT);
    }

    private void changeTheme() {
        darkMode = !darkMode;
        getSharedPreferences("panglima_module_settings", MODE_PRIVATE).edit()
                .putBoolean("darkMode", darkMode).apply();
        buildInterface();
        readingButton.setEnabled(true);
        showProfile();
    }

    private void toggleReminder() {
        if (ModuleReminderReceiver.isEnabled(this, moduleCode)) {
            ModuleReminderReceiver.setEnabled(this, moduleCode, false);
            showProfile();
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, MODULE_NOTIFICATION_PERMISSION);
            return;
        }
        ModuleReminderReceiver.setEnabled(this, moduleCode, true);
        showProfile();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == MODULE_NOTIFICATION_PERMISSION) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                ModuleReminderReceiver.setEnabled(this, moduleCode, true);
            }
            showProfile();
        }
    }

    private void confirmReset() {
        new AlertDialog.Builder(this).setTitle("Reset jawaban modul ini?")
                .setMessage("Jawaban, progres, dan refleksi jalur ini pada perangkat akan dihapus. Ekspor dulu jika ingin menyimpan salinannya. Aktivasi dan jalur lain tetap tersedia.")
                .setNegativeButton("Batal", null)
                .setPositiveButton("Hapus jawaban", (dialog, which) -> {
                    getSharedPreferences("panglima_specialist_workbook_v1", MODE_PRIVATE)
                            .edit().remove(answerStorageKey()).apply();
                    answers = new JSONObject();
                    chapterIndex = 0;
                    strategyIndex = 0;
                    resumeStep = 0;
                    showDashboard();
                }).show();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (resultCode != RESULT_OK || data == null || data.getData() == null) return;
        if (requestCode == IMPORT_DOCUMENT) {
            try (InputStream input = getContentResolver().openInputStream(data.getData())) {
                JSONObject backup = new JSONObject(readLimited(input, 512 * 1024));
                if (!"panglima-modul-answers-v1".equals(backup.optString("format")) ||
                        !moduleCode.equals(backup.optString("moduleCode")) ||
                        backup.optJSONObject("answers") == null) {
                    throw new IOException("File bukan cadangan untuk jalur modul ini.");
                }
                JSONObject restored = backup.getJSONObject("answers");
                new AlertDialog.Builder(this).setTitle("Pulihkan jawaban?")
                        .setMessage("Jawaban dan progres lokal untuk jalur ini akan diganti oleh isi file.")
                        .setNegativeButton("Batal", null)
                        .setPositiveButton("Pulihkan", (dialog, which) -> {
                            answers = restored;
                            getSharedPreferences("panglima_specialist_workbook_v1", MODE_PRIVATE)
                                    .edit().putString(answerStorageKey(), answers.toString()).apply();
                            chapterIndex = Math.max(0, Math.min(9, answers.optInt("guide-chapter", 0)));
                            strategyIndex = Math.max(0, Math.min(9, answers.optInt("guide-strategy", 0)));
                            resumeStep = Math.max(0, Math.min(6, answers.optInt("guide-v2-step", 0)));
                            showDashboard();
                        }).show();
            } catch (Exception error) { showError("Pemulihan belum selesai: " + cleanError(error)); }
            return;
        }
        if (requestCode != EXPORT_DOCUMENT) return;
        try {
            JSONObject backup = new JSONObject();
            backup.put("format", "panglima-modul-answers-v1");
            backup.put("moduleCode", moduleCode);
            backup.put("answers", answers);
            try (OutputStream output = getContentResolver().openOutputStream(data.getData())) {
                if (output == null) throw new IOException("Lokasi tidak dapat ditulis.");
                output.write(backup.toString(2).getBytes(StandardCharsets.UTF_8));
            }
            new AlertDialog.Builder(this).setMessage("Jawaban berhasil diekspor. Simpan file di tempat pribadi karena berisi catatan pekerjaan Anda.")
                    .setPositiveButton("OK", null).show();
        } catch (Exception error) { showError("Ekspor belum selesai: " + cleanError(error)); }
    }

    private void addLabeledAnswer(String label, String key, String hint) {
        addSection(label, "");
        addAnswer(key, hint);
    }

    private JSONArray availableExtras() {
        JSONArray filtered = new JSONArray();
        JSONArray source = workbookData.optJSONArray("extras");
        if (source == null) return filtered;
        for (int index = 0; index < source.length(); index++) {
            JSONObject group = source.optJSONObject(index);
            if (group != null && !"diagnosis".equals(group.optString("group")) &&
                    !group.optString("group").startsWith("chapter-code-")) {
                filtered.put(group);
            }
        }
        return filtered;
    }

    private void showExtras() {
        guideStep = 7;
        JSONArray groups = availableExtras();
        if (groups.length() == 0) { showDashboard(); return; }
        extraGroupIndex = Math.max(0, Math.min(extraGroupIndex, groups.length() - 1));
        workbookView.removeAllViews();
        addSection("Catatan pendamping", "Isi yang sesuai kebutuhan saja. Catatan disimpan terpisah dari refleksi strategi, dan dapat dipakai lagi ketika Anda kembali ke bab lain.");
        String[] names = new String[groups.length()];
        for (int i = 0; i < groups.length(); i++) names[i] = groups.optJSONObject(i).optString("title");
        Spinner picker = new Spinner(this);
        ArrayAdapter<String> adapter = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_item, names);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        picker.setAdapter(adapter);
        picker.setSelection(extraGroupIndex);
        workbookView.addView(picker, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(52)));
        picker.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener() {
            @Override public void onNothingSelected(android.widget.AdapterView<?> parent) {}
            @Override public void onItemSelected(android.widget.AdapterView<?> parent, View view,
                                                  int position, long id) {
                if (position != extraGroupIndex) {
                    extraGroupIndex = position;
                    showExtras();
                }
            }
        });
        JSONObject group = groups.optJSONObject(extraGroupIndex);
        Button source = button("Baca penjelasan lengkap", false);
        source.setOnClickListener(view -> showReadingPage(group.optInt("page")));
        workbookView.addView(source, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(50)));
        JSONArray fields = group.optJSONArray("fields");
        for (int i = 0; i < fields.length(); i++) {
            JSONObject field = fields.optJSONObject(i);
            addLabeledAnswer(field.optString("label"), "pdf-extra:" + field.optString("id"),
                    "Tulis catatan nyata untuk pekerjaan Anda");
        }
        pageView.setText("Catatan " + (extraGroupIndex + 1) + "/" + groups.length());
        previousButton.setEnabled(true);
        nextButton.setText("Beranda");
        updateWorkbookStatus();
        scrollView.scrollTo(0, 0);
    }

    private void showDiagnosis() {
        guideStep = 8;
        currentTab = "profile";
        sectionProgress.setVisibility(View.GONE);
        workbookView.removeAllViews();
        diagnosisIndex = Math.max(0, Math.min(9, diagnosisIndex));
        addSection("Diagnosis awal · " + (diagnosisIndex + 1) + "/10",
                "Nilai 0 = belum, 1 = sebagian, 2 = konsisten dengan bukti. Ini untuk memilih bab, bukan prediksi hasil.");
        JSONArray sheets = workbookData.optJSONArray("sheets");
        addSection("Bab " + (diagnosisIndex + 1) + " · " + sheets.optJSONObject(diagnosisIndex).optString("title"),
                workbookData.optJSONArray("chapterGoals").optString(diagnosisIndex));
        addDiagnosisScore(diagnosisIndex + 1);
        String evidenceKey = "mlm".equals(moduleCode)
                ? "pdf-extra:MLM.diagnosis." + (diagnosisIndex + 1) + ".bukti"
                : "diagnosis-v2-" + (diagnosisIndex + 1) + "-evidence";
        addAnswer(evidenceKey, "Bukti dan tanggal, atau tulis belum ada");
        Button select = button("Kerjakan Bab " + (diagnosisIndex + 1), true);
        select.setOnClickListener(view -> {
            chapterIndex = diagnosisIndex;
            strategyIndex = 0;
            guideStep = 0;
            showWorksheet(chapterIndex);
        });
        workbookView.addView(select, new LinearLayout.LayoutParams(-1, dp(52)));
        pageView.setText((diagnosisIndex + 1) + "/10");
        previousButton.setEnabled(diagnosisIndex > 0);
        nextButton.setEnabled(true);
        nextButton.setText(diagnosisIndex == 9 ? "Profil" : "Lanjut");
        updateWorkbookStatus();
        scrollView.scrollTo(0, 0);
    }

    private void addDiagnosisScore(int chapter) {
        String key = "insurance".equals(moduleCode) ? "diagnosis-v2-AS-" + chapter :
                "pdf-extra:" + ("property".equals(moduleCode)
                        ? "AP.diagnosis." + chapter : "MLM.diagnosis." + chapter + ".nilai");
        Spinner picker = new Spinner(this);
        String[] scores = {"Pilih nilai", "0 · Belum", "1 · Sebagian", "2 · Konsisten dan ada bukti"};
        ArrayAdapter<String> adapter = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_item, scores);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        picker.setAdapter(adapter);
        int previous = -1;
        try { previous = Integer.parseInt(answers.optString(key)); }
        catch (NumberFormatException ignored) {}
        picker.setSelection(Math.max(0, Math.min(3, previous + 1)));
        workbookView.addView(picker, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(52)));
        picker.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener() {
            @Override public void onNothingSelected(android.widget.AdapterView<?> parent) {}
            @Override public void onItemSelected(android.widget.AdapterView<?> parent, View view,
                                                  int position, long id) {
                String value = position == 0 ? "" : String.valueOf(position - 1);
                if (!value.equals(answers.optString(key))) saveAnswer(key, value);
            }
        });
    }

    private void addSelectors(int index) {
        String[] chapters = new String[10];
        String[] strategies = new String[10];
        for (int item = 0; item < 10; item++) {
            JSONObject sheet = workbookData.optJSONArray("sheets").optJSONObject(item);
            chapters[item] = "Bab " + (item + 1) + " · " +
                    (sheet == null ? "" : sheet.optString("title"));
            JSONObject exercise = workbookData.optJSONArray("exercises")
                    .optJSONObject(index * 10 + item);
            strategies[item] = (index + 1) + "." + (item + 1) + " · " +
                    (exercise == null ? "" : exercise.optString("title"));
        }
        addSection("Pilih bab", "Buku utama dan modul jalur selalu memakai nomor bab dan strategi yang sama.");
        Spinner chapter = new Spinner(this);
        ArrayAdapter<String> chapterAdapter = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_item, chapters);
        chapterAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        chapter.setAdapter(chapterAdapter);
        chapter.setSelection(index);
        workbookView.addView(chapter, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(52)));
        chapter.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener() {
            @Override public void onNothingSelected(android.widget.AdapterView<?> parent) {}
            @Override public void onItemSelected(android.widget.AdapterView<?> parent, View view,
                                                  int position, long id) {
                if (position != chapterIndex) {
                    chapterIndex = position;
                    strategyIndex = 0;
                    guideStep = 0;
                    showWorksheet(position);
                }
            }
        });
        if (guideStep < 4) {
            Spinner strategy = new Spinner(this);
            ArrayAdapter<String> strategyAdapter = new ArrayAdapter<>(this,
                    android.R.layout.simple_spinner_item, strategies);
            strategyAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
            strategy.setAdapter(strategyAdapter);
            strategy.setSelection(strategyIndex);
            workbookView.addView(strategy, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, dp(52)));
            strategy.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener() {
                @Override public void onNothingSelected(android.widget.AdapterView<?> parent) {}
                @Override public void onItemSelected(android.widget.AdapterView<?> parent, View view,
                                                      int position, long id) {
                    if (position != strategyIndex) {
                        strategyIndex = position;
                        guideStep = 0;
                        showWorksheet(chapterIndex);
                    }
                }
            });
        } else {
            Button strategiesButton = button("Kembali ke strategi bab ini", false);
            strategiesButton.setOnClickListener(view -> {
                guideStep = 0;
                showWorksheet(chapterIndex);
            });
            workbookView.addView(strategiesButton, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, dp(48)));
        }
    }

    private void addChapterFields(JSONObject sheet, char first, char last) {
        JSONObject fields = sheet.optJSONObject("fields");
        for (char letter = first; letter <= last; letter++) {
            final String field = (chapterIndex + 1) + "-" + letter;
            addSection(letter + ". Isian bab", fields.optString(String.valueOf(letter)));
            addAnswer(field, "Tulis hasil Anda");
        }
    }

    private void addSection(String heading, String content) {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(16), dp(11), dp(16), dp(12));
        panel.setBackground(panelBackground(heading.startsWith("Mulai") ||
                heading.startsWith("Hasil bab") || heading.startsWith("Strategi ")));
        LinearLayout.LayoutParams panelParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        panelParams.setMargins(0, dp(12), 0, dp(4));
        TextView title = new TextView(this);
        title.setText(heading);
        title.setTextSize(17);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        title.setTextColor(darkMode ? Color.WHITE : Color.rgb(31, 41, 55));
        title.setPadding(0, 0, 0, content.isEmpty() ? 0 : dp(6));
        panel.addView(title);
        if (!content.isEmpty()) {
            TextView text = new TextView(this);
            text.setText(content);
            text.setTextSize(15);
            text.setLineSpacing(dp(3), 1);
            text.setTextColor(darkMode ? Color.rgb(226, 231, 240) : Color.rgb(54, 65, 80));
            panel.addView(text);
        }
        workbookView.addView(panel, panelParams);
    }

    private void addAnswer(String field, String hint) {
        if (answers.has(field) && !answers.optString(field).isEmpty() &&
                (field.matches("[0-9]+-(reflection|exercise|check-[0-9]+)") ||
                        field.matches("[0-9]+-[A-H]")) &&
                !answers.optBoolean("reviewed-v2:" + field)) {
            TextView old = new TextView(this);
            old.setText("Jawaban lama tersimpan. Tinjau agar sesuai materi revisi.");
            old.setTextSize(13);
            old.setTextColor(Color.rgb(126, 75, 28));
            old.setPadding(dp(4), dp(8), dp(4), dp(4));
            workbookView.addView(old);
        }
        EditText answer = new EditText(this);
        answer.setTextSize(15);
        answer.setMinLines(3);
        answer.setMaxLines(8);
        answer.setGravity(Gravity.TOP);
        answer.setSingleLine(false);
        answer.setTextColor(darkMode ? Color.WHITE : Color.rgb(31, 41, 55));
        answer.setHintTextColor(darkMode ? Color.rgb(166, 180, 200) : Color.rgb(103, 116, 135));
        answer.setPadding(dp(14), dp(12), dp(14), dp(12));
        answer.setBackground(panelBackground(false));
        answer.setFilters(new InputFilter[]{new InputFilter.LengthFilter(1500)});
        answer.setText(answers.optString(field));
        answer.setHint(hint);
        answer.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {
                saveAnswer(field, s.toString());
                if (field.matches("[0-9]+-(reflection|exercise|check-[0-9]+)") ||
                        field.matches("[0-9]+-[A-H]")) {
                    saveAnswer("reviewed-v2:" + field, "true");
                }
            }
            @Override public void afterTextChanged(Editable s) {}
        });
        LinearLayout.LayoutParams answerParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        answerParams.setMargins(0, dp(6), 0, dp(6));
        workbookView.addView(answer, answerParams);
    }

    private void addShortAnswer(String field, String hint) {
        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setTextSize(15);
        input.setTextColor(darkMode ? Color.WHITE : Color.rgb(31, 41, 55));
        input.setHintTextColor(darkMode ? Color.rgb(166, 180, 200) : Color.rgb(103, 116, 135));
        input.setFilters(new InputFilter[]{new InputFilter.LengthFilter(90)});
        input.setPadding(dp(14), dp(10), dp(14), dp(10));
        input.setBackground(panelBackground(false));
        input.setHint(hint);
        input.setText(answers.optString(field));
        input.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {
                saveAnswer(field, s.toString());
            }
            @Override public void afterTextChanged(Editable s) {}
        });
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(50));
        params.setMargins(0, dp(6), 0, dp(8));
        workbookView.addView(input, params);
    }

    private void navigate(int direction) {
        if (readingMode) showReadingPage(readingPage + direction);
        else {
            if (guideStep == 7) { showProfile(); return; }
            if (guideStep == 8) {
                if (direction > 0 && diagnosisIndex >= 9) showProfile();
                else { diagnosisIndex = Math.max(0, diagnosisIndex + direction); showDiagnosis(); }
                return;
            }
            if (guideStep >= 9) {
                if (direction > 0 && guideStep == 11) showJourney();
                else if (direction < 0 && guideStep == 9) { guideStep = 6; showWorksheet(chapterIndex); }
                else showChapterSheet(guideStep + direction);
                return;
            }
            if (guideStep == -1) {
                if (direction > 0) { guideStep = resumeStep; showWorksheet(chapterIndex); }
                return;
            }
            if (direction > 0) {
                if (guideStep == 6 && strategyIndex < 9) {
                    strategyIndex++;
                    guideStep = 0;
                } else if (guideStep == 6) {
                    if (chapterIndex >= 9) { showJourney(); return; }
                    chapterIndex++;
                    strategyIndex = 0;
                    guideStep = 0;
                } else guideStep++;
            } else {
                if (guideStep == 0) {
                    if (strategyIndex > 0) {
                        strategyIndex--;
                        guideStep = 6;
                    } else { showJourney(); return; }
                } else guideStep--;
            }
            showWorksheet(chapterIndex);
        }
    }

    private void showReadingPage(int index) {
        if (workbookData == null) return;
        JSONArray pages = workbookData.optJSONArray("pages");
        if (pages == null || index < 0 || index >= pages.length()) return;
        readingMode = true;
        sectionProgress.setVisibility(View.GONE);
        readingPage = index;
        workbookView.removeAllViews();
        readingButton.setText("Kembali ke panduan");
        readingButton.setVisibility(View.VISIBLE);
        JSONArray starts = workbookData.optJSONArray("chapterPages");
        int section = 0;
        for (int part = 0; part < starts.length(); part++) {
            if (starts.optInt(part) <= index) section = part;
        }
        final int selectedChapter = section;
        addSection(moduleTitle + " · Bab " + (section + 1),
                "Materi lengkap tersedia sebagai teks di aplikasi. Pilih bab di bawah atau gunakan tombol Lanjut untuk membaca halaman berikutnya.");
        String[] chapters = new String[10];
        JSONArray sheets = workbookData.optJSONArray("sheets");
        for (int part = 0; part < chapters.length; part++) {
            chapters[part] = "Bab " + (part + 1) + " · " +
                    sheets.optJSONObject(part).optString("title");
        }
        Spinner chapter = new Spinner(this);
        ArrayAdapter<String> adapter = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_item, chapters);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        chapter.setAdapter(adapter);
        chapter.setSelection(selectedChapter);
        workbookView.addView(chapter, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(52)));
        chapter.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener() {
            @Override public void onNothingSelected(android.widget.AdapterView<?> parent) {}
            @Override public void onItemSelected(android.widget.AdapterView<?> parent, View view,
                                                  int position, long id) {
                if (position != selectedChapter) {
                    chapterIndex = position;
                    strategyIndex = 0;
                    guideStep = 0;
                    showReadingPage(starts.optInt(position));
                }
            }
        });

        String content = pages.optString(index).trim();
        if (content.isEmpty()) {
            content = "Lanjutkan ke halaman berikutnya atau buka panduan bab untuk mengerjakan latihan.";
        }
        TextView page = new TextView(this);
        page.setText(content);
        page.setTextSize(15);
        page.setTextColor(darkMode ? Color.WHITE : Color.rgb(54, 65, 80));
        page.setTextIsSelectable(true);
        page.setLineSpacing(dp(3), 1);
        page.setPadding(dp(16), dp(16), dp(16), dp(18));
        page.setBackground(panelBackground(false));
        LinearLayout.LayoutParams contentParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        contentParams.setMargins(0, dp(12), 0, dp(10));
        workbookView.addView(page, contentParams);

        statusView.setText("Materi jalur · gunakan panduan untuk mengisi latihan dan menyimpan jawaban.");
        previousButton.setText("Kembali");
        nextButton.setText("Lanjut");
        pageView.setText((index + 1) + " / " + pages.length());
        previousButton.setEnabled(index > 0);
        nextButton.setEnabled(index + 1 < pages.length());
        scrollView.scrollTo(0, 0);
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

    @Override
    public void onBackPressed() {
        if (readingMode) showWorkbook();
        else if (!"home".equals(currentTab)) showDashboard();
        else super.onBackPressed();
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
        destroyed = true;
        executor.shutdown();
        super.onDestroy();
    }
}
