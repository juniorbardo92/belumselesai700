package id.umkmnaikkelas.panglima;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import java.util.Calendar;

/** Independent, optional reminder for each specialist workbook. */
public final class ModuleReminderReceiver extends BroadcastReceiver {
    private static final String ACTION = "id.umkmnaikkelas.panglima.MODULE_REMINDER.";
    private static final String CHANNEL = "panglima_module_learning";
    private static final String[] CODES = {"insurance", "property", "mlm"};

    static boolean isEnabled(Context context, String code) {
        return context.getSharedPreferences("panglima_module_settings", Context.MODE_PRIVATE)
                .getBoolean("reminder:" + code, false);
    }

    static void setEnabled(Context context, String code, boolean enabled) {
        if (indexFor(code) < 0) return;
        context.getSharedPreferences("panglima_module_settings", Context.MODE_PRIVATE)
                .edit().putBoolean("reminder:" + code, enabled).apply();
        if (enabled) schedule(context, code);
        else cancel(context, code);
    }

    @Override public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            for (String code : CODES) if (isEnabled(context, code)) schedule(context, code);
            return;
        }
        String action = intent.getAction();
        if (action != null && action.startsWith(ACTION)) {
            String code = action.substring(ACTION.length());
            if (isEnabled(context, code)) notifyLearning(context, code);
        }
    }

    private static int indexFor(String code) {
        for (int i = 0; i < CODES.length; i++) if (CODES[i].equals(code)) return i;
        return -1;
    }

    private static PendingIntent pending(Context context, String code) {
        Intent intent = new Intent(context, ModuleReminderReceiver.class).setAction(ACTION + code);
        return PendingIntent.getBroadcast(context, 3200 + indexFor(code), intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void schedule(Context context, String code) {
        AlarmManager alarm = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarm == null) return;
        Calendar next = Calendar.getInstance();
        next.set(Calendar.HOUR_OF_DAY, 9);
        next.set(Calendar.MINUTE, 0);
        next.set(Calendar.SECOND, 0);
        next.set(Calendar.MILLISECOND, 0);
        if (next.getTimeInMillis() <= System.currentTimeMillis()) next.add(Calendar.DAY_OF_YEAR, 1);
        alarm.setInexactRepeating(AlarmManager.RTC_WAKEUP, next.getTimeInMillis(),
                AlarmManager.INTERVAL_DAY, pending(context, code));
    }

    private static void cancel(Context context, String code) {
        AlarmManager alarm = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarm != null) alarm.cancel(pending(context, code));
    }

    private static void notifyLearning(Context context, String code) {
        if (Build.VERSION.SDK_INT >= 33 &&
                context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager manager = (NotificationManager)
                context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL,
                    "Pengingat belajar modul", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("Pengingat opsional untuk latihan workbook jalur spesialis.");
            manager.createNotificationChannel(channel);
        }
        String name = "insurance".equals(code) ? "Asuransi" :
                "property".equals(code) ? "Properti" : "MLM / Direct Selling";
        PendingIntent launch = PendingIntent.getActivity(context, 0,
                new Intent(context, MainActivity.class),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder notification = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(context, CHANNEL) : new Notification.Builder(context);
        manager.notify(3300 + indexFor(code), notification
                .setSmallIcon(R.drawable.ic_panglima)
                .setContentTitle("10 menit untuk modul " + name)
                .setContentText("Coba satu latihan, tulis buktinya, lalu tinjau kembali.")
                .setContentIntent(launch).setAutoCancel(true).build());
    }
}
