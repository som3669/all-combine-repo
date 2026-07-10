import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nepali_utils/nepali_utils.dart';
import '../../core/theme/app_theme.dart';
import '../../core/constants/app_strings.dart';
import '../../core/providers/language_provider.dart';
import '../../presentation/calendar/calendar_provider.dart';
import '../../presentation/rashifal/rashifal_screen.dart';
import '../../presentation/assistant/assistant_screen.dart';
import '../../presentation/settings/settings_screen.dart';
import '../../presentation/converter/date_converter_screen.dart';
import '../../presentation/events/events_screen.dart';
import '../../presentation/baby_names/baby_names_screen.dart';
import '../../presentation/forex/forex_screen.dart';
import '../../presentation/muhurat/muhurat_screen.dart';
import '../../presentation/rituals/ritual_guide_screen.dart';
import '../../presentation/kundali/kundali_screen.dart';
import '../../presentation/greetings/greetings_screen.dart';
import '../../presentation/scanner/document_scanner_screen.dart';
import '../panchang/panchang_sheet.dart';
import '../tithi/tithi_patro_screen.dart';
import 'privacy_policy_screen.dart';

class AppDrawer extends ConsumerWidget {
  final bool isEnglish;
  const AppDrawer({super.key, this.isEnglish = false});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final today = NepaliDateTime.now();
    final adToday = today.toDateTime();

    return Drawer(
      child: Column(
        children: [
          // Header
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(20, 56, 20, 20),
            color: AppTheme.primary,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Icon
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(
                    Icons.calendar_month,
                    color: AppTheme.primary,
                    size: 32,
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'AI Patro',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  isEnglish
                      ? '${AppStrings.englishMonths[today.month - 1]} ${today.day}, ${today.year} BS'
                      : '${AppStrings.nepaliMonths[today.month - 1]} ${AppStrings.toNepaliNumeral(today.day)}, ${AppStrings.toNepaliNumeral(today.year)}',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.85),
                    fontSize: 13,
                  ),
                ),
                Text(
                  '${adToday.day} ${_monthName(adToday.month)} ${adToday.year}',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.7),
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 8),

          // Nav items — scrollable so nothing is cut off
          Expanded(
            child: ListView(
              padding: EdgeInsets.zero,
              children: [
                _DrawerItem(
                  icon: Icons.calendar_today,
                  label: 'क्यालेन्डर',
                  labelEn: 'Calendar',
                  selected: true,
                  onTap: () => Navigator.pop(context),
                ),
          _DrawerItem(
            icon: Icons.celebration_outlined,
            label: 'सार्वजनिक बिदाहरू',
            labelEn: 'Public Holidays',
            onTap: () {
              Navigator.pop(context);
              _showHolidays(context, ref);
            },
          ),

          const Divider(indent: 16, endIndent: 16),

          // AI features
          _DrawerItem(
            icon: Icons.auto_awesome,
            label: 'एआई सहायक',
            labelEn: 'AI Assistant',
            onTap: () {
              Navigator.pop(context);
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const AssistantScreen()),
              );
            },
          ),
          _DrawerItem(
            icon: Icons.brightness_3_outlined,
            label: 'आजको पञ्चाङ्ग',
            labelEn: 'Panchang',
            onTap: () {
              Navigator.pop(context);
              showPanchangSheet(context, today, isEnglish);
            },
          ),
          _DrawerItem(
            icon: Icons.nightlight_outlined,
            label: 'तिथि पात्रो',
            labelEn: 'Tithi Patro',
            onTap: () {
              Navigator.pop(context);
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const TithiPatroScreen()),
              );
            },
          ),
          _DrawerItem(
            icon: Icons.stars_outlined,
            label: 'राशिफल',
            labelEn: 'Rashifal',
            onTap: () {
              Navigator.pop(context);
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const RashifalScreen()),
              );
            },
          ),
          _DrawerItem(
            icon: Icons.child_care_outlined,
            label: 'नामकरण',
            labelEn: 'Baby Names',
            onTap: () {
              Navigator.pop(context);
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const BabyNamesScreen()),
              );
            },
          ),
          _DrawerItem(
            icon: Icons.event_available_outlined,
            label: 'मुहूर्त / साइत',
            labelEn: 'Muhurat / Saait',
            onTap: () {
              Navigator.pop(context);
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const MuhuratScreen()),
              );
            },
          ),
          _DrawerItem(
            icon: Icons.auto_graph_outlined,
            label: 'कुण्डली',
            labelEn: 'Kundali',
            onTap: () {
              Navigator.pop(context);
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const KundaliScreen()),
              );
            },
          ),
          _DrawerItem(
            icon: Icons.menu_book_outlined,
            label: 'पूजा विधि',
            labelEn: 'Ritual Guide',
            onTap: () {
              Navigator.pop(context);
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const RitualGuideScreen()),
              );
            },
          ),
          _DrawerItem(
            icon: Icons.card_giftcard_outlined,
            label: 'शुभकामना',
            labelEn: 'Greetings',
            onTap: () {
              Navigator.pop(context);
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const GreetingsScreen()),
              );
            },
          ),

          const Divider(indent: 16, endIndent: 16),

          // Tools
          _DrawerItem(
            icon: Icons.swap_horiz,
            label: 'मिति रूपान्तरण',
            labelEn: 'Date Converter',
            onTap: () {
              Navigator.pop(context);
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const DateConverterScreen()),
              );
            },
          ),
          _DrawerItem(
            icon: Icons.event_note_outlined,
            label: 'मेरा कार्यक्रम',
            labelEn: 'My Events',
            onTap: () {
              Navigator.pop(context);
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const EventsScreen()),
              );
            },
          ),
          _DrawerItem(
            icon: Icons.currency_exchange,
            label: 'विदेशी मुद्रा',
            labelEn: 'Forex Rates',
            onTap: () {
              Navigator.pop(context);
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const ForexScreen()),
              );
            },
          ),
          _DrawerItem(
            icon: Icons.document_scanner_outlined,
            label: 'कागजात स्क्यानर',
            labelEn: 'Document Scanner',
            onTap: () {
              Navigator.pop(context);
              Navigator.push(
                context,
                MaterialPageRoute(
                    builder: (_) => const DocumentScannerScreen()),
              );
            },
          ),

          const Divider(indent: 16, endIndent: 16),

          _DrawerItem(
            icon: Icons.settings_outlined,
            label: 'सेटिङ',
            labelEn: 'Settings',
            onTap: () {
              Navigator.pop(context);
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const SettingsScreen()),
              );
            },
          ),
          _DrawerItem(
            icon: Icons.info_outline,
            label: 'बारेमा',
            labelEn: 'About',
            onTap: () {
              Navigator.pop(context);
              _showAbout(context);
            },
          ),
          _DrawerItem(
            icon: Icons.privacy_tip_outlined,
            label: 'गोपनीयता नीति',
            labelEn: 'Privacy Policy',
            onTap: () {
              Navigator.pop(context);
              Navigator.push(
                context,
                MaterialPageRoute(
                    builder: (_) => const PrivacyPolicyScreen()),
              );
            },
          ),

              ],
            ),
          ),

          // Version
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              'AI Patro v1.2.0',
              style: TextStyle(fontSize: 11, color: Colors.grey[400]),
            ),
          ),
        ],
      ),
    );
  }

  void _showHolidays(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => Consumer(builder: (_, r, __) => const _HolidayList()),
    );
  }

  void _showAbout(BuildContext context) {
    showAboutDialog(
      context: context,
      applicationName: 'AI Patro',
      applicationVersion: '1.0.0',
      applicationIcon: const Icon(Icons.calendar_month,
          color: AppTheme.primary, size: 40),
      children: [
        const Text('Nepali Bikram Sambat calendar with public holidays.'),
        const SizedBox(height: 8),
        const Text('© 2083 BS / 2026 AD'),
        const SizedBox(height: 12),
        GestureDetector(
          onTap: () {
            Navigator.pop(context);
            Navigator.push(
              context,
              MaterialPageRoute(
                  builder: (_) => const PrivacyPolicyScreen()),
            );
          },
          child: const Text(
            'Privacy Policy',
            style: TextStyle(
              color: AppTheme.primary,
              decoration: TextDecoration.underline,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }

  String _monthName(int m) => const [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
      ][m - 1];
}

class _DrawerItem extends ConsumerWidget {
  final IconData icon;
  final String label;
  final String labelEn;
  final bool selected;
  final VoidCallback onTap;

  const _DrawerItem({
    required this.icon,
    required this.label,
    required this.labelEn,
    required this.onTap,
    this.selected = false,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isEn = ref.watch(languageProvider) == AppLanguage.english;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final iconColor = selected
        ? AppTheme.primary
        : (dark ? Colors.white70 : Colors.grey[700]);
    final textColor = selected
        ? AppTheme.primary
        : (dark ? Colors.white.withValues(alpha: 0.90) : Colors.grey[800]);
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: selected
            ? AppTheme.primary.withValues(alpha: dark ? 0.22 : 0.1)
            : Colors.transparent,
        borderRadius: BorderRadius.circular(10),
      ),
      child: ListTile(
        leading: Icon(icon, color: iconColor, size: 22),
        title: Text(
          isEn ? labelEn : label,
          style: TextStyle(
            fontSize: 15,
            fontWeight: selected ? FontWeight.bold : FontWeight.normal,
            color: textColor,
          ),
        ),
        onTap: onTap,
        dense: true,
      ),
    );
  }
}

class _HolidayList extends ConsumerWidget {
  const _HolidayList();

  static const _adMonths = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repo = ref.watch(holidayRepoProvider);
    final isEn = ref.watch(languageProvider) == AppLanguage.english;
    final holidays = repo.allHolidaysSorted();

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.6,
      maxChildSize: 0.9,
      builder: (_, controller) => Column(
        children: [
          const SizedBox(height: 12),
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.grey[300],
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            isEn ? 'Public Holidays' : 'सार्वजनिक बिदाहरू',
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          Text(
            isEn ? 'Bikram Sambat Calendar' : 'बिक्रम सम्वत् पात्रो',
            style: const TextStyle(fontSize: 12, color: Colors.grey),
          ),
          const SizedBox(height: 8),
          const Divider(),
          Expanded(
            child: holidays.isEmpty
                ? const Center(child: Text('No holidays found'))
                : ListView.builder(
                    controller: controller,
                    itemCount: holidays.length,
                    itemBuilder: (_, i) {
                      final h = holidays[i];
                      final bs = h.bsDate;
                      final ad = bs.toDateTime();

                      final bsMonthName = isEn
                          ? AppStrings.englishMonths[bs.month - 1]
                          : AppStrings.nepaliMonths[bs.month - 1];
                      final bsDay = isEn
                          ? bs.day.toString()
                          : AppStrings.toNepaliNumeral(bs.day);
                      final bsYear = isEn
                          ? bs.year.toString()
                          : AppStrings.toNepaliNumeral(bs.year);

                      final adLabel =
                          '${_adMonths[ad.month - 1]} ${ad.day}, ${ad.year}';
                      final bsLabel = '$bsMonthName $bsDay, $bsYear BS';

                      return ListTile(
                        leading: const Padding(
                          padding: EdgeInsets.only(top: 4),
                          child: Icon(Icons.circle,
                              size: 8, color: AppTheme.primary),
                        ),
                        title: Text(
                          isEn ? h.holiday.nameEn : h.holiday.name,
                          style: const TextStyle(fontSize: 14),
                        ),
                        subtitle: Text(
                          isEn ? h.holiday.name : h.holiday.nameEn,
                          style: TextStyle(
                              fontSize: 11, color: Colors.grey[500]),
                        ),
                        trailing: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              bsLabel,
                              style: const TextStyle(
                                  fontSize: 11,
                                  color: AppTheme.primary,
                                  fontWeight: FontWeight.w600),
                            ),
                            Text(
                              adLabel,
                              style: TextStyle(
                                  fontSize: 10, color: Colors.grey[500]),
                            ),
                          ],
                        ),
                        dense: true,
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
