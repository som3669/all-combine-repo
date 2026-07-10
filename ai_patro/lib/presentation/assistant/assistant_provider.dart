import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/services/ai_service.dart';

class ChatMessage {
  final bool isUser;
  final String text;
  const ChatMessage(this.isUser, this.text);
}

class AssistantState {
  final List<ChatMessage> messages;
  final bool loading;
  const AssistantState({this.messages = const [], this.loading = false});

  AssistantState copyWith({List<ChatMessage>? messages, bool? loading}) =>
      AssistantState(
        messages: messages ?? this.messages,
        loading: loading ?? this.loading,
      );
}

class AssistantNotifier extends Notifier<AssistantState> {
  @override
  AssistantState build() => const AssistantState();

  /// Sends [text] with a caller-built [systemPrompt] that grounds the model in
  /// today's date and the real festival list, so it doesn't invent dates.
  Future<void> send(String text, String systemPrompt, String errorMsg) async {
    final userMsg = ChatMessage(true, text);
    state = state.copyWith(
      messages: [...state.messages, userMsg],
      loading: true,
    );

    final history = state.messages
        .map((m) => {
              'role': m.isUser ? 'user' : 'assistant',
              'content': m.text,
            })
        .toList();

    final reply = await AiService.chat(
      [
        {'role': 'system', 'content': systemPrompt},
        ...history,
      ],
      maxTokens: 600,
      temperature: 0.5,
    );

    // On failure, append the specific reason so it's diagnosable.
    final fallback = AiService.lastError != null
        ? '$errorMsg\n\n(${AiService.lastError})'
        : errorMsg;

    state = state.copyWith(
      messages: [...state.messages, ChatMessage(false, reply ?? fallback)],
      loading: false,
    );
  }

  void clear() => state = const AssistantState();
}

final assistantProvider =
    NotifierProvider<AssistantNotifier, AssistantState>(AssistantNotifier.new);
