import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nepali_utils/nepali_utils.dart';
import 'package:speech_to_text/speech_to_text.dart';
import '../../core/constants/app_strings.dart';
import '../../core/providers/api_key_provider.dart';
import '../../core/providers/language_provider.dart';
import '../../core/theme/app_theme.dart';
import '../../data/services/ai_service.dart';
import '../../data/services/tts_service.dart';
import '../calendar/calendar_provider.dart';
import '../settings/settings_screen.dart';
import 'assistant_provider.dart';

class AssistantScreen extends ConsumerStatefulWidget {
  const AssistantScreen({super.key});

  @override
  ConsumerState<AssistantScreen> createState() => _AssistantScreenState();
}

class _AssistantScreenState extends ConsumerState<AssistantScreen> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  final SpeechToText _speech = SpeechToText();
  bool _listening = false;

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    _speech.stop();
    super.dispose();
  }

  Future<void> _toggleMic(bool isEn) async {
    if (_listening) {
      await _speech.stop();
      setState(() => _listening = false);
      return;
    }
    final available = await _speech.initialize(
      onStatus: (s) {
        if (s == 'done' || s == 'notListening') {
          if (mounted) setState(() => _listening = false);
        }
      },
      onError: (_) {
        if (mounted) setState(() => _listening = false);
      },
    );
    if (!available) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(isEn
              ? 'Speech recognition unavailable on this device.'
              : 'यस यन्त्रमा भ्वाइस उपलब्ध छैन।'),
        ));
      }
      return;
    }
    setState(() => _listening = true);
    await _speech.listen(
      listenOptions: SpeechListenOptions(localeId: isEn ? 'en_US' : 'ne_NP'),
      onResult: (r) {
        _controller.text = r.recognizedWords;
        _controller.selection = TextSelection.fromPosition(
            TextPosition(offset: _controller.text.length));
      },
    );
  }

  /// Builds a system prompt grounded in today's date and the real festival list,
  /// so the model answers date/festival questions from facts, not guesses.
  String _systemPrompt(bool isEn) {
    final today = NepaliDateTime.now();
    final ad = today.toDateTime();
    final repo = ref.read(holidayRepoProvider);

    // Give the model the upcoming festivals (from today onward) as ground truth.
    final all = repo.allHolidaysSorted();
    final upcoming = all.where((h) {
      final b = h.bsDate;
      if (b.year != today.year) return b.year > today.year;
      if (b.month != today.month) return b.month > today.month;
      return b.day >= today.day;
    }).take(20);

    final lines = upcoming.map((h) {
      final b = h.bsDate;
      final a = b.toDateTime();
      return '- ${h.holiday.nameEn} / ${h.holiday.name}: '
          '${AppStrings.englishMonths[b.month - 1]} ${b.day}, ${b.year} BS '
          '(${a.year}-${a.month.toString().padLeft(2, '0')}-${a.day.toString().padLeft(2, '0')} AD)';
    }).join('\n');

    final todayLine =
        "Today is ${AppStrings.englishMonths[today.month - 1]} ${today.day}, ${today.year} BS "
        "(${ad.year}-${ad.month.toString().padLeft(2, '0')}-${ad.day.toString().padLeft(2, '0')} AD).";

    final langRule = isEn
        ? 'Respond in English.'
        : 'जवाफ नेपालीमा दिनुहोस्।';

    return '''You are AI Patro's helpful assistant for the Nepali Bikram Sambat calendar.
You answer questions about Nepali festivals, rituals, customs, and dates.

$todayLine

Known upcoming festivals/holidays (use these EXACT dates; do NOT invent or change dates):
$lines

Rules:
- For any festival date, use ONLY the list above. If a date is not listed, say you don't have that exact date rather than guessing.
- For "how to celebrate" / ritual questions, explain the customs clearly and respectfully.
- Be concise and friendly. $langRule''';
  }

  void _send(String text, bool isEn) {
    final trimmed = text.trim();
    if (trimmed.isEmpty) return;
    _controller.clear();
    final errorMsg = isEn
        ? "Sorry, I couldn't respond right now. Please try again."
        : 'माफ गर्नुहोस्, अहिले जवाफ दिन सकिनँ। फेरि प्रयास गर्नुहोस्।';
    ref
        .read(assistantProvider.notifier)
        .send(trimmed, _systemPrompt(isEn), errorMsg);
    _scrollToBottomSoon();
  }

  void _scrollToBottomSoon() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent + 120,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final isEn = ref.watch(languageProvider) == AppLanguage.english;
    final state = ref.watch(assistantProvider);
    // Rebuild when the API key changes so the banner hides once configured.
    ref.watch(apiKeyProvider);

    // Auto-scroll when a new message arrives.
    ref.listen(assistantProvider, (_, _) => _scrollToBottomSoon());

    final suggestions = isEn
        ? const [
            'When is Dashain?',
            'How is Bhai Tika celebrated?',
            'What festivals are this month?',
          ]
        : const [
            'दशैं कहिले हो?',
            'भाइटीका कसरी मनाइन्छ?',
            'यो महिना कुन चाडपर्व छन्?',
          ];

    return Scaffold(
      appBar: AppBar(
        title: Text(isEn ? 'AI Assistant' : 'एआई सहायक'),
        actions: [
          if (state.messages.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.refresh),
              tooltip: isEn ? 'Clear' : 'खाली गर्नुहोस्',
              onPressed: () => ref.read(assistantProvider.notifier).clear(),
            ),
        ],
      ),
      body: Column(
        children: [
          if (!AiService.isConfigured)
            InkWell(
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(
                    builder: (_) => const SettingsScreen(scrollToApi: true)),
              ),
              child: Container(
                width: double.infinity,
                color: Colors.orange.withValues(alpha: 0.12),
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                child: Row(
                  children: [
                    const Icon(Icons.error_outline,
                        size: 16, color: Colors.orange),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        isEn
                            ? 'AI is not configured. Tap to add a Groq API key.'
                            : 'एआई कन्फिगर गरिएको छैन। Groq API key थप्न ट्याप गर्नुहोस्।',
                        style: const TextStyle(fontSize: 12.5),
                      ),
                    ),
                    const Icon(Icons.chevron_right, size: 18),
                  ],
                ),
              ),
            ),
          Expanded(
            child: state.messages.isEmpty
                ? _EmptyState(
                    isEn: isEn,
                    suggestions: suggestions,
                    onTap: (s) => _send(s, isEn),
                  )
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.all(12),
                    itemCount: state.messages.length + (state.loading ? 1 : 0),
                    itemBuilder: (context, i) {
                      if (i >= state.messages.length) {
                        return const _TypingBubble();
                      }
                      final m = state.messages[i];
                      return _Bubble(message: m, isEn: isEn);
                    },
                  ),
          ),
          _InputBar(
            controller: _controller,
            isEn: isEn,
            enabled: !state.loading,
            listening: _listening,
            onMic: () => _toggleMic(isEn),
            onSend: () => _send(_controller.text, isEn),
          ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final bool isEn;
  final List<String> suggestions;
  final ValueChanged<String> onTap;
  const _EmptyState({
    required this.isEn,
    required this.suggestions,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.auto_awesome,
                size: 48, color: AppTheme.primary),
            const SizedBox(height: 12),
            Text(
              isEn
                  ? 'Ask about festivals, rituals & dates'
                  : 'चाडपर्व, विधि र मितिबारे सोध्नुहोस्',
              style: const TextStyle(
                  fontSize: 16, fontWeight: FontWeight.bold),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            Wrap(
              alignment: WrapAlignment.center,
              spacing: 8,
              runSpacing: 8,
              children: suggestions
                  .map((s) => ActionChip(
                        label: Text(s, style: const TextStyle(fontSize: 13)),
                        onPressed: () => onTap(s),
                      ))
                  .toList(),
            ),
          ],
        ),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  final ChatMessage message;
  final bool isEn;
  const _Bubble({required this.message, required this.isEn});

  @override
  Widget build(BuildContext context) {
    final isUser = message.isUser;
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: GestureDetector(
        onLongPress: isUser
            ? null
            : () => TtsService.speak(message.text, isEn: isEn),
        child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.8,
        ),
        decoration: BoxDecoration(
          color: isUser
              ? AppTheme.primary
              : Colors.grey.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Text(
          message.text,
          style: TextStyle(
            color: isUser ? Colors.white : AppTheme.bodyText(context),
            fontSize: 14.5,
            height: 1.45,
          ),
        ),
      ),
      ),
    );
  }
}

class _TypingBubble extends StatelessWidget {
  const _TypingBubble();

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: Colors.grey.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(14),
        ),
        child: const SizedBox(
          width: 18,
          height: 18,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      ),
    );
  }
}

class _InputBar extends StatelessWidget {
  final TextEditingController controller;
  final bool isEn;
  final bool enabled;
  final bool listening;
  final VoidCallback onMic;
  final VoidCallback onSend;
  const _InputBar({
    required this.controller,
    required this.isEn,
    required this.enabled,
    required this.listening,
    required this.onMic,
    required this.onSend,
  });

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
        decoration: BoxDecoration(
          color: Theme.of(context).scaffoldBackgroundColor,
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.06),
              blurRadius: 6,
              offset: const Offset(0, -1),
            ),
          ],
        ),
        child: Row(
          children: [
            Expanded(
              child: TextField(
                controller: controller,
                enabled: enabled,
                minLines: 1,
                maxLines: 4,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => onSend(),
                decoration: InputDecoration(
                  hintText: isEn ? 'Type your question…' : 'प्रश्न लेख्नुहोस्…',
                  filled: true,
                  fillColor: Colors.grey.withValues(alpha: 0.1),
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ),
            IconButton(
              icon: Icon(
                listening ? Icons.mic : Icons.mic_none,
                color: listening ? Colors.red : AppTheme.primary,
              ),
              tooltip: isEn ? 'Voice input' : 'भ्वाइस इनपुट',
              onPressed: enabled ? onMic : null,
            ),
            IconButton(
              icon: const Icon(Icons.send, color: AppTheme.primary),
              onPressed: enabled ? onSend : null,
            ),
          ],
        ),
      ),
    );
  }
}
