import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

// Edit content at: https://gist.github.com/som3669/383f98bd75548ea37d301f442e6e533b
const _remoteUrl =
    'https://gist.githubusercontent.com/som3669/383f98bd75548ea37d301f442e6e533b/raw/holidays.json';
const _cacheKey = 'remote_config_json';
const _cacheTimeKey = 'remote_config_fetched_at';
const _cacheTtlHours = 6;

class RemoteConfig {
  final Map<String, dynamic> holidays;
  final String? noticeNe;
  final String? noticeEn;

  const RemoteConfig({
    required this.holidays,
    this.noticeNe,
    this.noticeEn,
  });

  factory RemoteConfig.fromJson(Map<String, dynamic> json) {
    final notice = json['notice'];
    return RemoteConfig(
      holidays: (json['holidays'] as Map<String, dynamic>?) ?? {},
      noticeNe: notice is Map ? notice['ne'] as String? : null,
      noticeEn: notice is Map ? notice['en'] as String? : null,
    );
  }

  factory RemoteConfig.empty() => const RemoteConfig(holidays: {});
}

class RemoteConfigService {
  static Future<RemoteConfig> fetch() async {
    final prefs = await SharedPreferences.getInstance();

    final lastFetch = prefs.getInt(_cacheTimeKey) ?? 0;
    final age = DateTime.now().millisecondsSinceEpoch - lastFetch;
    if (age < _cacheTtlHours * 3600 * 1000) {
      final cached = prefs.getString(_cacheKey);
      if (cached != null) {
        return RemoteConfig.fromJson(
            jsonDecode(cached) as Map<String, dynamic>);
      }
    }

    try {
      final response = await http
          .get(Uri.parse(_remoteUrl))
          .timeout(const Duration(seconds: 8));
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        await prefs.setString(_cacheKey, response.body);
        await prefs.setInt(
            _cacheTimeKey, DateTime.now().millisecondsSinceEpoch);
        return RemoteConfig.fromJson(data);
      }
    } catch (_) {
      final cached = prefs.getString(_cacheKey);
      if (cached != null) {
        return RemoteConfig.fromJson(
            jsonDecode(cached) as Map<String, dynamic>);
      }
    }
    return RemoteConfig.empty();
  }

  static Future<void> clearCache() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_cacheKey);
    await prefs.remove(_cacheTimeKey);
  }
}
