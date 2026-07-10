import 'package:nepali_utils/nepali_utils.dart';
import 'panchang_service.dart';

/// A ceremony type and the nakshatras traditionally considered auspicious for it.
class MuhuratEvent {
  final String ne;
  final String en;
  final Set<String> goodNakshatras; // English names

  const MuhuratEvent(this.ne, this.en, this.goodNakshatras);

  static const marriage = MuhuratEvent('विवाह', 'Marriage', {
    'Rohini', 'Mrigashira', 'Magha', 'Uttara Phalguni', 'Hasta', 'Swati',
    'Anuradha', 'Mula', 'Uttara Ashadha', 'Uttara Bhadrapada', 'Revati',
  });
  static const bratabandha = MuhuratEvent('व्रतबन्ध', 'Bratabandha', {
    'Ashwini', 'Rohini', 'Mrigashira', 'Punarvasu', 'Pushya', 'Hasta',
    'Chitra', 'Swati', 'Jyeshtha', 'Shravana', 'Dhanishta', 'Shatabhisha',
    'Revati',
  });
  static const grihaPravesh = MuhuratEvent('गृह प्रवेश', 'Griha Pravesh', {
    'Rohini', 'Mrigashira', 'Uttara Phalguni', 'Chitra', 'Anuradha', 'Revati',
    'Uttara Ashadha', 'Uttara Bhadrapada', 'Shatabhisha',
  });
  static const mundan = MuhuratEvent('मुण्डन / पास्नी', 'Mundan / Pasni', {
    'Ashwini', 'Mrigashira', 'Punarvasu', 'Pushya', 'Hasta', 'Chitra',
    'Swati', 'Jyeshtha', 'Shravana', 'Dhanishta', 'Revati',
  });
  static const journey = MuhuratEvent('यात्रा', 'Journey', {
    'Ashwini', 'Mrigashira', 'Punarvasu', 'Pushya', 'Hasta', 'Anuradha',
    'Shravana', 'Dhanishta', 'Revati',
  });

  static const all = [marriage, bratabandha, grihaPravesh, mundan, journey];
}

class MuhuratDate {
  final NepaliDateTime bs;
  final Panchang panchang;
  const MuhuratDate(this.bs, this.panchang);
}

/// Finds auspicious dates for a ceremony by scanning a BS month with the
/// deterministic panchang engine. Rules are applied here; the AI layer only
/// explains the result — it never picks or invents dates.
class MuhuratService {
  // Rikta / inauspicious tithis avoided for ceremonies.
  static const _avoidTithi = {
    'Chaturthi', 'Ashtami', 'Navami', 'Chaturdashi', 'Amavasya',
  };

  static List<MuhuratDate> find({
    required int bsYear,
    required int bsMonth,
    required MuhuratEvent event,
  }) {
    final total = NepaliDateTime(bsYear, bsMonth).totalDays;
    final results = <MuhuratDate>[];
    for (var d = 1; d <= total; d++) {
      final bs = NepaliDateTime(bsYear, bsMonth, d);
      final p = PanchangService.compute(bs.toDateTime());
      final goodNak = event.goodNakshatras.contains(p.nakshatraEn);
      final okTithi = !_avoidTithi.contains(p.tithiEn);
      // Marriage/Bratabandha are typically avoided in Krishna Paksha's later half.
      if (goodNak && okTithi) {
        results.add(MuhuratDate(bs, p));
      }
    }
    return results;
  }
}
