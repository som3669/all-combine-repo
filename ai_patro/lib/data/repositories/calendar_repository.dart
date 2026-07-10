import 'package:nepali_utils/nepali_utils.dart';

class CalendarRepository {
  // Returns list of NepaliDateTime for each day in given BS month/year
  List<NepaliDateTime> getDaysInMonth(int year, int month) {
    final daysCount = NepaliDateTime(year, month).totalDays;
    return List.generate(
      daysCount,
      (i) => NepaliDateTime(year, month, i + 1),
    );
  }

  // Day of week for first day of month (0=Sun)
  int getFirstWeekday(int year, int month) {
    final first = NepaliDateTime(year, month, 1);
    return first.toDateTime().weekday % 7; // Sunday = 0
  }

  NepaliDateTime get today => NepaliDateTime.now();
}
