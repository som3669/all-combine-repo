import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:home_widget/home_widget.dart';
import 'package:nepali_utils/nepali_utils.dart';
import 'core/theme/app_theme.dart';
import 'core/providers/theme_provider.dart';
import 'core/constants/app_strings.dart';
import 'data/services/ai_service.dart';
import 'data/services/notification_service.dart';
import 'presentation/calendar/calendar_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Android 15 (SDK 35+) forces edge-to-edge; request it on every version so
  // the layout behaves the same everywhere. System bars stay transparent and
  // insets are handled by the app (see AiPatroApp.builder).
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    systemNavigationBarColor: Colors.transparent,
    systemNavigationBarContrastEnforced: false,
  ));
  await AiService.init();
  await _updateHomeWidget();
  // Refresh scheduled reminders in the background; don't block startup.
  NotificationService.rescheduleAll().catchError((_) {});
  runApp(const ProviderScope(child: AiPatroApp()));
}

Future<void> _updateHomeWidget() async {
  try {
    final now = NepaliDateTime.now();
    final ad = now.toDateTime();
    const adMonths = [
      'Jan','Feb','Mar','Apr','May','Jun',
      'Jul','Aug','Sep','Oct','Nov','Dec'
    ];
    await HomeWidget.saveWidgetData<String>(
        'bs_day', AppStrings.toNepaliNumeral(now.day));
    await HomeWidget.saveWidgetData<String>(
        'bs_month_year',
        '${AppStrings.nepaliMonths[now.month - 1]} ${AppStrings.toNepaliNumeral(now.year)}');
    await HomeWidget.saveWidgetData<String>(
        'ad_date', '${ad.day} ${adMonths[ad.month - 1]} ${ad.year}');
    await HomeWidget.updateWidget(androidName: 'AiPatroWidgetProvider');
  } catch (_) {}
}

class AiPatroApp extends ConsumerWidget {
  const AiPatroApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(themeProvider);
    return MaterialApp(
      title: 'AI Patro',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: themeMode,
      // Edge-to-edge: AppBars draw under the status bar (top: false), but no
      // content may sit under the gesture/navigation bar. Applied here so every
      // route, drawer, dialog and bottom sheet inherits it.
      builder: (context, child) {
        final theme = Theme.of(context);
        // Android 15 forces a transparent navigation bar, so its icons must
        // contrast with the app background, not with a bar colour we set.
        final navIcons = theme.brightness == Brightness.dark
            ? Brightness.light
            : Brightness.dark;
        return AnnotatedRegion<SystemUiOverlayStyle>(
          value: SystemUiOverlayStyle(
            systemNavigationBarColor: Colors.transparent,
            systemNavigationBarContrastEnforced: false,
            systemNavigationBarIconBrightness: navIcons,
          ),
          child: ColoredBox(
            color: theme.scaffoldBackgroundColor,
            child: SafeArea(top: false, child: child!),
          ),
        );
      },
      home: const CalendarScreen(),
    );
  }
}
