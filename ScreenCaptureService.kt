package com.ollie.chessghost

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat

class ScreenCaptureService : Service() {

    private var mediaProjection: MediaProjection? = null
    private val CHANNEL_ID = "ScreenCaptureChannel"

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val resultCode = intent?.getIntExtra("resultCode", 0) ?: 0
        val data = intent?.getParcelableExtra<Intent>("data")

        if (data != null) {
            val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            mediaProjection = mpm.getMediaProjection(resultCode, data)
            
            // In a real full implementation, you would create a VirtualDisplay here
            // and feed the ImageReader into a WebSocket or local HTTP server
            // so the WebView can fetch the frames.
            // For this bridge, we just start the foreground service to keep permission alive.
        }

        createNotificationChannel()
        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("ChessGhost Active")
            .setContentText("Analyzing screen...")
            .setSmallIcon(android.R.drawable.ic_menu_view)
            .build()

        startForeground(1, notification)
        return START_STICKY
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val serviceChannel = NotificationChannel(
                CHANNEL_ID,
                "Screen Capture Service",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(serviceChannel)
        }
    }

    override fun onDestroy() {
        mediaProjection?.stop()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}