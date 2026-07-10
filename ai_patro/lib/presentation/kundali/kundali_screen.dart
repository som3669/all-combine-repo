import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/providers/api_key_provider.dart';
import '../../core/providers/language_provider.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/rashi.dart';
import '../../data/services/ai_service.dart';
import '../../data/services/panchang_service.dart';
import '../settings/settings_screen.dart';

/// Kundali-lite: computes moon sign, nakshatra, sun sign, and (approx) lagna
/// deterministically from birth date/time, then the AI gives a reading.
class KundaliScreen extends ConsumerStatefulWidget {
  const KundaliScreen({super.key});

  @override
  ConsumerState<KundaliScreen> createState() => _KundaliScreenState();
}

class _KundaliScreenState extends ConsumerState<KundaliScreen> {
  DateTime _date = DateTime(2000, 1, 1);
  TimeOfDay _time = const TimeOfDay(hour: 12, minute: 0);
  ({int moonRashi, int nakshatra, int sunRashi, int lagna})? _chart;
  bool _loading = false;
  String? _reading;

  void _compute() {
    final dt = DateTime(_date.year, _date.month, _date.day, _time.hour, _time.minute);
    setState(() {
      _chart = PanchangService.computeChart(dt);
      _reading = null;
    });
  }

  Future<void> _readChart(bool isEn) async {
    if (_chart == null) return;
    setState(() => _loading = true);
    final c = _chart!;
    final nak = PanchangService.nakshatras[c.nakshatra];
    final facts = 'Moon sign (Rashi): ${Rashi.all[c.moonRashi].en}, '
        'Nakshatra: ${nak.en}, Sun sign: ${Rashi.all[c.sunRashi].en}, '
        'Ascendant (Lagna): ${Rashi.all[c.lagna].en}';
    final system = isEn
        ? 'You are a Vedic astrology assistant. You are given already-computed chart '
            'placements (do NOT recompute or change them). Give a short, positive, '
            'general personality reading based on these — under 150 words. Avoid '
            'fatalistic or harmful predictions. Respond in English.'
        : 'तपाईं वैदिक ज्योतिष सहायक हुनुहुन्छ। पहिले नै गणना गरिएका ग्रह स्थिति दिइएको छ '
            '(पुनः गणना वा परिवर्तन नगर्नुहोस्)। यसैका आधारमा छोटो, सकारात्मक, सामान्य '
            'स्वभाव विश्लेषण (१५० शब्दभित्र) दिनुहोस्। हानिकारक भविष्यवाणी नगर्नुहोस्। '
            'जवाफ नेपालीमा।';
    final res = await AiService.complete(system, facts, maxTokens: 400);
    if (!mounted) return;
    setState(() {
      _loading = false;
      _reading = res ??
          '${isEn ? "Could not generate reading." : "विश्लेषण तयार भएन।"} '
              '(${AiService.lastError ?? ''})';
    });
  }

  @override
  Widget build(BuildContext context) {
    final isEn = ref.watch(languageProvider) == AppLanguage.english;
    ref.watch(apiKeyProvider);
    final c = _chart;

    return Scaffold(
      appBar: AppBar(title: Text(isEn ? 'Kundali (Lite)' : 'कुण्डली (संक्षिप्त)')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () async {
                    final d = await showDatePicker(
                      context: context,
                      initialDate: _date,
                      firstDate: DateTime(1920),
                      lastDate: DateTime.now(),
                    );
                    if (d != null) setState(() => _date = d);
                  },
                  icon: const Icon(Icons.cake, size: 18),
                  label: Text('${_date.year}-${_date.month}-${_date.day}'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () async {
                    final t = await showTimePicker(
                        context: context, initialTime: _time);
                    if (t != null) setState(() => _time = t);
                  },
                  icon: const Icon(Icons.schedule, size: 18),
                  label: Text(_time.format(context)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            isEn
                ? 'Place assumed: Kathmandu. Lagna is approximate.'
                : 'स्थान: काठमाडौं मानिएको। लग्न अनुमानित हो।',
            style: TextStyle(fontSize: 11.5, color: Colors.grey[600]),
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
              onPressed: _compute,
              icon: const Icon(Icons.calculate),
              label: Text(isEn ? 'Compute chart' : 'कुण्डली गणना'),
            ),
          ),
          if (c != null) ...[
            const SizedBox(height: 16),
            _card(isEn ? 'Moon sign (Rashi)' : 'चन्द्र राशि',
                isEn ? Rashi.all[c.moonRashi].en : Rashi.all[c.moonRashi].ne,
                Rashi.all[c.moonRashi].symbol),
            _card(isEn ? 'Nakshatra' : 'नक्षत्र',
                isEn
                    ? PanchangService.nakshatras[c.nakshatra].en
                    : PanchangService.nakshatras[c.nakshatra].ne,
                '⭐'),
            _card(isEn ? 'Sun sign' : 'सूर्य राशि',
                isEn ? Rashi.all[c.sunRashi].en : Rashi.all[c.sunRashi].ne,
                Rashi.all[c.sunRashi].symbol),
            _card(isEn ? 'Ascendant (Lagna)' : 'लग्न',
                isEn ? Rashi.all[c.lagna].en : Rashi.all[c.lagna].ne,
                Rashi.all[c.lagna].symbol),
            const SizedBox(height: 12),
            if (_reading != null)
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppTheme.primary.withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(_reading!,
                    style: const TextStyle(fontSize: 14, height: 1.5)),
              )
            else if (!AiService.isConfigured)
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
            else
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: _loading ? null : () => _readChart(isEn),
                  icon: _loading
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.auto_awesome, size: 18),
                  label: Text(isEn ? 'AI reading' : 'एआई विश्लेषण'),
                ),
              ),
          ],
        ],
      ),
    );
  }

  Widget _card(String label, String value, String symbol) {
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: ListTile(
        leading: Text(symbol, style: const TextStyle(fontSize: 24)),
        title: Text(label, style: TextStyle(fontSize: 12, color: Colors.grey[600])),
        subtitle: Text(value,
            style: const TextStyle(
                fontSize: 17, fontWeight: FontWeight.bold, color: AppTheme.primary)),
      ),
    );
  }
}
