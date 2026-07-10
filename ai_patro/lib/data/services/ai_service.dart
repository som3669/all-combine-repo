import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/constants/api_keys.dart';

/// Thin Groq client (OpenAI-compatible chat completions).
/// Docs: https://console.groq.com/docs/openai
class AiService {
  static const _url = 'https://api.groq.com/openai/v1/chat/completions';
  static const _model = 'llama-3.3-70b-versatile';
  static const _prefsKey = 'groq_api_key';

  /// Key entered by the user at runtime (takes priority over the compile-time
  /// [kGroqApiKey]). Loaded once at startup via [init].
  static String _runtimeKey = '';

  /// The key actually used for requests: runtime override if set, else the
  /// compile-time default.
  static String get effectiveKey =>
      _runtimeKey.isNotEmpty ? _runtimeKey : kGroqApiKey;

  /// False when no usable key is set — callers should show a tappable
  /// "configure your key" prompt instead of a failed request.
  static bool get isConfigured =>
      effectiveKey.isNotEmpty && effectiveKey != 'YOUR_GROQ_API_KEY';

  /// Load any saved runtime key. Call once at app startup.
  static Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    _runtimeKey = prefs.getString(_prefsKey) ?? '';
  }

  /// Save (or clear, if empty) the user's Groq API key.
  static Future<void> setKey(String key) async {
    _runtimeKey = key.trim();
    final prefs = await SharedPreferences.getInstance();
    if (_runtimeKey.isEmpty) {
      await prefs.remove(_prefsKey);
    } else {
      await prefs.setString(_prefsKey, _runtimeKey);
    }
  }

  /// The user-entered key (empty if none), for pre-filling the settings field.
  static String get savedKey => _runtimeKey;

  /// Short description of the most recent failure (null if the last call
  /// succeeded). Lets the UI show *why* a request failed instead of a generic
  /// message: e.g. "No internet", "Invalid API key (401)", "Model not found".
  static String? lastError;

  /// Multi-turn chat. [messages] is a list of {role, content} maps
  /// (role = system | user | assistant). Returns null on failure.
  static Future<String?> chat(
    List<Map<String, String>> messages, {
    int maxTokens = 700,
    double temperature = 0.7,
  }) async {
    if (!isConfigured) {
      lastError = 'No API key set';
      return null;
    }
    try {
      final response = await http
          .post(
            Uri.parse(_url),
            headers: {
              'Authorization': 'Bearer $effectiveKey',
              'Content-Type': 'application/json',
            },
            body: jsonEncode({
              'model': _model,
              'messages': messages,
              'max_tokens': maxTokens,
              'temperature': temperature,
            }),
          )
          .timeout(const Duration(seconds: 20));

      if (response.statusCode == 200) {
        // Decode via bodyBytes so Devanagari (Nepali) survives round-trip.
        final data =
            jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
        final content =
            data['choices']?[0]?['message']?['content'] as String?;
        if (content == null || content.trim().isEmpty) {
          lastError = 'Empty response from server';
          return null;
        }
        lastError = null;
        return content.trim();
      }

      // Non-200: classify the common cases.
      switch (response.statusCode) {
        case 401:
          lastError = 'Invalid API key (401)';
          break;
        case 404:
          lastError = 'Model not found (404) — "$_model" may be unavailable';
          break;
        case 429:
          lastError = 'Rate limit reached (429) — try again shortly';
          break;
        default:
          lastError = 'Server error (${response.statusCode})';
      }
    } on http.ClientException catch (e) {
      lastError = 'Network error: ${e.message}';
    } catch (e) {
      // SocketException etc. — most commonly no internet / DNS failure.
      final s = e.toString();
      lastError = s.contains('SocketException') || s.contains('Failed host lookup')
          ? 'No internet connection'
          : 'Request failed: $s';
    }
    return null;
  }

  /// Single system + user prompt convenience wrapper.
  static Future<String?> complete(
    String system,
    String user, {
    int maxTokens = 700,
    double temperature = 0.7,
  }) {
    return chat(
      [
        {'role': 'system', 'content': system},
        {'role': 'user', 'content': user},
      ],
      maxTokens: maxTokens,
      temperature: temperature,
    );
  }
}
