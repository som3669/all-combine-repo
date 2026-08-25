import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nepali_utils/nepali_utils.dart';
import '../../core/constants/app_strings.dart';
import '../../core/providers/api_key_provider.dart';
import '../../core/theme/app_theme.dart';
import '../../data/services/ai_service.dart';
import '../../data/services/panchang_service.dart';
import '../settings/settings_screen.dart';

/// Opens the panchang detail for [bs] as a bottom sheet.
void showPanchangSheet(BuildContext context, NepaliDateTime bs, bool isEn) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (_) => _PanchangSheet(bs: bs, isEn: isEn),
  );
}

class _PanchangSheet extends ConsumerStatefulWidget {
  final NepaliDateTime bs;
  final bool isEn;
  const _PanchangSheet({required this.bs, required this.isEn});

  @override
  ConsumerState<_PanchangSheet> createState() => _PanchangSheetState();
}

class _PanchangSheetState extends ConsumerState<_PanchangSheet> {
  late final Panchang _p;
  String? _explanation;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    // Deterministic — no network, no LLM.
    _p = PanchangService.compute(widget.bs.toDateTime());
  }

  Future<void> _explain() async {
    setState(() => _loading = true);

    final system = widget.isEn
        ? 'You are a Nepali jyotish assistant. You are GIVEN already-computed, correct '
            'panchang facts. Do NOT recompute or change them. Based ONLY on these values, '
            'briefly explain what the day is like and suggest 2-3 suitable activities and '
            '1-2 to avoid. Under 110 words. Respond in English.'
        : 'तपाईं नेपाली ज्योतिष सहायक हुनुहुन्छ। तपाईंलाई पहिले नै गणना गरिएका सही पञ्चाङ्ग '
            'तथ्यहरू दिइएको छ। तिनलाई पुनः गणना वा परिवर्तन नगर्नुहोस्। यी मानहरूकै आधारमा '
            'आजको दिन कस्तो छ भनी छोटकरीमा बताउनुहोस् र २-३ उपयुक्त कार्य तथा १-२ बच्नुपर्ने '
            'कार्य सुझाउनुहोस्। ११० शब्दभित्र। जवाफ नेपालीमा दिनुहोस्। '
            'तिथि, नक्षत्र, योग र करणका नाम तल दिइएका शब्दहरू जस्ताको तस्तै '
            'प्रयोग गर्नुहोस् — आफैं अनुवाद वा परिवर्तन नगर्नुहोस्।';

    final user =
        'Panchang facts: ${widget.isEn ? _p.summaryEn : _p.summaryNe}';

    final result =
        await AiService.complete(system, user, maxTokens: 260, temperature: 0.6);

    if (!mounted) return;
    setState(() {
      _loading = false;
      _explanation = result ??
          (widget.isEn
              ? 'Could not generate an explanation right now.'
              : 'अहिले व्याख्या तयार गर्न सकिएन।');
    });
  }

  @override
  Widget build(BuildContext context) {
    ref.watch(apiKeyProvider);
    final isEn = widget.isEn;
    final bs = widget.bs;
    final ad = bs.toDateTime();
    final bsLabel = isEn
        ? '${AppStrings.englishMonths[bs.month - 1]} ${bs.day}, ${bs.year} BS'
        : '${AppStrings.nepaliMonths[bs.month - 1]} ${AppStrings.toNepaliNumeral(bs.day)}, ${AppStrings.toNepaliNumeral(bs.year)}';

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.7,
      maxChildSize: 0.92,
      builder: (_, controller) => SingleChildScrollView(
        controller: controller,
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey[300],
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              isEn ? 'Panchang' : 'पञ्चाङ्ग',
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            Text(
              '$bsLabel · ${ad.day}/${ad.month}/${ad.year}',
              style: TextStyle(fontSize: 12, color: Colors.grey[600]),
            ),
            const SizedBox(height: 16),
            _row(isEn ? 'Paksha' : 'पक्ष', isEn ? _p.pakshaEn : _p.pakshaNe),
            _row(isEn ? 'Tithi' : 'तिथि', isEn ? _p.tithiEn : _p.tithiNe),
            _row(isEn ? 'Nakshatra' : 'नक्षत्र',
                isEn ? _p.nakshatraEn : _p.nakshatraNe),
            _row(isEn ? 'Yoga' : 'योग', isEn ? _p.yogaEn : _p.yogaNe),
            _row(isEn ? 'Karana' : 'करण', isEn ? _p.karanaEn : _p.karanaNe),
            const Divider(height: 20),
            _row(isEn ? 'Sunrise' : 'सूर्योदय', _p.sunrise),
            _row(isEn ? 'Sunset' : 'सूर्यास्त', _p.sunset),
            _row(isEn ? 'Rahukaal' : 'राहुकाल', _p.rahuKaal),
            const SizedBox(height: 8),
            Text(
              isEn
                  ? 'Computed astronomically (approx, noon NPT).'
                  : 'खगोलीय रूपमा गणना गरिएको (अनुमानित, मध्याह्न)।',
              style: TextStyle(fontSize: 10.5, color: Colors.grey[500]),
            ),
            const Divider(height: 28),
            if (_explanation == null && !AiService.isConfigured)
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) =>
                            const SettingsScreen(scrollToApi: true)),
                  ),
                  icon: const Icon(Icons.key, size: 18),
                  label: Text(isEn
                      ? 'AI needs a key — add one'
                      : 'एआई key थप्नुहोस्'),
                ),
              )
            else if (_explanation == null)
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primary,
                    foregroundColor: Colors.white,
                  ),
                  onPressed: _loading ? null : _explain,
                  icon: _loading
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.auto_awesome, size: 18),
                  label: Text(isEn
                      ? 'Explain with AI'
                      : 'एआईबाट व्याख्या गर्नुहोस्'),
                ),
              )
            else
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppTheme.primary.withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.auto_awesome,
                            size: 16, color: AppTheme.primary),
                        const SizedBox(width: 6),
                        Text(
                          isEn ? 'AI interpretation' : 'एआई व्याख्या',
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            color: AppTheme.primary,
                            fontSize: 13,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(_explanation!,
                        style: const TextStyle(fontSize: 14, height: 1.5)),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        children: [
          SizedBox(
            width: 110,
            child: Text(
              label,
              style: TextStyle(
                  fontSize: 14,
                  color: Colors.grey[600],
                  fontWeight: FontWeight.w500),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                  fontSize: 15, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}
