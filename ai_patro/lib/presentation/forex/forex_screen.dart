import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/providers/language_provider.dart';
import '../../core/theme/app_theme.dart';
import '../../data/services/forex_service.dart';

/// Nepal Rastra Bank official forex rates.
class ForexScreen extends ConsumerStatefulWidget {
  const ForexScreen({super.key});

  @override
  ConsumerState<ForexScreen> createState() => _ForexScreenState();
}

class _ForexScreenState extends ConsumerState<ForexScreen> {
  late Future<ForexResult?> _future;

  @override
  void initState() {
    super.initState();
    _future = ForexService.fetch();
  }

  void _reload() => setState(() => _future = ForexService.fetch());

  @override
  Widget build(BuildContext context) {
    final isEn = ref.watch(languageProvider) == AppLanguage.english;

    return Scaffold(
      appBar: AppBar(
        title: Text(isEn ? 'Forex Rates' : 'विदेशी मुद्रा दर'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _reload),
        ],
      ),
      body: FutureBuilder<ForexResult?>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          final result = snap.data;
          if (result == null) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.cloud_off, size: 40, color: Colors.grey[400]),
                    const SizedBox(height: 12),
                    Text(
                      isEn
                          ? 'Could not load rates. Check your connection.'
                          : 'दर लोड गर्न सकिएन। इन्टरनेट जाँच गर्नुहोस्।',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.grey[600]),
                    ),
                    const SizedBox(height: 16),
                    OutlinedButton.icon(
                      onPressed: _reload,
                      icon: const Icon(Icons.refresh, size: 18),
                      label: Text(isEn ? 'Retry' : 'फेरि प्रयास'),
                    ),
                  ],
                ),
              ),
            );
          }
          return Column(
            children: [
              Container(
                width: double.infinity,
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                color: AppTheme.primary.withValues(alpha: 0.08),
                child: Text(
                  isEn
                      ? 'NRB rates · ${result.date}'
                      : 'नेपाल राष्ट्र बैंक दर · ${result.date}',
                  style: const TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600,
                      color: AppTheme.primary),
                ),
              ),
              _header(isEn),
              const Divider(height: 1),
              Expanded(
                child: ListView.separated(
                  itemCount: result.rates.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (_, i) => _row(result.rates[i]),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _header(bool isEn) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          Expanded(
              flex: 4,
              child: Text(isEn ? 'Currency' : 'मुद्रा',
                  style: _th)),
          Expanded(
              flex: 2,
              child: Text(isEn ? 'Buy' : 'खरिद',
                  textAlign: TextAlign.end, style: _th)),
          Expanded(
              flex: 2,
              child: Text(isEn ? 'Sell' : 'बिक्री',
                  textAlign: TextAlign.end, style: _th)),
        ],
      ),
    );
  }

  TextStyle get _th =>
      TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.grey[600]);

  Widget _row(ForexRate r) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: [
          Expanded(
            flex: 4,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${r.iso3}${r.unit > 1 ? ' (${r.unit})' : ''}',
                    style: const TextStyle(
                        fontWeight: FontWeight.w600, fontSize: 14)),
                Text(r.name,
                    style: TextStyle(fontSize: 11, color: Colors.grey[500]),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
          Expanded(
              flex: 2,
              child: Text(r.buy,
                  textAlign: TextAlign.end,
                  style: const TextStyle(fontSize: 14))),
          Expanded(
              flex: 2,
              child: Text(r.sell,
                  textAlign: TextAlign.end,
                  style: const TextStyle(fontSize: 14))),
        ],
      ),
    );
  }
}
