import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

/// A user-created event on a Bikram Sambat date (e.g. birthday, anniversary).
class PersonalEvent {
  final String id;
  final String title;
  final int bsYear;
  final int bsMonth;
  final int bsDay;

  /// If true, repeats every year on the same BS month/day.
  final bool yearly;

  const PersonalEvent({
    required this.id,
    required this.title,
    required this.bsYear,
    required this.bsMonth,
    required this.bsDay,
    this.yearly = true,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'y': bsYear,
        'm': bsMonth,
        'd': bsDay,
        'yearly': yearly,
      };

  factory PersonalEvent.fromJson(Map<String, dynamic> j) => PersonalEvent(
        id: j['id'] as String,
        title: j['title'] as String,
        bsYear: j['y'] as int,
        bsMonth: j['m'] as int,
        bsDay: j['d'] as int,
        yearly: j['yearly'] as bool? ?? true,
      );
}

/// Persists the user's events list to SharedPreferences.
class EventStore {
  static const _key = 'personal_events';

  static Future<List<PersonalEvent>> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null || raw.isEmpty) return [];
    try {
      final list = jsonDecode(raw) as List;
      return list
          .map((e) => PersonalEvent.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (_) {
      return [];
    }
  }

  static Future<void> save(List<PersonalEvent> events) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
        _key, jsonEncode(events.map((e) => e.toJson()).toList()));
  }
}
