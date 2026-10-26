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
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import java.util.Calendar;

public final class ActionPlanReminderReceiver extends BroadcastReceiver {
    private static final String ACTION_REMINDER =
            "id.umkmnaikkelas.panglima.ACTION_PLAN_REMINDER";
    private static final String CHANNEL_ID = "panglima_action_plan";
    private static final String PREFERENCES = "panglima_reminder";
    private static final String ENABLED_KEY = "action_plan_enabled";
    private static final int ALARM_REQUEST_CODE = 2101;
    private static final int NOTIFICATION_ID = 2102;
    private static final int REMINDER_HOUR = 9;

    static void setEnabled(Context context, boolean enabled) {
        preferences(context).edit().putBoolean(ENABLED_KEY, enabled).apply();
        if (enabled) {
            createChannel(context);
            schedule(context);
        } else {
            cancel(context);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? "" : intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)) {
            if (preferences(context).getBoolean(ENABLED_KEY, true)) {
                createChannel(context);
                schedule(context);
            }
            return;
        }

        if (ACTION_REMINDER.equals(action)
                && preferences(context).getBoolean(ENABLED_KEY, true)) {
            showNotification(context);
        }
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    private static void schedule(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        Calendar next = Calendar.getInstance();
        next.set(Calendar.HOUR_OF_DAY, REMINDER_HOUR);
        next.set(Calendar.MINUTE, 0);
        next.set(Calendar.SECOND, 0);
        next.set(Calendar.MILLISECOND, 0);
        if (next.getTimeInMillis() <= System.currentTimeMillis()) {
            next.add(Calendar.DAY_OF_YEAR, 1);
        }

        alarmManager.setInexactRepeating(
                AlarmManager.RTC_WAKEUP,
                next.getTimeInMillis(),
                AlarmManager.INTERVAL_DAY,
                reminderIntent(context));
    }

    private static void cancel(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager != null) {
            alarmManager.cancel(reminderIntent(context));
        }
    }

    private static PendingIntent reminderIntent(Context context) {
        Intent intent = new Intent(context, ActionPlanReminderReceiver.class)
                .setAction(ACTION_REMINDER);
        return PendingIntent.getBroadcast(
                context,
                ALARM_REQUEST_CODE,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Pengingat Action Plan",
                NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("Pengingat harian untuk mengerjakan Action Plan Panglima UMKM.");
        manager.createNotificationChannel(channel);
    }

    private static void showNotification(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        Intent launchIntent = new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
                context,
                0,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(context, CHANNEL_ID)
                : new Notification.Builder(context);
        builder.setSmallIcon(R.drawable.ic_panglima)
                .setContentTitle("Pengingat Action Plan")
                .setContentText("Kerjakan satu langkah Action Plan Panglima UMKM hari ini.")
                .setCategory(Notification.CATEGORY_REMINDER)
                .setAutoCancel(true)
                .setContentIntent(contentIntent);

        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, builder.build());
        }
    }
}
