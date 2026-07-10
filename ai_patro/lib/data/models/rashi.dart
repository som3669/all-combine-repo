/// The 12 zodiac signs (rashi) used for daily horoscopes.
class Rashi {
  final int index; // 0..11
  final String ne;
  final String en;
  final String symbol; // emoji
  final String rangeEn; // western date range, for display

  const Rashi(this.index, this.ne, this.en, this.symbol, this.rangeEn);

  static const all = <Rashi>[
    Rashi(0, 'मेष', 'Aries', '♈', 'Mar 21 – Apr 19'),
    Rashi(1, 'वृष', 'Taurus', '♉', 'Apr 20 – May 20'),
    Rashi(2, 'मिथुन', 'Gemini', '♊', 'May 21 – Jun 20'),
    Rashi(3, 'कर्कट', 'Cancer', '♋', 'Jun 21 – Jul 22'),
    Rashi(4, 'सिंह', 'Leo', '♌', 'Jul 23 – Aug 22'),
    Rashi(5, 'कन्या', 'Virgo', '♍', 'Aug 23 – Sep 22'),
    Rashi(6, 'तुला', 'Libra', '♎', 'Sep 23 – Oct 22'),
    Rashi(7, 'वृश्चिक', 'Scorpio', '♏', 'Oct 23 – Nov 21'),
    Rashi(8, 'धनु', 'Sagittarius', '♐', 'Nov 22 – Dec 21'),
    Rashi(9, 'मकर', 'Capricorn', '♑', 'Dec 22 – Jan 19'),
    Rashi(10, 'कुम्भ', 'Aquarius', '♒', 'Jan 20 – Feb 18'),
    Rashi(11, 'मीन', 'Pisces', '♓', 'Feb 19 – Mar 20'),
  ];
}
