# WorkManager — prevent R8 from breaking database initialization
-keep class androidx.work.** { *; }
-keep class androidx.work.impl.** { *; }
-keepclassmembers class * extends androidx.work.Worker { *; }
-keepclassmembers class * extends androidx.work.ListenableWorker {
    public <init>(android.content.Context, androidx.work.WorkerParameters);
}

# Flutter
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }

# flutter_local_notifications — keep Gson type info so scheduling doesn't crash under R8
-keep class com.dexterous.** { *; }
-keep class com.google.gson.** { *; }
-keepattributes Signature
-keepattributes *Annotation*

# Riverpod / Dart reflection
-keep class com.aipatro.** { *; }

# cunning_document_scanner pulls in Huawei HMS ML Kit
# (com.huawei.hms:ml-computer-vision-documentskew), whose networking layer
# optionally links against Huawei system classes, HiAnalytics, Cronet,
# Conscrypt and BouncyCastle. None of those ship with the app -- HMS resolves
# them at runtime on Huawei devices only -- so R8 must not fail on them.
-dontwarn com.huawei.**
-dontwarn com.android.org.conscrypt.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.chromium.net.**

# Keep line numbers for crash reports
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Flutter Play Core deferred components (not used, suppress R8 warnings)
-dontwarn com.google.android.play.core.splitcompat.SplitCompatApplication
-dontwarn com.google.android.play.core.splitinstall.SplitInstallException
-dontwarn com.google.android.play.core.splitinstall.SplitInstallManager
-dontwarn com.google.android.play.core.splitinstall.SplitInstallManagerFactory
-dontwarn com.google.android.play.core.splitinstall.SplitInstallRequest$Builder
-dontwarn com.google.android.play.core.splitinstall.SplitInstallRequest
-dontwarn com.google.android.play.core.splitinstall.SplitInstallSessionState
-dontwarn com.google.android.play.core.splitinstall.SplitInstallStateUpdatedListener
-dontwarn com.google.android.play.core.tasks.OnFailureListener
-dontwarn com.google.android.play.core.tasks.OnSuccessListener
-dontwarn com.google.android.play.core.tasks.Task
