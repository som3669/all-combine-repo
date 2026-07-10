import 'package:flutter_tts/flutter_tts.dart';

/// Simple text-to-speech wrapper. Speaks in Nepali or English.
class TtsService {
  static final FlutterTts _tts = FlutterTts();
  static bool _speaking = false;

  static bool get isSpeaking => _speaking;

  static Future<void> speak(String text, {required bool isEn}) async {
    if (text.trim().isEmpty) return;
    await _tts.stop();
    await _tts.setLanguage(isEn ? 'en-US' : 'ne-NP');
    await _tts.setSpeechRate(0.5);
    await _tts.awaitSpeakCompletion(true);
    _speaking = true;
    _tts.setCompletionHandler(() => _speaking = false);
    _tts.setCancelHandler(() => _speaking = false);
    await _tts.speak(text);
  }

  static Future<void> stop() async {
    _speaking = false;
    await _tts.stop();
  }
}
