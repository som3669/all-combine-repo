import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nepali_utils/nepali_utils.dart';
import '../../data/repositories/calendar_repository.dart';
import '../../data/repositories/holiday_repository.dart';
import '../../data/services/remote_config_service.dart';

final remoteConfigProvider = FutureProvider<RemoteConfig>((ref) async {
  return RemoteConfigService.fetch();
});

final holidayRepoProvider = Provider<HolidayRepository>((ref) {
  final config = ref.watch(remoteConfigProvider).value;
  if (config != null && config.holidays.isNotEmpty) {
    return HolidayRepository.withRemote(config.holidays);
  }
  return HolidayRepository();
});

final noticeBannerProvider = Provider<({String? ne, String? en})?>(
  (ref) {
    final config = ref.watch(remoteConfigProvider).value;
    if (config == null) return null;
    if (config.noticeNe == null && config.noticeEn == null) return null;
    return (ne: config.noticeNe, en: config.noticeEn);
  },
);

class SelectedDayNotifier extends Notifier<NepaliDateTime?> {
  @override
  NepaliDateTime? build() => null;
  void select(NepaliDateTime? day) => state = day;
}

final selectedDayProvider =
    NotifierProvider<SelectedDayNotifier, NepaliDateTime?>(
  SelectedDayNotifier.new,
);

final calendarRepoProvider = Provider((_) => CalendarRepository());

class SelectedMonthNotifier extends Notifier<NepaliDateTime> {
  @override
  NepaliDateTime build() => NepaliDateTime.now();

  void previous() {
    var month = state.month - 1;
    var year = state.year;
    if (month < 1) {
      month = 12;
      year--;
    }
    state = NepaliDateTime(year, month);
  }

  void next() {
    var month = state.month + 1;
    var year = state.year;
    if (month > 12) {
      month = 1;
      year++;
    }
    state = NepaliDateTime(year, month);
  }

  void goToToday() => state = NepaliDateTime.now();
  void goTo(int year, int month) => state = NepaliDateTime(year, month);
}

final selectedMonthProvider =
    NotifierProvider<SelectedMonthNotifier, NepaliDateTime>(
  SelectedMonthNotifier.new,
);

final calendarDaysProvider = Provider<List<NepaliDateTime>>((ref) {
  final selected = ref.watch(selectedMonthProvider);
  final repo = ref.read(calendarRepoProvider);
  return repo.getDaysInMonth(selected.year, selected.month);
});

final firstWeekdayProvider = Provider<int>((ref) {
  final selected = ref.watch(selectedMonthProvider);
  final repo = ref.read(calendarRepoProvider);
  return repo.getFirstWeekday(selected.year, selected.month);
});
