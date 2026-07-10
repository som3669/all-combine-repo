import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/services/event_store.dart';
import '../../data/services/notification_service.dart';

/// Holds the user's personal events, backed by [EventStore].
class EventsNotifier extends AsyncNotifier<List<PersonalEvent>> {
  @override
  Future<List<PersonalEvent>> build() => EventStore.load();

  Future<void> add(PersonalEvent event) async {
    final current = state.value ?? [];
    final updated = [...current, event];
    await EventStore.save(updated);
    state = AsyncData(updated);
    NotificationService.rescheduleAll().catchError((_) {});
  }

  Future<void> remove(String id) async {
    final current = state.value ?? [];
    final updated = current.where((e) => e.id != id).toList();
    await EventStore.save(updated);
    state = AsyncData(updated);
    NotificationService.rescheduleAll().catchError((_) {});
  }
}

final eventsProvider =
    AsyncNotifierProvider<EventsNotifier, List<PersonalEvent>>(
        EventsNotifier.new);
