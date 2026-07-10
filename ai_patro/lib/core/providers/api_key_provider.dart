import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/services/ai_service.dart';

/// Exposes the current Groq API key so widgets rebuild when it changes
/// (e.g. after the user saves one in the settings screen).
class ApiKeyNotifier extends Notifier<String> {
  @override
  String build() => AiService.savedKey;

  Future<void> save(String key) async {
    await AiService.setKey(key);
    state = AiService.savedKey;
  }

  bool get isConfigured => AiService.isConfigured;
}

final apiKeyProvider =
    NotifierProvider<ApiKeyNotifier, String>(ApiKeyNotifier.new);
