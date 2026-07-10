import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The user's own rashi (zodiac index 0..11), persisted. Null if unset.
class MyRashiNotifier extends Notifier<int?> {
  static const _key = 'my_rashi';

  @override
  int? build() {
    _load();
    return null;
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final v = prefs.getInt(_key);
    if (v != null) state = v;
  }

  Future<void> set(int index) async {
    state = index;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_key, index);
  }
}

final myRashiProvider =
    NotifierProvider<MyRashiNotifier, int?>(MyRashiNotifier.new);
