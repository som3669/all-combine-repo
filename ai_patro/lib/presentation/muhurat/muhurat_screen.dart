import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nepali_utils/nepali_utils.dart';
import '../../core/constants/app_strings.dart';
import '../../core/providers/api_key_provider.dart';
import '../../core/providers/language_provider.dart';
import '../../core/theme/app_theme.dart';
import '../../data/services/ai_service.dart';
import '../../data/services/muhurat_service.dart';
import '../settings/settings_screen.dart';

class MuhuratScreen extends ConsumerStatefulWidget {
  const MuhuratScreen({super.key});

  @override
  ConsumerState<MuhuratScreen> createState() => _MuhuratScreenState();
}

class _MuhuratScreenState extends ConsumerState<MuhuratScreen> {
  MuhuratEvent _event = MuhuratEvent.marriage;
  late int _year;
  late int _month;
  List<MuhuratDate>? _results;
  String? _aiNote;
  bool _aiLoading = false;

  static const _adMonths = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  @override
  void initState() {
    super.initState();
    final now = NepaliDateTime.now();
    _year = now.year;
    _month = now.month;
  }

  void _search() {
    setState(() {
      _results = MuhuratService.find(
          bsYear: _year, bsMonth: _month, event: _event);
      _aiNote = null;
    });
  }

  Future<void> _explain(bool isEn) async {
    if (_results == null || _results!.isEmpty) return;
    setState(() => _aiLoading = true);
    final list = _results!.take(8).map((m) {
      final ad = m.bs.toDateTime();
      return '${AppStrings.englishMonths[m.bs.month - 1]} ${m.bs.day} '
          '(${ad.year}-${ad.month}-${ad.day}): ${m.panchang.tithiEn}, '
          '${m.panchang.nakshatraEn}';
    }).join('\n');

    final system = isEn
        ? 'You are a Nepali jyotish assistant. You are given already-computed '
            'auspicious dates for ${_event.en} (do NOT add or change dates). '
            'Briefly (under 100 words) explain what makes these good and any general '
            'advice. Respond in English.'
        : 'तपाईं नेपाली ज्योतिष सहायक हुनुहुन्छ। ${_event.ne} का लागि पहिले नै गणना '
            'गरिएका शुभ मितिहरू दिइएका छन् (मिति थप्ने वा बदल्ने नगर्नुहोस्)। यी किन '
            'शुभ हुन् र सामान्य सल्लाह छोटकरीमा (१०० शब्दभित्र) दिनुहोस्। जवाफ नेपालीमा।';
    final user = 'Event: ${_event.en}\nDates:\n$list';
    final res = await AiService.complete(system, user, maxTokens: 240);
    if (!mounted) return;
    setState(() {
      _aiLoading = false;
      _aiNote = res ?? (isEn ? 'Could not generate note.' : 'टिप्पणी तयार भएन।');
    });
  }

  @override
  Widget build(BuildContext context) {
    final isEn = ref.watch(languageProvider) == AppLanguage.english;
    ref.watch(apiKeyProvider);
    final months = isEn ? AppStrings.englishMonths : AppStrings.nepaliMonths;

    return Scaffold(
      appBar: AppBar(title: Text(isEn ? 'Muhurat / Saait' : 'मुहूर्त / साइत')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          DropdownButtonFormField<MuhuratEvent>(
            initialValue: _event,
            decoration: InputDecoration(
              labelText: isEn ? 'Ceremony' : 'कार्य',
              border: const OutlineInputBorder(),
            ),
            items: MuhuratEvent.all
                .map((e) => DropdownMenuItem(
                    value: e, child: Text(isEn ? e.en : e.ne)))
                .toList(),
            onChanged: (v) => setState(() => _event = v!),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                flex: 3,
                child: DropdownButtonFormField<int>(
                  initialValue: _month,
                  isExpanded: true,
                  decoration: InputDecoration(
                    labelText: isEn ? 'Month' : 'महिना',
                    border: const OutlineInputBorder(),
                  ),
                  items: List.generate(
                      12,
                      (i) => DropdownMenuItem(
                          value: i + 1, child: Text(months[i]))),
                  onChanged: (v) => setState(() => _month = v!),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                flex: 2,
                child: DropdownButtonFormField<int>(
                  initialValue: _year,
                  isExpanded: true,
                  decoration: InputDecoration(
                    labelText: isEn ? 'Year' : 'वर्ष',
                    border: const OutlineInputBorder(),
                  ),
                  items: List.generate(
                      10,
                      (i) => DropdownMenuItem(
                          value: _year - 2 + i,
                          child: Text(isEn
                              ? '${_year - 2 + i}'
                              : AppStrings.toNepaliNumeral(_year - 2 + i)))),
                  onChanged: (v) => setState(() => _year = v!),
                ),
              ),
            ],
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
              onPressed: _search,
              icon: const Icon(Icons.search),
              label: Text(isEn ? 'Find dates' : 'मिति खोज्नुहोस्'),
            ),
          ),
          const SizedBox(height: 16),
          if (_results != null) ...[
            Text(
              isEn
                  ? '${_results!.length} auspicious date(s)'
                  : '${_results!.length} शुभ मिति',
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
            ),
            const SizedBox(height: 8),
            if (_results!.isEmpty)
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  isEn
                      ? 'No clearly auspicious dates this month. Try another month.'
                      : 'यस महिना स्पष्ट शुभ मिति भेटिएन। अर्को महिना हेर्नुहोस्।',
                  style: TextStyle(color: Colors.grey[600]),
                ),
              )
            else ...[
              ..._results!.map((m) => _tile(m, isEn)),
              const SizedBox(height: 12),
              if (_aiNote == null && !AiService.isConfigured)
                OutlinedButton.icon(
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
                )
              else if (_aiNote == null)
                OutlinedButton.icon(
                  onPressed: _aiLoading ? null : () => _explain(isEn),
                  icon: _aiLoading
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.auto_awesome, size: 18),
                  label: Text(isEn ? 'AI guidance' : 'एआई सल्लाह'),
                )
              else
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppTheme.primary.withValues(alpha: 0.06),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(_aiNote!,
                      style: const TextStyle(fontSize: 14, height: 1.5)),
                ),
            ],
          ],
        ],
      ),
    );
  }

  Widget _tile(MuhuratDate m, bool isEn) {
    final ad = m.bs.toDateTime();
    final bsMonth = isEn
        ? AppStrings.englishMonths[m.bs.month - 1]
        : AppStrings.nepaliMonths[m.bs.month - 1];
    final bsDay = isEn ? '${m.bs.day}' : AppStrings.toNepaliNumeral(m.bs.day);
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: ListTile(
        leading: const Icon(Icons.event_available, color: AppTheme.primary),
        title: Text('$bsMonth $bsDay',
            style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(
          '${isEn ? m.panchang.tithiEn : m.panchang.tithiNe} · '
          '${isEn ? m.panchang.nakshatraEn : m.panchang.nakshatraNe}',
        ),
        trailing: Text('${_adMonths[ad.month - 1]} ${ad.day}',
            style: TextStyle(fontSize: 12, color: Colors.grey[600])),
      ),
    );
  }
}
