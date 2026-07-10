import 'dart:convert';
import 'package:http/http.dart' as http;

class ForexRate {
  final String iso3;
  final String name;
  final int unit;
  final String buy;
  final String sell;
  const ForexRate({
    required this.iso3,
    required this.name,
    required this.unit,
    required this.buy,
    required this.sell,
  });
}

class ForexResult {
  final String date; // AD date the rates are published for
  final List<ForexRate> rates;
  const ForexResult({required this.date, required this.rates});
}

/// Fetches Nepal Rastra Bank official forex rates (public API).
/// Docs: https://www.nrb.org.np/api-docs/
class ForexService {
  static Future<ForexResult?> fetch() async {
    final now = DateTime.now();
    String d(DateTime x) =>
        '${x.year}-${x.month.toString().padLeft(2, '0')}-${x.day.toString().padLeft(2, '0')}';
    // Query a few days back so weekends/holidays still return the latest rates.
    final from = d(now.subtract(const Duration(days: 4)));
    final to = d(now);
    final url =
        'https://www.nrb.org.np/api/forex/v1/rates?page=1&per_page=100&from=$from&to=$to';

    try {
      final res = await http
          .get(Uri.parse(url), headers: {'Accept': 'application/json'})
          .timeout(const Duration(seconds: 12));
      if (res.statusCode != 200) return null;

      final data = jsonDecode(res.body) as Map<String, dynamic>;
      final payload = (data['data']?['payload'] as List?) ?? const [];
      if (payload.isEmpty) return null;

      // Latest entry in the range.
      final latest = payload.last as Map<String, dynamic>;
      final date = latest['date'] as String? ?? to;
      final rawRates = (latest['rates'] as List?) ?? const [];

      final rates = rawRates.map((r) {
        final m = r as Map<String, dynamic>;
        final cur = (m['currency'] as Map<String, dynamic>?) ?? const {};
        return ForexRate(
          iso3: cur['iso3'] as String? ?? '',
          name: cur['name'] as String? ?? '',
          unit: (cur['unit'] as num?)?.toInt() ?? 1,
          buy: m['buy']?.toString() ?? '-',
          sell: m['sell']?.toString() ?? '-',
        );
      }).where((r) => r.iso3.isNotEmpty).toList();

      if (rates.isEmpty) return null;
      return ForexResult(date: date, rates: rates);
    } catch (_) {
      return null;
    }
  }
}
