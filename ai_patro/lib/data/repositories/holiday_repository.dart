import 'package:nepali_utils/nepali_utils.dart';

class Holiday {
  final String name;
  final String nameEn;
  Holiday(this.name, this.nameEn);
}

class HolidayRepository {
  // Bundled fallback — updated via app releases
  static final Map<String, Holiday> _bundled = {
    // 2082
    '2082-1-1': Holiday('वैशाख १ गते (नयाँ वर्ष)', 'New Year (Baisakh 1)'),
    '2082-1-11': Holiday('जनक पूर्णिमा', 'Janaki Purnima'),
    '2082-2-15': Holiday('बुद्ध जयन्ती', 'Buddha Jayanti'),
    '2082-3-15': Holiday('साउने संक्रान्ति', 'Saune Sankranti'),
    '2082-4-4': Holiday('जनाई पूर्णिमा', 'Janai Purnima'),
    '2082-4-5': Holiday('गाईजात्रा', 'Gai Jatra'),
    '2082-5-5': Holiday('तिहार (लक्ष्मी पूजा)', 'Tihar - Laxmi Puja'),
    '2082-5-6': Holiday('तिहार (गोवर्धन पूजा)', 'Tihar - Govardhan Puja'),
    '2082-5-7': Holiday('भाइटीका', 'Bhai Tika'),
    '2082-6-16': Holiday('छठ पर्व', 'Chhath Parva'),
    '2082-9-1': Holiday('प्रजातन्त्र दिवस', 'Democracy Day'),
    '2082-9-11': Holiday('राष्ट्रिय एकता दिवस', 'National Unity Day'),
    '2082-10-1': Holiday('महाशिवरात्री', 'Maha Shivaratri'),
    '2082-11-7': Holiday('फागुपूर्णिमा (होली)', 'Fagu Purnima (Holi)'),
    '2082-12-7': Holiday('घोडेजात्रा', 'Ghode Jatra'),
    // 2083 — official public holidays per Hamro Patro (Baisakh 1, 2083 = 14 Apr 2026)
    '2083-1-1': Holiday('नयाँ वर्ष (मेष संक्रान्ति)', 'New Year / Mesh Sankranti'),
    '2083-1-18': Holiday('बुद्ध जयन्ती / मजदुर दिवस', 'Buddha Jayanti / Labour Day'),
    '2083-2-14': Holiday('बकर ईद', 'Bakar Eid'),
    '2083-2-15': Holiday('गणतन्त्र दिवस', 'Republic Day'),
    '2083-3-6': Holiday('भोटो जात्रा / सिथी नखः', 'Bhoto Jatra / Sithi Nakha'),
    '2083-5-12': Holiday('जनै पूर्णिमा / रक्षाबन्धन', 'Janai Purnima / Rakshya Bandhan'),
    '2083-5-13': Holiday('गाईजात्रा', 'Gai Jatra'),
    '2083-5-19': Holiday('श्रीकृष्ण जन्माष्टमी', 'Krishna Janmashtami'),
    '2083-5-29': Holiday('हरितालिका तीज', 'Haritalika Teej'),
    '2083-6-3': Holiday('संविधान दिवस', 'Constitution Day'),
    '2083-6-9': Holiday('इन्द्रजात्रा', 'Indra Jatra'),
    '2083-6-18': Holiday('नवमी श्राद्ध', 'Nawami Shraddha'),
    '2083-6-25': Holiday('घटस्थापना', 'Ghatasthapana'),
    '2083-6-31': Holiday('फूलपाती', 'Fulpati'),
    '2083-7-1': Holiday('महाअष्टमी / तुला संक्रान्ति', 'Maha Ashtami / Tula Sankranti'),
    '2083-7-2': Holiday('दशैं बिदा', 'Dashain Holiday'),
    '2083-7-3': Holiday('महानवमी', 'Maha Nawami'),
    '2083-7-4': Holiday('विजया दशमी', 'Vijaya Dashami'),
    '2083-7-22': Holiday('लक्ष्मी पूजा / कुकुर तिहार', 'Laxmi Puja / Kukur Tihar'),
    '2083-7-23': Holiday('गाई पूजा / तिहार बिदा', 'Gai Puja / Tihar Holiday'),
    '2083-7-24': Holiday('गोवर्धन पूजा / म्ह पूजा', 'Govardhan Puja / Mha Puja'),
    '2083-7-25': Holiday('भाइटीका', 'Bhai Tika'),
    '2083-7-29': Holiday('छठ पर्व', 'Chhath Parva'),
    '2083-8-8': Holiday('गुरु नानक जयन्ती', 'Guru Nanak Jayanti'),
    '2083-8-18': Holiday('उधौली पर्व', 'Udhauli Parva'),
    '2083-9-9': Holiday('योमरी पुन्ही', 'Yomari Punhi'),
    '2083-9-10': Holiday('क्रिसमस', 'Christmas Day'),
    '2083-9-15': Holiday('तमु ल्होसार', 'Tamu Lhosar'),
    '2083-9-27': Holiday('पृथ्वी जयन्ती', 'Prithivi Jayanti'),
    '2083-10-1': Holiday('माघे संक्रान्ति', 'Makar Sankranti'),
    '2083-10-16': Holiday('शहीद दिवस', 'Sahid Diwas'),
    '2083-10-24': Holiday('सोनाम ल्होसार', 'Sonam Lhosar'),
    '2083-10-28': Holiday('बसन्त पञ्चमी', 'Basanta Panchami'),
    '2083-11-7': Holiday('प्रजातन्त्र दिवस', 'Democracy Day'),
    '2083-11-22': Holiday('महाशिवरात्री / सेना दिवस', 'Maha Shivaratri / Army Day'),
    '2083-11-24': Holiday('अन्तर्राष्ट्रिय नारी दिवस', "International Women's Day"),
    '2083-11-25': Holiday('ग्याल्पो ल्होसार', 'Gyalpo Lhosar'),
    '2083-12-7': Holiday('फागु पूर्णिमा (होली)', 'Fagu Purnima / Holi'),
    '2083-12-23': Holiday('घोडेजात्रा', 'Ghode Jatra'),
  };

  // Merged map: remote overrides bundled
  final Map<String, Holiday> _holidays;

  HolidayRepository({Map<String, Holiday> remote = const {}})
      : _holidays = {..._bundled, ...remote};

  // Build from remote JSON map (key: 'YYYY-M-D', value: {ne, en})
  factory HolidayRepository.withRemote(Map<String, dynamic> remoteJson) {
    final remote = <String, Holiday>{};
    remoteJson.forEach((key, value) {
      if (value is Map) {
        remote[key] = Holiday(
          value['ne'] as String? ?? '',
          value['en'] as String? ?? '',
        );
      }
    });
    return HolidayRepository(remote: remote);
  }

  Holiday? getHoliday(NepaliDateTime date) {
    final key = '${date.year}-${date.month}-${date.day}';
    return _holidays[key];
  }

  bool isHoliday(NepaliDateTime date) => getHoliday(date) != null;

  List<({NepaliDateTime bsDate, Holiday holiday})> allHolidaysSorted() {
    final entries = _holidays.entries.toList()
      ..sort((a, b) {
        final ap = a.key.split('-').map(int.parse).toList();
        final bp = b.key.split('-').map(int.parse).toList();
        for (int i = 0; i < 3; i++) {
          final c = ap[i].compareTo(bp[i]);
          if (c != 0) return c;
        }
        return 0;
      });
    return entries.map((e) {
      final p = e.key.split('-').map(int.parse).toList();
      return (
        bsDate: NepaliDateTime(p[0], p[1], p[2]),
        holiday: e.value,
      );
    }).toList();
  }
}
