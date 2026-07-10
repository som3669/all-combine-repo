import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nepali_utils/nepali_utils.dart';
import '../../core/constants/app_strings.dart';
import '../../core/providers/language_provider.dart';
import '../../core/theme/app_theme.dart';
import '../../data/services/event_store.dart';
import 'events_provider.dart';

class EventsScreen extends ConsumerWidget {
  const EventsScreen({super.key});

  /// Next upcoming occurrence of an event as a BS date.
  static NepaliDateTime nextOccurrence(PersonalEvent e) {
    if (!e.yearly) return NepaliDateTime(e.bsYear, e.bsMonth, e.bsDay);
    final today = NepaliDateTime.now();
    var year = today.year;
    var candidate = NepaliDateTime(year, e.bsMonth, e.bsDay);
    // If this year's date already passed, roll to next year.
    if (candidate.toDateTime().isBefore(
        DateTime(today.toDateTime().year, today.toDateTime().month,
            today.toDateTime().day))) {
      candidate = NepaliDateTime(year + 1, e.bsMonth, e.bsDay);
    }
    return candidate;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isEn = ref.watch(languageProvider) == AppLanguage.english;
    final eventsAsync = ref.watch(eventsProvider);

    return Scaffold(
      appBar: AppBar(title: Text(isEn ? 'My Events' : 'मेरा कार्यक्रम')),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppTheme.primary,
        foregroundColor: Colors.white,
        onPressed: () => _showAddDialog(context, ref, isEn),
        icon: const Icon(Icons.add),
        label: Text(isEn ? 'Add' : 'थप्नुहोस्'),
      ),
      body: eventsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (events) {
          if (events.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.event_outlined, size: 48, color: Colors.grey[400]),
                    const SizedBox(height: 12),
                    Text(
                      isEn
                          ? 'No events yet. Tap + to add birthdays, anniversaries, and reminders.'
                          : 'कुनै कार्यक्रम छैन। जन्मदिन, वार्षिकोत्सव थप्न + थिच्नुहोस्।',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.grey[600]),
                    ),
                  ],
                ),
              ),
            );
          }
          final sorted = [...events]..sort((a, b) => nextOccurrence(a)
              .toDateTime()
              .compareTo(nextOccurrence(b).toDateTime()));
          return ListView.separated(
            padding: const EdgeInsets.all(12),
            itemCount: sorted.length,
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (_, i) => _EventTile(event: sorted[i], isEn: isEn),
          );
        },
      ),
    );
  }

  void _showAddDialog(BuildContext context, WidgetRef ref, bool isEn) {
    final titleController = TextEditingController();
    final now = NepaliDateTime.now();
    int month = now.month;
    int day = now.day;
    int year = now.year;
    bool yearly = true;
    final months = isEn ? AppStrings.englishMonths : AppStrings.nepaliMonths;

    showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) {
          final maxDay = NepaliDateTime(year, month).totalDays;
          if (day > maxDay) day = maxDay;
          return AlertDialog(
            title: Text(isEn ? 'Add Event' : 'कार्यक्रम थप्नुहोस्'),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: titleController,
                    decoration: InputDecoration(
                      labelText: isEn ? 'Title' : 'शीर्षक',
                    ),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        flex: 4,
                        child: DropdownButton<int>(
                          isExpanded: true,
                          value: month,
                          items: List.generate(
                              12,
                              (i) => DropdownMenuItem(
                                  value: i + 1, child: Text(months[i]))),
                          onChanged: (v) => setState(() => month = v!),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        flex: 2,
                        child: DropdownButton<int>(
                          isExpanded: true,
                          value: day,
                          items: List.generate(
                              maxDay,
                              (i) => DropdownMenuItem(
                                  value: i + 1,
                                  child: Text(isEn
                                      ? '${i + 1}'
                                      : AppStrings.toNepaliNumeral(i + 1)))),
                          onChanged: (v) => setState(() => day = v!),
                        ),
                      ),
                    ],
                  ),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(isEn ? 'Repeat yearly' : 'हरेक वर्ष दोहोर्याउने'),
                    value: yearly,
                    activeThumbColor: AppTheme.primary,
                    onChanged: (v) => setState(() => yearly = v),
                  ),
                  if (!yearly)
                    DropdownButton<int>(
                      isExpanded: true,
                      value: year,
                      items: List.generate(
                          101,
                          (i) => DropdownMenuItem(
                              value: 2000 + i,
                              child: Text(isEn
                                  ? '${2000 + i}'
                                  : AppStrings.toNepaliNumeral(2000 + i)))),
                      onChanged: (v) => setState(() => year = v!),
                    ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: Text(isEn ? 'Cancel' : 'रद्द'),
              ),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primary,
                  foregroundColor: Colors.white,
                ),
                onPressed: () {
                  final title = titleController.text.trim();
                  if (title.isEmpty) return;
                  ref.read(eventsProvider.notifier).add(PersonalEvent(
                        id: DateTime.now().microsecondsSinceEpoch.toString(),
                        title: title,
                        bsYear: year,
                        bsMonth: month,
                        bsDay: day,
                        yearly: yearly,
                      ));
                  Navigator.pop(ctx);
                },
                child: Text(isEn ? 'Save' : 'सेभ'),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _EventTile extends ConsumerWidget {
  final PersonalEvent event;
  final bool isEn;
  const _EventTile({required this.event, required this.isEn});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final next = EventsScreen.nextOccurrence(event);
    final ad = next.toDateTime();
    final today = DateTime.now();
    final days = ad
        .difference(DateTime(today.year, today.month, today.day))
        .inDays;
    final months = isEn ? AppStrings.englishMonths : AppStrings.nepaliMonths;
    final dayStr = isEn ? '${next.day}' : AppStrings.toNepaliNumeral(next.day);

    final countdown = days == 0
        ? (isEn ? 'Today' : 'आज')
        : days == 1
            ? (isEn ? 'Tomorrow' : 'भोलि')
            : (isEn ? 'in $days days' : '$days दिनमा');

    return ListTile(
      leading: CircleAvatar(
        backgroundColor: AppTheme.primary.withValues(alpha: 0.12),
        child: const Icon(Icons.event, color: AppTheme.primary, size: 20),
      ),
      title: Text(event.title,
          style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Text('${months[next.month - 1]} $dayStr'
          '${event.yearly ? '' : ', ${next.year}'} · $countdown'),
      trailing: IconButton(
        icon: Icon(Icons.delete_outline, color: Colors.grey[500]),
        onPressed: () => ref.read(eventsProvider.notifier).remove(event.id),
      ),
    );
  }
}
