import 'package:flutter_riverpod/flutter_riverpod.dart';

enum AppLanguage { nepali, english }

class LanguageNotifier extends Notifier<AppLanguage> {
  @override
  AppLanguage build() => AppLanguage.nepali;

  void toggle() => state =
      state == AppLanguage.nepali ? AppLanguage.english : AppLanguage.nepali;
}

final languageProvider =
    NotifierProvider<LanguageNotifier, AppLanguage>(LanguageNotifier.new);
