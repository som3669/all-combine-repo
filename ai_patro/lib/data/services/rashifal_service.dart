import 'package:shared_preferences/shared_preferences.dart';
import '../models/rashi.dart';
import 'ai_service.dart';

/// Generates the daily rashifal (horoscope) for a rashi via Groq and caches it
/// per (date + rashi + language) so each is generated at most once per day.
///
/// Horoscopes are intentionally creative/motivational text — there is no factual
/// "right answer" to hallucinate, which makes this the safest AI feature to ship.
class RashifalService {
  static String _key(DateTime day, int rashi, bool isEn) {
    final ymd = '${day.year}-${day.month}-${day.day}';
    return 'rashifal_${ymd}_${rashi}_${isEn ? 'en' : 'ne'}';
  }

  /// Returns cached text if present; otherwise generates and caches.
  /// Returns null only when the AI key is unconfigured or the request fails.
  static Future<String?> forRashi(Rashi rashi, {required bool isEn}) async {
    final prefs = await SharedPreferences.getInstance();
    final today = DateTime.now();
    final key = _key(today, rashi.index, isEn);

    final cached = prefs.getString(key);
    if (cached != null && cached.isNotEmpty) return cached;

    if (!AiService.isConfigured) return null;

    final name = isEn ? rashi.en : rashi.ne;
    final dateStr =
        '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';

    final system = isEn
        ? 'You write short, warm, uplifting daily horoscopes for a Nepali calendar app. '
            'Keep it positive and general. 3-4 sentences covering mood, work/study, and one small tip. '
            'Do not mention exact events or make predictions that could cause harm. Respond in English only.'
        : 'तपाईं नेपाली पात्रो एपका लागि छोटो, न्यानो र उत्साहजनक दैनिक राशिफल लेख्नुहुन्छ। '
            'सकारात्मक र सामान्य राख्नुहोस्। मन, काम/पढाइ र एउटा सानो सुझाव समेटेर ३-४ वाक्यमा लेख्नुहोस्। '
            'हानिकारक भविष्यवाणी नगर्नुहोस्। जवाफ नेपालीमा मात्र दिनुहोस्।';

    final user = isEn
        ? "Today's date: $dateStr. Write today's horoscope for $name."
        : 'आजको मिति: $dateStr। $name राशिको आजको राशिफल लेख्नुहोस्।';

    final text = await AiService.complete(
      system,
      user,
      maxTokens: 220,
      temperature: 0.85,
    );

    if (text != null && text.isNotEmpty) {
      await prefs.setString(key, text);
    }
    return text;
  }
}
