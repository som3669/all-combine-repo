import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';
import '../../core/providers/api_key_provider.dart';
import '../../core/providers/language_provider.dart';
import '../../core/theme/app_theme.dart';
import '../../data/services/ai_service.dart';
import '../settings/settings_screen.dart';

/// Generate a shareable festival greeting with AI.
class GreetingsScreen extends ConsumerStatefulWidget {
  const GreetingsScreen({super.key});

  @override
  ConsumerState<GreetingsScreen> createState() => _GreetingsScreenState();
}

class _GreetingsScreenState extends ConsumerState<GreetingsScreen> {
  final _occasionController = TextEditingController();
  String _tone = 'Warm';
  bool _loading = false;
  String? _result;

  static const _occasionsEn = [
    'Dashain', 'Tihar', 'Bhai Tika', 'Holi', 'New Year (Nawa Barsha)',
    'Teej', 'Chhath', 'Losar', 'Maghe Sankranti',
  ];
  static const _tonesEn = ['Warm', 'Formal', 'Funny', 'Poetic', 'Short'];
  static const _tonesNe = {
    'Warm': 'न्यानो',
    'Formal': 'औपचारिक',
    'Funny': 'रमाइलो',
    'Poetic': 'काव्यात्मक',
    'Short': 'छोटो',
  };

  @override
  void dispose() {
    _occasionController.dispose();
    super.dispose();
  }

  Future<void> _generate(bool isEn) async {
    final occasion = _occasionController.text.trim();
    if (occasion.isEmpty) return;
    setState(() {
      _loading = true;
      _result = null;
    });
    final system = isEn
        ? 'You write short, heartfelt festival greeting messages people can share '
            'with family and friends. Tone: $_tone. Keep it 2-4 lines, include a '
            'tasteful emoji or two. Respond in English.'
        : 'तपाईं साथी र परिवारसँग सेयर गर्न मिल्ने छोटो, हार्दिक चाडको शुभकामना सन्देश '
            'लेख्नुहुन्छ। शैली: ${_tonesNe[_tone]}। २-४ हरफमा, उपयुक्त इमोजीसहित लेख्नुहोस्। '
            'जवाफ नेपालीमा दिनुहोस्।';
    final res = await AiService.complete(
        system, isEn ? 'Occasion: $occasion' : 'अवसर: $occasion',
        maxTokens: 200, temperature: 0.9);
    if (!mounted) return;
    setState(() {
      _loading = false;
      _result = res ??
          '${isEn ? "Could not generate greeting." : "शुभकामना तयार भएन।"} '
              '(${AiService.lastError ?? ''})';
    });
  }

  @override
  Widget build(BuildContext context) {
    final isEn = ref.watch(languageProvider) == AppLanguage.english;
    ref.watch(apiKeyProvider);

    return Scaffold(
      appBar: AppBar(title: Text(isEn ? 'Festival Greetings' : 'शुभकामना')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: _occasionController,
            decoration: InputDecoration(
              labelText: isEn ? 'Occasion / festival' : 'अवसर / चाड',
              border: const OutlineInputBorder(),
              hintText: isEn ? 'e.g. Dashain' : 'जस्तै: दशैं',
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            children: _occasionsEn
                .map((o) => ActionChip(
                      label: Text(o, style: const TextStyle(fontSize: 12)),
                      onPressed: () => setState(() => _occasionController.text = o),
                    ))
                .toList(),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _tone,
            decoration: InputDecoration(
              labelText: isEn ? 'Tone' : 'शैली',
              border: const OutlineInputBorder(),
            ),
            items: _tonesEn
                .map((t) => DropdownMenuItem(
                    value: t, child: Text(isEn ? t : (_tonesNe[t] ?? t))))
                .toList(),
            onChanged: (v) => setState(() => _tone = v!),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primary,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 13),
              ),
              onPressed: _loading ? null : () => _generate(isEn),
              icon: _loading
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.auto_awesome),
              label: Text(isEn ? 'Generate' : 'बनाउनुहोस्'),
            ),
          ),
          if (!AiService.isConfigured)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: TextButton.icon(
                onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                      builder: (_) => const SettingsScreen(scrollToApi: true)),
                ),
                icon: const Icon(Icons.key, size: 16),
                label: Text(isEn ? 'AI needs a key — add one' : 'एआई key थप्नुहोस्'),
              ),
            ),
          if (_result != null) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppTheme.primary.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(12),
              ),
              child: SelectableText(_result!,
                  style: const TextStyle(fontSize: 16, height: 1.6)),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () {
                      Clipboard.setData(ClipboardData(text: _result!));
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                        content: Text(isEn ? 'Copied' : 'कपी भयो'),
                        duration: const Duration(seconds: 1),
                      ));
                    },
                    icon: const Icon(Icons.copy, size: 18),
                    label: Text(isEn ? 'Copy' : 'कपी'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.primary,
                      foregroundColor: Colors.white,
                    ),
                    onPressed: () => Share.share(_result!),
                    icon: const Icon(Icons.share, size: 18),
                    label: Text(isEn ? 'Share' : 'सेयर'),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
