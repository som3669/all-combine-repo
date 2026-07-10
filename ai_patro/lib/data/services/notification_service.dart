import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:timezone/timezone.dart' as tz;
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:nepali_utils/nepali_utils.dart';
import '../../core/constants/app_strings.dart';
import '../repositories/holiday_repository.dart';
import 'panchang_service.dart';
import 'event_store.dart';

/// Local notifications: a rolling daily "today's panchang" reminder and
/// per-event reminders. All content is computed deterministically at schedule
/// time (no network / background isolate needed).
class NotificationService {
  static final _plugin = FlutterLocalNotificationsPlugin();
  static bool _ready = false;

  static const _dailyEnabledKey = 'notif_daily_enabled';
  static const _dailyHourKey = 'notif_daily_hour';
  static const _dailyMinKey = 'notif_daily_min';

  static const _dailyChannel = AndroidNotificationChannel(
    'daily_patro',
    'Daily Patro',
    description: 'Daily tithi & festival reminder',
    importance: Importance.defaultImportance,
  );
  static const _eventChannel = AndroidNotificationChannel(
    'events',
    'Event Reminders',
    description: 'Reminders for your saved events',
    importance: Importance.high,
  );

  static Future<void> init() async {
    if (_ready) return;
    tzdata.initializeTimeZones();
    tz.setLocalLocation(tz.getLocation('Asia/Kathmandu'));

    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const settings = InitializationSettings(android: android);
    await _plugin.initialize(settings);

    final androidImpl = _plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    await androidImpl?.createNotificationChannel(_dailyChannel);
    await androidImpl?.createNotificationChannel(_eventChannel);
    _ready = true;
  }

  /// Ask for runtime notification permission (Android 13+).
  static Future<bool> requestPermission() async {
    await init();
    final androidImpl = _plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    final granted = await androidImpl?.requestNotificationsPermission();
    return granted ?? true;
  }

  // ── Settings ──────────────────────────────────────────────────────────
  static Future<bool> isDailyEnabled() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_dailyEnabledKey) ?? false;
  }

  static Future<(int, int)> dailyTime() async {
    final prefs = await SharedPreferences.getInstance();
    return (prefs.getInt(_dailyHourKey) ?? 7, prefs.getInt(_dailyMinKey) ?? 0);
  }

  static Future<void> setDaily({
    required bool enabled,
    required int hour,
    required int minute,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_dailyEnabledKey, enabled);
    await prefs.setInt(_dailyHourKey, hour);
    await prefs.setInt(_dailyMinKey, minute);
    await rescheduleAll();
  }

  /// Re-schedule the rolling daily window and all event reminders. Safe to call
  /// on every app start.
  static Future<void> rescheduleAll() async {
    await init();
    await _plugin.cancelAll();

    final holidayRepo = HolidayRepository();

    if (await isDailyEnabled()) {
      final (hour, minute) = await dailyTime();
      await _scheduleDailyWindow(holidayRepo, hour, minute);
    }
    await _scheduleEventReminders();
  }

  // Schedule the next 14 days of daily reminders with that day's content.
  static Future<void> _scheduleDailyWindow(
      HolidayRepository repo, int hour, int minute) async {
    final now = tz.TZDateTime.now(tz.local);
    for (var i = 0; i < 14; i++) {
      final day = now.add(Duration(days: i));
      var when = tz.TZDateTime(
          tz.local, day.year, day.month, day.day, hour, minute);
      if (when.isBefore(now)) continue;

      final bs = when.toNepaliDateTime();
      final p = PanchangService.compute(DateTime(day.year, day.month, day.day));
      final holiday = repo.getHoliday(bs);
      final title =
          '${AppStrings.nepaliMonths[bs.month - 1]} ${AppStrings.toNepaliNumeral(bs.day)}, ${AppStrings.toNepaliNumeral(bs.year)}';
      final body = [
        '${p.pakshaNe} ${p.tithiNe}',
        if (holiday != null) '🎉 ${holiday.name}',
        'सूर्योदय ${p.sunrise}',
      ].join(' · ');

      await _plugin.zonedSchedule(
        1000 + i,
        title,
        body,
        when,
        NotificationDetails(
          android: AndroidNotificationDetails(
            _dailyChannel.id,
            _dailyChannel.name,
            channelDescription: _dailyChannel.description,
          ),
        ),
        androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
        uiLocalNotificationDateInterpretation:
            UILocalNotificationDateInterpretation.absoluteTime,
      );
    }
  }

  // Schedule a reminder the morning of each of the next ~365 days' events.
  static Future<void> _scheduleEventReminders() async {
    final events = await EventStore.load();
    if (events.isEmpty) return;
    final now = tz.TZDateTime.now(tz.local);

    var id = 2000;
    for (final e in events) {
      final next = _nextOccurrenceAd(e);
      var when = tz.TZDateTime(tz.local, next.year, next.month, next.day, 8, 0);
      if (when.isBefore(now)) continue;
      if (when.difference(now).inDays > 366) continue;

      await _plugin.zonedSchedule(
        id++,
        '📅 ${e.title}',
        'आज ${e.title}',
        when,
        NotificationDetails(
          android: AndroidNotificationDetails(
            _eventChannel.id,
            _eventChannel.name,
            channelDescription: _eventChannel.description,
            importance: Importance.high,
            priority: Priority.high,
          ),
        ),
        androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
        uiLocalNotificationDateInterpretation:
            UILocalNotificationDateInterpretation.absoluteTime,
      );
    }
  }

  static DateTime _nextOccurrenceAd(PersonalEvent e) {
    if (!e.yearly) return NepaliDateTime(e.bsYear, e.bsMonth, e.bsDay).toDateTime();
    final today = NepaliDateTime.now();
    var candidate = NepaliDateTime(today.year, e.bsMonth, e.bsDay).toDateTime();
    final todayAd = DateTime.now();
    if (candidate.isBefore(DateTime(todayAd.year, todayAd.month, todayAd.day))) {
      candidate = NepaliDateTime(today.year + 1, e.bsMonth, e.bsDay).toDateTime();
    }
    return candidate;
  }
}
