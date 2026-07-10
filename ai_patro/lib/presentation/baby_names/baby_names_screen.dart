import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nepali_utils/nepali_utils.dart';
import '../../core/providers/api_key_provider.dart';
import '../../core/providers/language_provider.dart';
import '../../core/theme/app_theme.dart';
import '../../data/services/ai_service.dart';
import '../../data/services/panchang_service.dart';
import '../settings/settings_screen.dart';

/// Suggests baby names traditionally associated with a nakshatra.
/// The nakshatra is computed deterministically; the AI only proposes names.
class BabyNamesScreen extends ConsumerStatefulWidget {
  const BabyNamesScreen({super.key});

  @override
  ConsumerState<BabyNamesScreen> createState() => _BabyNamesScreenState();
}

class _BabyNamesScreenState extends ConsumerState<BabyNamesScreen> {
  late int _nakIndex;
  bool _loading = false;
  String? _result;

  @override
  void initState() {
    super.initState();
    // Default to today's nakshatra.
    final today = PanchangService.compute(DateTime.now());
    final all = PanchangService.nakshatras;
    _nakIndex = all.indexWhere((n) => n.en == today.nakshatraEn);
    if (_nakIndex < 0) _nakIndex = 0;
  }

  Future<void> _suggest(bool isEn) async {
    setState(() {
      _loading = true;
      _result = null;
    });
    final nak = PanchangService.nakshatras[_nakIndex];

    final system = isEn
        ? 'You are a Nepali naming (namkaran) expert. Given a nakshatra, suggest '
            'baby names traditionally associated with its syllables. Give 5 names '
            'for boys and 5 for girls, each with a one-line meaning. Use clear '
            'formatting with "Boys:" and "Girls:" headers. Respond in English.'
        : 'तपाईं नेपाली नामकरण विशेषज्ञ हुनुहुन्छ। दिइएको नक्षत्रको अक्षरअनुसार '
            'परम्परागत रूपमा राखिने बच्चाको नाम सुझाउनुहोस्। ५ वटा छोराका र ५ वटा '
            'छोरीका नाम, प्रत्येकको एक वाक्य अर्थसहित दिनुहोस्। "छोरा:" र "छोरी:" '
            'शीर्षक प्रयोग गर्नुहोस्। जवाफ नेपालीमा दिनुहोस्।';
    final user = isEn
        ? 'Nakshatra: ${nak.en}. Suggest names.'
        : 'नक्षत्र: ${nak.ne}। नाम सुझाउनुहोस्।';

    final text = await AiService.complete(system, user, maxTokens: 500);
    if (!mounted) return;
    setState(() {
      _loading = false;
      _result = text ??
          '${isEn ? "Could not generate names." : "नाम तयार गर्न सकिएन।"} '
              '(${AiService.lastError ?? ''})';
    });
  }

  @override
  Widget build(BuildContext context) {
    final isEn = ref.watch(languageProvider) == AppLanguage.english;
    ref.watch(apiKeyProvider);
    final nakshatras = PanchangService.nakshatras;
    final today = NepaliDateTime.now();
    final todayNak = PanchangService.compute(today.toDateTime());

    return Scaffold(
      appBar: AppBar(title: Text(isEn ? 'Baby Names' : 'नामकरण')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              isEn
                  ? "Today's nakshatra is ${todayNak.nakshatraEn}. Pick a nakshatra to get name suggestions for its syllables."
                  : "आजको नक्षत्र ${todayNak.nakshatraNe} हो। नक्षत्र छानेर सोही अक्षरका नाम सुझाव पाउनुहोस्।",
              style: TextStyle(fontSize: 13, color: Colors.grey[600], height: 1.5),
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<int>(
              initialValue: _nakIndex,
              isExpanded: true,
              decoration: InputDecoration(
                labelText: isEn ? 'Nakshatra' : 'नक्षत्र',
                border: const OutlineInputBorder(),
              ),
              items: List.generate(nakshatras.length, (i) {
                final n = nakshatras[i];
                return DropdownMenuItem(
                  value: i,
                  child: Text(isEn ? n.en : n.ne),
                );
              }),
              onChanged: (v) {
                if (v != null) setState(() => _nakIndex = v);
              },
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primary,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 13),
                ),
                onPressed: _loading ? null : () => _suggest(isEn),
                icon: _loading
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.auto_awesome, size: 18),
                label: Text(isEn ? 'Suggest names' : 'नाम सुझाउनुहोस्'),
              ),
            ),
            if (!AiService.isConfigured)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: TextButton.icon(
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) =>
                            const SettingsScreen(scrollToApi: true)),
                  ),
                  icon: const Icon(Icons.key, size: 16),
                  label: Text(
                      isEn ? 'AI needs a key — add one' : 'एआई key थप्नुहोस्'),
                ),
              ),
            if (_result != null) ...[
              const SizedBox(height: 20),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppTheme.primary.withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(_result!,
                    style: const TextStyle(fontSize: 14, height: 1.6)),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
