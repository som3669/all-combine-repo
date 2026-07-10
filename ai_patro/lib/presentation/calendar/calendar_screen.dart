import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nepali_utils/nepali_utils.dart';
import '../../core/constants/app_strings.dart';
import '../../core/theme/app_theme.dart';
import '../../core/providers/language_provider.dart';
import '../../data/repositories/holiday_repository.dart';
import '../widgets/day_cell.dart';
import '../widgets/app_drawer.dart';
import '../panchang/panchang_sheet.dart';
import '../assistant/assistant_screen.dart';
import '../../data/services/panchang_service.dart';
import 'calendar_provider.dart';

class CalendarScreen extends ConsumerWidget {
  const CalendarScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = ref.watch(selectedMonthProvider);
    final days = ref.watch(calendarDaysProvider);
    final firstWeekday = ref.watch(firstWeekdayProvider);
    final selectedDay = ref.watch(selectedDayProvider);
    final today = NepaliDateTime.now();
    final holidayRepo = ref.watch(holidayRepoProvider);
    final notice = ref.watch(noticeBannerProvider);
    final lang = ref.watch(languageProvider);
    final isEn = lang == AppLanguage.english;

    final months = isEn ? AppStrings.englishMonths : AppStrings.nepaliMonths;
    final yearLabel = isEn
        ? selected.year.toString()
        : AppStrings.toNepaliNumeral(selected.year);

    return Scaffold(
      drawer: AppDrawer(isEnglish: isEn),
      floatingActionButton: FloatingActionButton(
        backgroundColor: AppTheme.primary,
        foregroundColor: Colors.white,
        tooltip: isEn ? 'AI Assistant' : 'एआई सहायक',
        onPressed: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const AssistantScreen()),
        ),
        child: const Icon(Icons.auto_awesome),
      ),
      appBar: AppBar(
        title: GestureDetector(
          onTap: () => _showMonthYearPicker(context, ref, selected, isEn),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                '${months[selected.month - 1]} $yearLabel',
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),
              const SizedBox(width: 4),
              const Icon(Icons.arrow_drop_down, size: 22),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => ref.read(languageProvider.notifier).toggle(),
            child: Text(
              isEn ? 'NE' : 'EN',
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
                fontSize: 14,
              ),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.today),
            onPressed: () {
              ref.read(selectedMonthProvider.notifier).goToToday();
              ref.read(selectedDayProvider.notifier).select(NepaliDateTime.now());
            },
          ),
        ],
      ),
      body: Column(
        children: [
          if (notice != null)
            _NoticeBanner(
              message: isEn
                  ? (notice.en ?? notice.ne ?? '')
                  : (notice.ne ?? notice.en ?? ''),
            ),
          _MonthNavigator(ref: ref),
          _ADDateRow(selected: selected),
          const SizedBox(height: 4),
          _WeekdayHeader(isEnglish: isEn),
          const Divider(height: 1),
          Expanded(
            child: _CalendarGrid(
              days: days,
              firstWeekday: firstWeekday,
              today: today,
              selectedDay: selectedDay,
              ref: ref,
              isEnglish: isEn,
            ),
          ),
          _DayDetailPanel(
            day: selectedDay ?? today,
            holidayRepo: holidayRepo,
            isEnglish: isEn,
          ),
        ],
      ),
    );
  }
}

void _showMonthYearPicker(
    BuildContext context, WidgetRef ref, NepaliDateTime current, bool isEn) {
  int pickedYear = current.year;
  int pickedMonth = current.month;
  final months = isEn ? AppStrings.englishMonths : AppStrings.nepaliMonths;

  showDialog<void>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setState) => AlertDialog(
        title: Text(isEn ? 'Select Month & Year' : 'महिना र वर्ष छान्नुहोस्'),
        content: Row(
          children: [
            Expanded(
              flex: 3,
              child: DropdownButton<int>(
                isExpanded: true,
                value: pickedMonth,
                items: List.generate(
                  12,
                  (i) => DropdownMenuItem(
                    value: i + 1,
                    child: Text(months[i]),
                  ),
                ),
                onChanged: (v) => setState(() => pickedMonth = v!),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              flex: 4,
              child: DropdownButton<int>(
                isExpanded: true,
                value: pickedYear,
                items: List.generate(
                  101,
                  (i) => DropdownMenuItem(
                    value: 2000 + i,
                    child: Text(isEn
                        ? (2000 + i).toString()
                        : AppStrings.toNepaliNumeral(2000 + i)),
                  ),
                ),
                onChanged: (v) => setState(() => pickedYear = v!),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(isEn ? 'Cancel' : 'रद्द'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.primary,
              foregroundColor: Colors.white,
            ),
            onPressed: () {
              ref
                  .read(selectedMonthProvider.notifier)
                  .goTo(pickedYear, pickedMonth);
              Navigator.pop(ctx);
            },
            child: Text(isEn ? 'Go' : 'जानुहोस्'),
          ),
        ],
      ),
    ),
  );
}

class _NoticeBanner extends StatefulWidget {
  final String message;
  const _NoticeBanner({required this.message});

  @override
  State<_NoticeBanner> createState() => _NoticeBannerState();
}

class _NoticeBannerState extends State<_NoticeBanner> {
  bool _dismissed = false;

  @override
  Widget build(BuildContext context) {
    if (_dismissed || widget.message.isEmpty) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      color: AppTheme.primary.withValues(alpha: 0.12),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        children: [
          const Icon(Icons.info_outline, size: 16, color: AppTheme.primary),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              widget.message,
              style: const TextStyle(fontSize: 13, color: AppTheme.primary),
            ),
          ),
          GestureDetector(
            onTap: () => setState(() => _dismissed = true),
            child: const Icon(Icons.close, size: 16, color: AppTheme.primary),
          ),
        ],
      ),
    );
  }
}

class _MonthNavigator extends StatelessWidget {
  final WidgetRef ref;
  const _MonthNavigator({required this.ref});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        IconButton(
          icon: const Icon(Icons.chevron_left),
          onPressed: () => ref.read(selectedMonthProvider.notifier).previous(),
        ),
        IconButton(
          icon: const Icon(Icons.chevron_right),
          onPressed: () => ref.read(selectedMonthProvider.notifier).next(),
        ),
      ],
    );
  }
}

class _ADDateRow extends StatelessWidget {
  final NepaliDateTime selected;
  const _ADDateRow({required this.selected});

  @override
  Widget build(BuildContext context) {
    final ad = NepaliDateTime(selected.year, selected.month, 1).toDateTime();
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
      child: Text(
        '${_monthName(ad.month)} ${ad.year}',
        style: TextStyle(
          color: dark ? Colors.white70 : Colors.grey[600],
          fontSize: 13,
        ),
      ),
    );
  }

  String _monthName(int m) => const [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
      ][m - 1];
}

class _WeekdayHeader extends StatelessWidget {
  final bool isEnglish;
  const _WeekdayHeader({required this.isEnglish});

  @override
  Widget build(BuildContext context) {
    final days = isEnglish ? AppStrings.englishDays : AppStrings.nepaliDays;
    final weekdayColor = Theme.of(context).brightness == Brightness.dark
        ? Colors.white.withValues(alpha: 0.90)
        : AppTheme.weekdayColor;
    return Row(
      children: days.asMap().entries.map((e) {
        final isSat = e.key == 6;
        return Expanded(
          child: Center(
            child: Text(
              e.value,
              style: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 13,
                color: isSat ? AppTheme.saturdayColor : weekdayColor,
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}

class _CalendarGrid extends StatelessWidget {
  final List<NepaliDateTime> days;
  final int firstWeekday;
  final NepaliDateTime today;
  final NepaliDateTime? selectedDay;
  final WidgetRef ref;
  final bool isEnglish;

  const _CalendarGrid({
    required this.days,
    required this.firstWeekday,
    required this.today,
    required this.selectedDay,
    required this.ref,
    required this.isEnglish,
  });

  @override
  Widget build(BuildContext context) {
    final holidayRepo = ref.watch(holidayRepoProvider);
    final cells = <Widget>[];

    for (int i = 0; i < firstWeekday; i++) {
      cells.add(const SizedBox());
    }

    for (final day in days) {
      final isToday = day.year == today.year &&
          day.month == today.month &&
          day.day == today.day;
      final isSelected = selectedDay != null &&
          day.year == selectedDay!.year &&
          day.month == selectedDay!.month &&
          day.day == selectedDay!.day;
      final weekdayIndex = (firstWeekday + day.day - 1) % 7;
      final isSaturday = weekdayIndex == 6;
      final holiday = holidayRepo.getHoliday(day);

      cells.add(DayCell(
        date: day,
        isToday: isToday,
        isSaturday: isSaturday,
        isSelected: isSelected,
        holiday: holiday,
        isEnglish: isEnglish,
        onTap: () => ref.read(selectedDayProvider.notifier).select(day),
      ));
    }

    return GridView.count(
      crossAxisCount: 7,
      padding: const EdgeInsets.all(4),
      childAspectRatio: 0.85,
      children: cells,
    );
  }
}

class _DayDetailPanel extends StatelessWidget {
  final NepaliDateTime day;
  final dynamic holidayRepo;
  final bool isEnglish;

  const _DayDetailPanel({
    required this.day,
    required this.holidayRepo,
    required this.isEnglish,
  });

  @override
  Widget build(BuildContext context) {
    final holiday = holidayRepo.getHoliday(day);
    final adDate = day.toDateTime();
    final panchang = PanchangService.compute(adDate);

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => showPanchangSheet(context, day, isEnglish),
      child: Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: AppTheme.surface(context),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 8,
            offset: const Offset(0, -2),
          )
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              // BS date big
              Text(
                isEnglish
                    ? '${AppStrings.englishMonths[day.month - 1]} ${day.day}, ${day.year} BS'
                    : '${AppStrings.nepaliMonths[day.month - 1]} ${AppStrings.toNepaliNumeral(day.day)}, ${AppStrings.toNepaliNumeral(day.year)}',
                style: const TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.primary,
                ),
              ),
              const Spacer(),
              // AD date small
              Text(
                '${adDate.day} ${_monthName(adDate.month)} ${adDate.year}',
                style: TextStyle(fontSize: 13, color: Colors.grey[600]),
              ),
            ],
          ),
          const SizedBox(height: 6),
          if (holiday != null)
            Row(
              children: [
                const Icon(Icons.celebration,
                    size: 14, color: AppTheme.holidayColor),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    isEnglish ? holiday.nameEn : holiday.name,
                    style: const TextStyle(
                      color: AppTheme.holidayColor,
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                    ),
                  ),
                ),
              ],
            )
          else
            Text(
              _weekdayName(adDate.weekday),
              style: TextStyle(fontSize: 13, color: Colors.grey[500]),
            ),
          const SizedBox(height: 4),
          Text(
            isEnglish
                ? '${panchang.pakshaEn} ${panchang.tithiEn}'
                : '${panchang.pakshaNe} ${panchang.tithiNe}',
            style: TextStyle(fontSize: 12, color: Colors.grey[600]),
          ),
          const SizedBox(height: 6),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              Text(
                isEnglish ? 'Panchang' : 'पञ्चाङ्ग',
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.primary,
                ),
              ),
              const Icon(Icons.chevron_right,
                  size: 16, color: AppTheme.primary),
            ],
          ),
        ],
      ),
      ),
    );
  }

  String _monthName(int m) => const [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
      ][m - 1];

  String _weekdayName(int w) => const [
        'Monday', 'Tuesday', 'Wednesday', 'Thursday',
        'Friday', 'Saturday', 'Sunday'
      ][w - 1];
}
