import 'package:flutter/material.dart';
import 'package:nepali_utils/nepali_utils.dart';
import '../../core/constants/app_strings.dart';
import '../../core/theme/app_theme.dart';
import '../../data/repositories/holiday_repository.dart';

class DayCell extends StatelessWidget {
  final NepaliDateTime date;
  final bool isToday;
  final bool isSaturday;
  final bool isSelected;
  final Holiday? holiday;
  final bool isEnglish;
  final VoidCallback onTap;

  const DayCell({
    super.key,
    required this.date,
    required this.isToday,
    required this.isSaturday,
    required this.isSelected,
    required this.onTap,
    this.holiday,
    this.isEnglish = false,
  });

  @override
  Widget build(BuildContext context) {
    final isHoliday = holiday != null;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final normalColor =
        dark ? Colors.white.withValues(alpha: 0.90) : AppTheme.weekdayColor;
    final textColor =
        (isSaturday || isHoliday) ? AppTheme.holidayColor : normalColor;
    final adDay = date.toDateTime().day;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.all(2),
        decoration: BoxDecoration(
          color: isToday
              ? (dark
                  ? AppTheme.primary.withValues(alpha: 0.28)
                  : AppTheme.todayHighlight)
              : isSelected
                  ? (dark
                      ? Colors.white.withValues(alpha: 0.12)
                      : Colors.grey.shade200)
                  : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          border: isToday
              ? Border.all(color: AppTheme.primary, width: 1.5)
              : isSelected
                  ? Border.all(
                      color: dark ? Colors.white24 : Colors.grey.shade400)
                  : null,
        ),
        child: Stack(
          children: [
            // BS numeral — centered
            Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    isEnglish ? date.day.toString() : AppStrings.toNepaliNumeral(date.day),
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight:
                          isToday ? FontWeight.bold : FontWeight.normal,
                      color: textColor,
                    ),
                  ),
                  if (isHoliday)
                    Container(
                      width: 4,
                      height: 4,
                      decoration: const BoxDecoration(
                        color: AppTheme.holidayColor,
                        shape: BoxShape.circle,
                      ),
                    ),
                ],
              ),
            ),
            // AD date — bottom right corner
            Positioned(
              bottom: 2,
              right: 3,
              child: Text(
                '$adDay',
                style: TextStyle(
                  fontSize: 8,
                  color: textColor.withValues(alpha: 0.6),
                  fontWeight: FontWeight.normal,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
