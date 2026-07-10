import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/providers/api_key_provider.dart';
import '../../core/providers/language_provider.dart';
import '../../core/theme/app_theme.dart';
import '../../data/services/ai_service.dart';
import '../calendar/calendar_provider.dart';
import '../settings/settings_screen.dart';

/// Pick a festival → AI generates the puja vidhi (steps) and a samagri
/// (materials) checklist. Grounded on the app's real festival list.
class RitualGuideScreen extends ConsumerStatefulWidget {
  const RitualGuideScreen({super.key});

  @override
  ConsumerState<RitualGuideScreen> createState() => _RitualGuideScreenState();
}

class _RitualGuideScreenState extends ConsumerState<RitualGuideScreen> {
  String? _festivalNe;
  String? _festivalEn;
  bool _loading = false;
  String? _result;

  Future<void> _generate(bool isEn) async {
    if (_festivalEn == null) return;
    setState(() {
      _loading = true;
      _result = null;
    });
    final system = isEn
        ? 'You are a Nepali culture and rituals expert. For the given festival, '
            'provide: (1) a short intro, (2) "Puja Vidhi" as numbered steps, '
            '(3) "Samagri" as a bullet checklist of materials needed. Be practical '
            'and respectful. Use clear headings. Respond in English.'
        : 'तपाईं नेपाली संस्कृति र पूजाविधि विशेषज्ञ हुनुहुन्छ। दिइएको चाडको लागि '
            'दिनुहोस्: (१) छोटो परिचय, (२) "पूजा विधि" क्रमbद्ध चरणमा, (३) "सामग्री" '
            'आवश्यक वस्तुहरूको सूची। व्यावहारिक र आदरपूर्ण रूपमा शीर्षकसहित लेख्नुहोस्। '
            'जवाफ नेपालीमा दिनुहोस्।';
    final festival = isEn ? _festivalEn! : _festivalNe!;
    final res = await AiService.complete(
        system, isEn ? 'Festival: $festival' : 'चाड: $festival',
        maxTokens: 700);
    if (!mounted) return;
    setState(() {
      _loading = false;
      _result = res ??
          '${isEn ? "Could not generate the guide." : "गाइड तयार भएन।"} '
              '(${AiService.lastError ?? ''})';
    });
  }

  @override
  Widget build(BuildContext context) {
    final isEn = ref.watch(languageProvider) == AppLanguage.english;
    ref.watch(apiKeyProvider);
    final repo = ref.watch(holidayRepoProvider);
    // Unique festival names (sorted list may repeat across years).
    final seen = <String>{};
    final festivals = <({String ne, String en})>[];
    for (final h in repo.allHolidaysSorted()) {
      if (seen.add(h.holiday.nameEn)) {
        festivals.add((ne: h.holiday.name, en: h.holiday.nameEn));
      }
    }

    return Scaffold(
      appBar: AppBar(title: Text(isEn ? 'Ritual Guide' : 'पूजा विधि')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          DropdownButtonFormField<String>(
            initialValue: _festivalEn,
            isExpanded: true,
            decoration: InputDecoration(
              labelText: isEn ? 'Select festival' : 'चाड छान्नुहोस्',
              border: const OutlineInputBorder(),
            ),
            items: festivals
                .map((f) => DropdownMenuItem(
                      value: f.en,
                      child: Text(isEn ? f.en : f.ne,
                          overflow: TextOverflow.ellipsis),
                    ))
                .toList(),
            onChanged: (v) {
              final f = festivals.firstWhere((e) => e.en == v);
              setState(() {
                _festivalEn = f.en;
                _festivalNe = f.ne;
              });
            },
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
              onPressed: (_festivalEn == null || _loading)
                  ? null
                  : () => _generate(isEn),
              icon: _loading
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.menu_book),
              label: Text(isEn ? 'Get guide' : 'गाइड हेर्नुहोस्'),
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
                  style: const TextStyle(fontSize: 14, height: 1.6)),
            ),
          ],
        ],
      ),
    );
  }
}
