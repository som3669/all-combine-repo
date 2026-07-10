import 'package:nepali_utils/nepali_utils.dart';

class NepaliDateModel {
  final NepaliDateTime bs;
  final DateTime ad;
  final String tithiName;
  final bool isHoliday;
  final String? eventName;

  const NepaliDateModel({
    required this.bs,
    required this.ad,
    this.tithiName = '',
    this.isHoliday = false,
    this.eventName,
  });
}
