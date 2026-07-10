import 'dart:math';

/// A computed panchang for a given day. Every field here is derived from
/// astronomy — NOT from an LLM. The AI layer only *explains* these values.
class Panchang {
  final String tithiNe;
  final String tithiEn;
  final String pakshaNe;
  final String pakshaEn;
  final String nakshatraNe;
  final String nakshatraEn;
  final String yogaNe;
  final String yogaEn;
  final String karanaNe;
  final String karanaEn;

  /// "HH:MM" local Nepal time, or "—" if not applicable.
  final String sunrise;
  final String sunset;

  /// Rahukaal (inauspicious period) as "HH:MM – HH:MM".
  final String rahuKaal;

  const Panchang({
    required this.tithiNe,
    required this.tithiEn,
    required this.pakshaNe,
    required this.pakshaEn,
    required this.nakshatraNe,
    required this.nakshatraEn,
    required this.yogaNe,
    required this.yogaEn,
    required this.karanaNe,
    required this.karanaEn,
    required this.sunrise,
    required this.sunset,
    required this.rahuKaal,
  });

  /// Compact, English, LLM-friendly summary used to *ground* the AI explainer.
  String get summaryEn =>
      'Paksha: $pakshaEn, Tithi: $tithiEn, Nakshatra: $nakshatraEn, '
      'Yoga: $yogaEn, Karana: $karanaEn, Sunrise: $sunrise, Sunset: $sunset, '
      'Rahukaal: $rahuKaal';
}

/// Deterministic panchang computation.
///
/// Uses Paul Schlyter's low-precision sun & moon ephemeris (accurate to a few
/// arc-minutes) plus the main lunar perturbation terms, then Lahiri ayanamsa
/// for the sidereal (nirayana) frame used by Nepali/Vedic panchang.
///
/// Computed at ~noon Nepal time (UTC+5:45). This gives the tithi/nakshatra that
/// is current for most of the daylight day; it is a well-labelled approximation,
/// not a substitute for a surya-siddhanta ephemeris.
class PanchangService {
  // ── Name tables ──────────────────────────────────────────────────────────

  static const _tithiNe = [
    'प्रतिपदा', 'द्वितीया', 'तृतीया', 'चतुर्थी', 'पञ्चमी',
    'षष्ठी', 'सप्तमी', 'अष्टमी', 'नवमी', 'दशमी',
    'एकादशी', 'द्वादशी', 'त्रयोदशी', 'चतुर्दशी',
  ];
  static const _tithiEn = [
    'Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami',
    'Shashthi', 'Saptami', 'Ashtami', 'Navami', 'Dashami',
    'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi',
  ];

  static const _nakNe = [
    'अश्विनी', 'भरणी', 'कृत्तिका', 'रोहिणी', 'मृगशिरा', 'आर्द्रा',
    'पुनर्वसु', 'पुष्य', 'आश्लेषा', 'मघा', 'पूर्वफाल्गुनी', 'उत्तरफाल्गुनी',
    'हस्त', 'चित्रा', 'स्वाती', 'विशाखा', 'अनुराधा', 'ज्येष्ठा',
    'मूल', 'पूर्वाषाढा', 'उत्तराषाढा', 'श्रवण', 'धनिष्ठा', 'शतभिषा',
    'पूर्वभाद्रपद', 'उत्तरभाद्रपद', 'रेवती',
  ];
  static const _nakEn = [
    'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra',
    'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni',
    'Uttara Phalguni', 'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha',
    'Jyeshtha', 'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana',
    'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada', 'Uttara Bhadrapada',
    'Revati',
  ];

  static const _yogaNe = [
    'विष्कम्भ', 'प्रीति', 'आयुष्मान', 'सौभाग्य', 'शोभन', 'अतिगण्ड',
    'सुकर्मा', 'धृति', 'शूल', 'गण्ड', 'वृद्धि', 'ध्रुव', 'व्याघात',
    'हर्षण', 'वज्र', 'सिद्धि', 'व्यतिपात', 'वरीयान', 'परिघ', 'शिव',
    'सिद्ध', 'साध्य', 'शुभ', 'शुक्ल', 'ब्रह्म', 'इन्द्र', 'वैधृति',
  ];
  static const _yogaEn = [
    'Vishkambha', 'Priti', 'Ayushman', 'Saubhagya', 'Shobhana', 'Atiganda',
    'Sukarma', 'Dhriti', 'Shula', 'Ganda', 'Vriddhi', 'Dhruva', 'Vyaghata',
    'Harshana', 'Vajra', 'Siddhi', 'Vyatipata', 'Variyana', 'Parigha', 'Shiva',
    'Siddha', 'Sadhya', 'Shubha', 'Shukla', 'Brahma', 'Indra', 'Vaidhriti',
  ];

  static const _karMovableNe = [
    'बव', 'बालव', 'कौलव', 'तैतिल', 'गर', 'वणिज', 'विष्टि',
  ];
  static const _karMovableEn = [
    'Bava', 'Balava', 'Kaulava', 'Taitila', 'Gara', 'Vanija', 'Vishti',
  ];

  // ── Public API ─────────────────────────────────────────────────────────

  /// The 27 nakshatras (Nepali + English), for pickers.
  static List<({String ne, String en})> get nakshatras =>
      List.generate(27, (i) => (ne: _nakNe[i], en: _nakEn[i]));

  static Panchang compute(DateTime date) {
    // Noon Nepal time (UTC+5:45) == 06:15 UT.
    final utc = DateTime.utc(date.year, date.month, date.day, 6, 15);
    final jd = _julianDay(utc);
    final d = jd - 2451543.5; // Schlyter's day number (epoch 1999-12-31 00:00 UT)

    final sun = _sunLongitude(d);
    final moon = _moonLongitude(d);
    final ay = _ayanamsa(jd);

    final moonSid = _rev(moon - ay);
    final sunSid = _rev(sun - ay);

    // Tithi — from moon-sun elongation (ayanamsa cancels).
    final elong = _rev(moon - sun);
    final tIdx = (elong / 12).floor(); // 0..29
    final shukla = tIdx < 15;
    final within = tIdx % 15; // 0..14
    final String tithiNe;
    final String tithiEn;
    if (within == 14) {
      tithiNe = shukla ? 'पूर्णिमा' : 'औंसी';
      tithiEn = shukla ? 'Purnima' : 'Amavasya';
    } else {
      tithiNe = _tithiNe[within];
      tithiEn = _tithiEn[within];
    }

    // Nakshatra — sidereal moon longitude / (360/27).
    final nak = (moonSid / (360 / 27)).floor() % 27;

    // Yoga — sidereal (sun + moon) / (360/27).
    final yoga = (_rev(sunSid + moonSid) / (360 / 27)).floor() % 27;

    // Karana — half-tithi index 0..59.
    final h = (elong / 6).floor();
    final karana = _karana(h);

    // Sunrise / sunset (Kathmandu) and Rahukaal.
    final riseMin = _sunEventMinutes(date: date, sunrise: true);
    final setMin = _sunEventMinutes(date: date, sunrise: false);
    final rahu = _rahuKaal(date, riseMin, setMin);

    return Panchang(
      tithiNe: tithiNe,
      tithiEn: tithiEn,
      pakshaNe: shukla ? 'शुक्ल पक्ष' : 'कृष्ण पक्ष',
      pakshaEn: shukla ? 'Shukla Paksha' : 'Krishna Paksha',
      nakshatraNe: _nakNe[nak],
      nakshatraEn: _nakEn[nak],
      yogaNe: _yogaNe[yoga],
      yogaEn: _yogaEn[yoga],
      karanaNe: karana.$1,
      karanaEn: karana.$2,
      sunrise: _fmt(riseMin),
      sunset: _fmt(setMin),
      rahuKaal: rahu,
    );
  }

  // ── Sunrise / sunset (Kathmandu) ──────────────────────────────────────
  // Classic "Almanac for Computers" sunrise/sunset algorithm.
  static const _lat = 27.7172; // Kathmandu
  static const _lng = 85.3240;
  static const _tz = 5.75; // Nepal Standard Time (UTC+5:45)

  /// Local-time minutes from midnight for sunrise/sunset, or -1 if none.
  static double _sunEventMinutes({
    required DateTime date,
    required bool sunrise,
  }) {
    final n = date.difference(DateTime(date.year, 1, 1)).inDays + 1;
    final lngHour = _lng / 15.0;
    final t = sunrise ? n + ((6 - lngHour) / 24) : n + ((18 - lngHour) / 24);

    final m = 0.9856 * t - 3.289; // sun's mean anomaly
    var l = m +
        1.916 * _sind(m) +
        0.020 * _sind(2 * m) +
        282.634; // true longitude
    l = _rev(l);

    var ra = _rev(atan(0.91764 * tan(l * pi / 180)) * 180 / pi);
    // Put RA in the same quadrant as L.
    final lQuad = (l / 90).floorToDouble() * 90;
    final raQuad = (ra / 90).floorToDouble() * 90;
    ra = (ra + (lQuad - raQuad)) / 15; // to hours

    final sinDec = 0.39782 * _sind(l);
    final cosDec = cos(asin(sinDec));

    const zenith = 90.833; // includes atmospheric refraction
    final cosH =
        (_cosd(zenith) - sinDec * _sind(_lat)) / (cosDec * _cosd(_lat));
    if (cosH > 1 || cosH < -1) return -1; // sun never rises/sets

    var hh = sunrise
        ? 360 - acos(cosH) * 180 / pi
        : acos(cosH) * 180 / pi;
    hh = hh / 15;

    final localMean = hh + ra - 0.06571 * t - 6.622;
    var ut = localMean - lngHour;
    ut = _rev24(ut);
    final local = _rev24(ut + _tz);
    return local * 60;
  }

  static String _fmt(double minutes) {
    if (minutes < 0) return '—';
    final h = (minutes ~/ 60) % 24;
    final m = (minutes % 60).round();
    return '${h.toString().padLeft(2, '0')}:${m.toString().padLeft(2, '0')}';
  }

  static double _rev24(double x) {
    final r = x % 24;
    return r < 0 ? r + 24 : r;
  }

  // Rahukaal: daytime split into 8 parts; the inauspicious slot depends on
  // the weekday.
  static String _rahuKaal(DateTime date, double rise, double set) {
    if (rise < 0 || set < 0 || set <= rise) return '—';
    // DateTime.weekday: Mon=1..Sun=7 → segment index (1..8).
    const seg = {1: 2, 2: 7, 3: 5, 4: 6, 5: 4, 6: 3, 7: 8};
    final idx = seg[date.weekday]!;
    final part = (set - rise) / 8;
    final start = rise + (idx - 1) * part;
    final end = start + part;
    return '${_fmt(start)} – ${_fmt(end)}';
  }

  /// A lightweight birth chart. Sign/nakshatra indices are 0-based.
  /// [lagna] (ascendant) is approximate — it needs accurate birth time & place.
  static ({int moonRashi, int nakshatra, int sunRashi, int lagna}) computeChart(
    DateTime birthNepalLocal, {
    double latitude = _lat,
    double longitude = _lng,
  }) {
    // Nepal local (UTC+5:45) → UT.
    final ut = birthNepalLocal.subtract(const Duration(hours: 5, minutes: 45));
    final utc = DateTime.utc(ut.year, ut.month, ut.day, ut.hour, ut.minute);
    final jd = _julianDay(utc);
    final d = jd - 2451543.5;

    final ay = _ayanamsa(jd);
    final moonSid = _rev(_moonLongitude(d) - ay);
    final sunSid = _rev(_sunLongitude(d) - ay);

    // Ascendant (lagna).
    final gmst = _rev(280.46061837 + 360.98564736629 * (jd - 2451545.0));
    final ramc = _rev(gmst + longitude); // local sidereal time in degrees
    const eps = 23.4397;
    final ramcR = ramc * pi / 180;
    final epsR = eps * pi / 180;
    final latR = latitude * pi / 180;
    var ascTrop = atan2(
          -cos(ramcR),
          sin(ramcR) * cos(epsR) + tan(latR) * sin(epsR),
        ) *
        180 /
        pi;
    ascTrop = _rev(ascTrop);
    final ascSid = _rev(ascTrop - ay);

    return (
      moonRashi: (moonSid / 30).floor() % 12,
      nakshatra: (moonSid / (360 / 27)).floor() % 27,
      sunRashi: (sunSid / 30).floor() % 12,
      lagna: (ascSid / 30).floor() % 12,
    );
  }

  // ── Karana mapping ───────────────────────────────────────────────────────

  static (String, String) _karana(int h) {
    // 4 fixed karanas surround the 56 movable ones across 60 half-tithis.
    if (h == 0) return ('किंस्तुघ्न', 'Kimstughna');
    if (h == 57) return ('शकुनि', 'Shakuni');
    if (h == 58) return ('चतुष्पद', 'Chatushpada');
    if (h == 59) return ('नाग', 'Naga');
    final idx = (h - 1) % 7;
    return (_karMovableNe[idx], _karMovableEn[idx]);
  }

  // ── Astronomy helpers ──────────────────────────────────────────────────

  static double _rev(double x) {
    final r = x % 360;
    return r < 0 ? r + 360 : r;
  }

  static double _sind(double deg) => sin(deg * pi / 180);
  static double _cosd(double deg) => cos(deg * pi / 180);

  static double _julianDay(DateTime u) {
    int y = u.year;
    int m = u.month;
    final day = u.day + (u.hour + u.minute / 60 + u.second / 3600) / 24;
    if (m <= 2) {
      y -= 1;
      m += 12;
    }
    final a = (y / 100).floor();
    final b = 2 - a + (a / 4).floor();
    return (365.25 * (y + 4716)).floor() +
        (30.6001 * (m + 1)).floor() +
        day +
        b -
        1524.5;
  }

  /// Lahiri ayanamsa (approx): 23.853° at J2000, +50.29"/yr.
  static double _ayanamsa(double jd) {
    final years = (jd - 2451545.0) / 365.25;
    return 23.853 + 0.013972 * years;
  }

  static double _sunLongitude(double d) {
    final w = 282.9404 + 4.70935e-5 * d;
    final m = _rev(356.0470 + 0.9856002585 * d);
    final e = 0.016709 - 1.151e-9 * d;
    final eAnom =
        m + (180 / pi) * e * _sind(m) * (1 + e * _cosd(m));
    final xv = _cosd(eAnom) - e;
    final yv = sqrt(1 - e * e) * _sind(eAnom);
    final v = atan2(yv, xv) * 180 / pi;
    return _rev(v + w);
  }

  static double _moonLongitude(double d) {
    final n = _rev(125.1228 - 0.0529538083 * d);
    const i = 5.1454;
    final w = _rev(318.0634 + 0.1643573223 * d);
    const e = 0.054900;
    final m = _rev(115.3654 + 13.0649929509 * d);

    // Eccentric anomaly (iterate to converge for the Moon's larger e).
    double eAnom = m + (180 / pi) * e * _sind(m) * (1 + e * _cosd(m));
    for (var k = 0; k < 3; k++) {
      eAnom = eAnom -
          (eAnom - (180 / pi) * e * _sind(eAnom) - m) /
              (1 - e * _cosd(eAnom));
    }

    final x = _cosd(eAnom) - e;
    final y = sqrt(1 - e * e) * _sind(eAnom);
    final r = sqrt(x * x + y * y);
    final v = _rev(atan2(y, x) * 180 / pi);

    // Ecliptic longitude before perturbations.
    final xeclip =
        r * (_cosd(n) * _cosd(v + w) - _sind(n) * _sind(v + w) * _cosd(i));
    final yeclip =
        r * (_sind(n) * _cosd(v + w) + _cosd(n) * _sind(v + w) * _cosd(i));
    double lon = _rev(atan2(yeclip, xeclip) * 180 / pi);

    // Perturbation arguments.
    final ms = _rev(356.0470 + 0.9856002585 * d); // sun mean anomaly
    final ws = 282.9404 + 4.70935e-5 * d;
    final ls = _rev(ms + ws); // sun mean longitude
    final lm = _rev(n + w + m); // moon mean longitude
    final dd = _rev(lm - ls); // mean elongation
    final f = _rev(lm - n); // argument of latitude

    lon += -1.274 * _sind(m - 2 * dd); // evection
    lon += 0.658 * _sind(2 * dd); // variation
    lon += -0.186 * _sind(ms); // yearly equation
    lon += -0.059 * _sind(2 * m - 2 * dd);
    lon += -0.057 * _sind(m - 2 * dd + ms);
    lon += 0.053 * _sind(m + 2 * dd);
    lon += 0.046 * _sind(2 * dd - ms);
    lon += 0.041 * _sind(m - ms);
    lon += -0.035 * _sind(dd); // parallactic equation
    lon += -0.031 * _sind(m + ms);
    lon += -0.015 * _sind(2 * f - 2 * dd);
    lon += 0.011 * _sind(m - 4 * dd);

    return _rev(lon);
  }
}
