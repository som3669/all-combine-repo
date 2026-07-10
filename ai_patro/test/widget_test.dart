import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ai_patro/main.dart';

void main() {
  testWidgets('AI Patro loads calendar screen', (WidgetTester tester) async {
    await tester.pumpWidget(
      const ProviderScope(child: AiPatroApp()),
    );
    await tester.pump();
    expect(find.byType(Scaffold), findsOneWidget);
  });
}
