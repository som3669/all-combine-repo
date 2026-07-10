import 'package:flutter/material.dart';

class AppTheme {
  static const Color primary = Color(0xFF3858E9);
  static const Color onPrimary = Colors.white;
  static const Color todayHighlight = Color(0xFFEEF0FD);
  static const Color holidayColor = Color(0xFFD32F2F);
  static const Color saturdayColor = Color(0xFFB71C1C);
  static const Color weekdayColor = Color(0xFF212121);

  static ThemeData get light => ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: primary),
        useMaterial3: true,
        fontFamily: 'Mukta',
        appBarTheme: const AppBarTheme(
          backgroundColor: primary,
          foregroundColor: onPrimary,
          elevation: 0,
        ),
      );

  static ThemeData get dark => ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: primary,
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
        fontFamily: 'Mukta',
        scaffoldBackgroundColor: const Color(0xFF121212),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF1E2233),
          foregroundColor: onPrimary,
          elevation: 0,
        ),
      );

  /// Surface color for elevated panels/sheets, adapting to the theme.
  static Color surface(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark
          ? const Color(0xFF1E1E1E)
          : Colors.white;

  /// Primary body text color, adapting to the theme.
  static Color bodyText(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark
          ? Colors.white.withValues(alpha: 0.92)
          : Colors.black87;
}
