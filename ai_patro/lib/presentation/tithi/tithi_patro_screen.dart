import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nepali_utils/nepali_utils.dart';
import '../../core/constants/app_strings.dart';
import '../../core/providers/language_provider.dart';
import '../../core/theme/app_theme.dart';
import '../../data/repositories/calendar_repository.dart';
import '../../data/services/panchang_service.dart';
import '../panchang/panchang_sheet.dart';

/// Tithi Patro — a month view listing each day's paksha, tithi and nakshatra,
/// computed deterministically via [PanchangService].
class TithiPatroScreen extends ConsumerStatefulWidget {
  const TithiPatroScreen({super.key});

  @override
  ConsumerState<TithiPatroScreen> createState() => _TithiPatroScreenState();
}

class _TithiPatroScreenState extends ConsumerState<TithiPatroScreen> {
  final _repo = CalendarRepository();
  late int _year;
  late int _month;

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

  void _prev() {
    setState(() {
      if (_month == 1) {
        _month = 12;
        _year--;
      } else {
        _month--;
      }
    });
  }

  void _next() {
    setState(() {
      if (_month == 12) {
        _month = 1;
        _year++;
      } else {
        _month++;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final isEn = ref.watch(languageProvider) == AppLanguage.english;
    final months = isEn ? AppStrings.englishMonths : AppStrings.nepaliMonths;
    final today = NepaliDateTime.now();
    final days = _repo.getDaysInMonth(_year, _month);

    return Scaffold(
      appBar: AppBar(title: Text(isEn ? 'Tithi Patro' : 'तिथि पात्रो')),
      body: Column(
        children: [
          // Month navigator
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            color: AppTheme.primary.withValues(alpha: 0.06),
            child: Row(
              children: [
                IconButton(
                  icon: const Icon(Icons.chevron_left),
                  onPressed: _prev,
                ),
                Expanded(
                  child: Text(
                    isEn
                        ? '${months[_month - 1]} $_year BS'
                        : '${months[_month - 1]} ${AppStrings.toNepaliNumeral(_year)}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.primary,
                    ),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.chevron_right),
                  onPressed: _next,
                ),
              ],
            ),
          ),
          Expanded(
            child: ListView.separated(
              itemCount: days.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (_, i) {
                final bs = days[i];
                final isToday = bs.year == today.year &&
                    bs.month == today.month &&
                    bs.day == today.day;
                return _dayRow(bs, isToday, isEn);
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _dayRow(NepaliDateTime bs, bool isToday, bool isEn) {
    final ad = bs.toDateTime();
    final p = PanchangService.compute(ad);
    final isSaturday = ad.weekday == DateTime.saturday;
    final dayColor = isSaturday ? AppTheme.holidayColor : null;

    return Container(
      color: isToday
          ? AppTheme.primary.withValues(alpha: 0.10)
          : Colors.transparent,
      child: ListTile(
        dense: true,
        leading: SizedBox(
          width: 40,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                isEn ? '${bs.day}' : AppStrings.toNepaliNumeral(bs.day),
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: dayColor ?? AppTheme.primary,
                ),
              ),
              Text(
                '${_adMonths[ad.month - 1]} ${ad.day}',
                style: TextStyle(fontSize: 10, color: Colors.grey[600]),
              ),
            ],
          ),
        ),
        title: Text(
          isEn ? '${p.pakshaEn} ${p.tithiEn}' : '${p.pakshaNe} ${p.tithiNe}',
          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
        ),
        subtitle: Text(
          '${isEn ? 'Nakshatra' : 'नक्षत्र'}: '
          '${isEn ? p.nakshatraEn : p.nakshatraNe}',
          style: TextStyle(fontSize: 12, color: Colors.grey[600]),
        ),
        trailing: const Icon(Icons.chevron_right, size: 18),
        onTap: () => showPanchangSheet(context, bs, isEn),
      ),
    );
  }
}
