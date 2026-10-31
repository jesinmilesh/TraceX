package com.tracex.investigation

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

class TraceNotificationListener : NotificationListenerService() {

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        super.onNotificationPosted(sbn)

        sbn?.let { notification ->
            val packageName = notification.packageName // e.g., com.whatsapp
            val extras = notification.notification.extras

            val title = extras.getString("android.title")
            val text = extras.getCharSequence("android.text")?.toString()

            Log.d("NotificationListener", "Package: $packageName | Title: $title | Text: $text")

            // You can filter for specific packages like WhatsApp:
            if (packageName == "com.whatsapp") {
                Log.d("NotificationListener", "WhatsApp Message Captured -> Sender: $title, Message: $text")
            }
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        super.onNotificationRemoved(sbn)
        // Triggered when a notification is dismissed or cleared
    }
}