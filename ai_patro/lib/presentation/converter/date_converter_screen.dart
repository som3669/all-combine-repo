import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nepali_utils/nepali_utils.dart';
import '../../core/constants/app_strings.dart';
import '../../core/providers/language_provider.dart';
import '../../core/theme/app_theme.dart';

/// Two-way Bikram Sambat ↔ Gregorian (AD) date converter.
class DateConverterScreen extends ConsumerStatefulWidget {
  const DateConverterScreen({super.key});

  @override
  ConsumerState<DateConverterScreen> createState() =>
      _DateConverterScreenState();
}

class _DateConverterScreenState extends ConsumerState<DateConverterScreen> {
  bool _bsToAd = true;

  // BS input
  late int _bsYear;
  late int _bsMonth;
  late int _bsDay;

  // AD input
  late DateTime _adDate;

  @override
  void initState() {
    super.initState();
    final now = NepaliDateTime.now();
    _bsYear = now.year;
    _bsMonth = now.month;
    _bsDay = now.day;
    _adDate = DateTime.now();
  }

  static const _adMonths = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  static const _adWeekdays = [
    'Monday', 'Tuesday', 'Wednesday', 'Thursday',
    'Friday', 'Saturday', 'Sunday',
  ];

  @override
  Widget build(BuildContext context) {
    final isEn = ref.watch(languageProvider) == AppLanguage.english;

    return Scaffold(
      appBar: AppBar(
        title: Text(isEn ? 'Date Converter' : 'मिति रूपान्तरण'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Direction toggle
            SegmentedButton<bool>(
              segments: [
                ButtonSegment(
                  value: true,
                  label: Text(isEn ? 'BS → AD' : 'बि.सं. → ई.सं.'),
                ),
                ButtonSegment(
                  value: false,
                  label: Text(isEn ? 'AD → BS' : 'ई.सं. → बि.सं.'),
                ),
              ],
              selected: {_bsToAd},
              onSelectionChanged: (s) => setState(() => _bsToAd = s.first),
            ),
            const SizedBox(height: 24),
            if (_bsToAd) _buildBsToAd(isEn) else _buildAdToBs(isEn),
          ],
        ),
      ),
    );
  }

  // ── BS → AD ──────────────────────────────────────────────────────────────
  Widget _buildBsToAd(bool isEn) {
    // Guard: clamp day to month length.
    final maxDay = NepaliDateTime(_bsYear, _bsMonth).totalDays;
    if (_bsDay > maxDay) _bsDay = maxDay;

    final bs = NepaliDateTime(_bsYear, _bsMonth, _bsDay);
    final ad = bs.toDateTime();
    final months = isEn ? AppStrings.englishMonths : AppStrings.nepaliMonths;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(isEn ? 'Bikram Sambat date' : 'बिक्रम सम्वत् मिति',
            style: _labelStyle),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              flex: 4,
              child: _dropdown<int>(
                value: _bsMonth,
                items: List.generate(12, (i) => i + 1),
                labelOf: (m) => months[m - 1],
                onChanged: (v) => setState(() => _bsMonth = v),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              flex: 2,
              child: _dropdown<int>(
                value: _bsDay,
                items: List.generate(maxDay, (i) => i + 1),
                labelOf: (d) => isEn ? '$d' : AppStrings.toNepaliNumeral(d),
                onChanged: (v) => setState(() => _bsDay = v),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              flex: 3,
              child: _dropdown<int>(
                value: _bsYear,
                items: List.generate(101, (i) => 2000 + i),
                labelOf: (y) => isEn ? '$y' : AppStrings.toNepaliNumeral(y),
                onChanged: (v) => setState(() => _bsYear = v),
              ),
            ),
          ],
        ),
        const SizedBox(height: 24),
        _resultCard(
          title: isEn ? 'Gregorian (AD)' : 'ईस्वी सम्वत् (AD)',
          big: '${_adMonths[ad.month - 1]} ${ad.day}, ${ad.year}',
          sub: _adWeekdays[ad.weekday - 1],
        ),
      ],
    );
  }

  // ── AD → BS ──────────────────────────────────────────────────────────────
  Widget _buildAdToBs(bool isEn) {
    final bs = _adDate.toNepaliDateTime();
    final bsMonths = isEn ? AppStrings.englishMonths : AppStrings.nepaliMonths;
    final day = isEn ? '${bs.day}' : AppStrings.toNepaliNumeral(bs.day);
    final year = isEn ? '${bs.year}' : AppStrings.toNepaliNumeral(bs.year);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(isEn ? 'Gregorian (AD) date' : 'ईस्वी सम्वत् मिति',
            style: _labelStyle),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          style: OutlinedButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 14),
          ),
          onPressed: () async {
            final picked = await showDatePicker(
              context: context,
              initialDate: _adDate,
              firstDate: DateTime(1944),
              lastDate: DateTime(2043),
            );
            if (picked != null) setState(() => _adDate = picked);
          },
          icon: const Icon(Icons.calendar_today, size: 18),
          label: Text(
            '${_adMonths[_adDate.month - 1]} ${_adDate.day}, ${_adDate.year}',
            style: const TextStyle(fontSize: 16),
          ),
        ),
        const SizedBox(height: 24),
        _resultCard(
          title: isEn ? 'Bikram Sambat (BS)' : 'बिक्रम सम्वत् (BS)',
          big: '${bsMonths[bs.month - 1]} $day, $year',
          sub: _adWeekdays[_adDate.weekday - 1],
        ),
      ],
    );
  }

  // ── Reusable bits ──────────────────────────────────────────────────────
  TextStyle get _labelStyle => TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w600,
        color: Colors.grey[600],
      );

  Widget _dropdown<T>({
    required T value,
    required List<T> items,
    required String Function(T) labelOf,
    required ValueChanged<T> onChanged,
  }) {
    return DropdownButtonFormField<T>(
      initialValue: value,
      isExpanded: true,
      decoration: const InputDecoration(
        border: OutlineInputBorder(),
        contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      ),
      items: items
          .map((e) => DropdownMenuItem(
                value: e,
                child: Text(labelOf(e), overflow: TextOverflow.ellipsis),
              ))
          .toList(),
      onChanged: (v) {
        if (v != null) onChanged(v);
      },
    );
  }

  Widget _resultCard({
    required String title,
    required String big,
    required String sub,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppTheme.primary.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.primary.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.primary)),
          const SizedBox(height: 8),
          Text(big,
              style: const TextStyle(
                  fontSize: 24, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text(sub, style: TextStyle(fontSize: 14, color: Colors.grey[600])),
        ],
      ),
    );
  }
}
