class AppStrings {
  static const appName = 'AI Patro';

  static const List<String> nepaliMonths = [
    'बैशाख', 'जेठ', 'असार', 'श्रावण',
    'भाद्र', 'आश्विन', 'कार्तिक', 'मंसिर',
    'पौष', 'माघ', 'फाल्गुण', 'चैत्र',
  ];

  static const List<String> englishMonths = [
    'Baisakh', 'Jestha', 'Ashadh', 'Shrawan',
    'Bhadra', 'Ashwin', 'Kartik', 'Mangsir',
    'Poush', 'Magh', 'Falgun', 'Chaitra',
  ];

  static const List<String> nepaliDays = [
    'आइत', 'सोम', 'मंगल', 'बुध', 'बिही', 'शुक्र', 'शनि',
  ];

  static const List<String> englishDays = [
    'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat',
  ];

  static const List<String> nepaliNumerals = [
    '०', '१', '२', '३', '४', '५', '६', '७', '८', '९',
  ];

  static String toNepaliNumeral(int n) {
    return n.toString().split('').map((d) {
      final idx = int.tryParse(d);
      return idx != null ? nepaliNumerals[idx] : d;
    }).join();
  }
}
