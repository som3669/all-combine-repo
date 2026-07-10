import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/providers/language_provider.dart';
import '../../core/providers/my_rashi_provider.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/rashi.dart';
import '../../data/services/ai_service.dart';
import '../../data/services/rashifal_service.dart';
import '../../data/services/tts_service.dart';
import '../settings/settings_screen.dart';

class RashifalScreen extends ConsumerWidget {
  const RashifalScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isEn = ref.watch(languageProvider) == AppLanguage.english;
    final myRashi = ref.watch(myRashiProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(isEn ? 'Rashifal (Horoscope)' : 'राशिफल'),
      ),
      body: Column(
        children: [
          // Pinned "my rashi" card, or a hint to set one.
          if (myRashi != null)
            _MyRashiBanner(rashi: Rashi.all[myRashi], isEn: isEn)
          else
            Container(
              width: double.infinity,
              color: AppTheme.primary.withValues(alpha: 0.06),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              child: Text(
                isEn
                    ? 'Tap the ☆ on your sign to save it as your rashi.'
                    : 'आफ्नो राशि सेभ गर्न ☆ मा ट्याप गर्नुहोस्।',
                style: const TextStyle(fontSize: 12.5),
                textAlign: TextAlign.center,
              ),
            ),
          Expanded(
            child: GridView.count(
              crossAxisCount: 3,
              padding: const EdgeInsets.all(12),
              childAspectRatio: 0.95,
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              children: Rashi.all
                  .map((r) => _RashiCard(
                        rashi: r,
                        isEn: isEn,
                        isMine: myRashi == r.index,
                        onStar: () =>
                            ref.read(myRashiProvider.notifier).set(r.index),
                      ))
                  .toList(),
            ),
          ),
        ],
      ),
    );
  }
}

class _MyRashiBanner extends StatelessWidget {
  final Rashi rashi;
  final bool isEn;
  const _MyRashiBanner({required this.rashi, required this.isEn});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(
            builder: (_) => RashiDetailScreen(rashi: rashi, isEn: isEn)),
      ),
      child: Container(
        width: double.infinity,
        color: AppTheme.primary,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Text(rashi.symbol, style: const TextStyle(fontSize: 26)),
            const SizedBox(width: 12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(isEn ? 'Your rashi' : 'तपाईंको राशि',
                    style: TextStyle(
                        fontSize: 11,
                        color: Colors.white.withValues(alpha: 0.8))),
                Text(isEn ? rashi.en : rashi.ne,
                    style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.bold,
                        color: Colors.white)),
              ],
            ),
            const Spacer(),
            Text(isEn ? "Today's ›" : 'आजको ›',
                style: const TextStyle(color: Colors.white, fontSize: 13)),
          ],
        ),
      ),
    );
  }
}

class _RashiCard extends StatelessWidget {
  final Rashi rashi;
  final bool isEn;
  final bool isMine;
  final VoidCallback onStar;
  const _RashiCard({
    required this.rashi,
    required this.isEn,
    required this.isMine,
    required this.onStar,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => RashiDetailScreen(rashi: rashi, isEn: isEn),
        ),
      ),
      child: Container(
        decoration: BoxDecoration(
          color: AppTheme.primary.withValues(alpha: isMine ? 0.16 : 0.06),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
              color: AppTheme.primary.withValues(alpha: isMine ? 0.5 : 0.15)),
        ),
        child: Stack(
          children: [
            Positioned(
              top: 2,
              right: 2,
              child: IconButton(
                iconSize: 18,
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 30, minHeight: 30),
                icon: Icon(isMine ? Icons.star : Icons.star_border,
                    color: AppTheme.primary),
                onPressed: onStar,
              ),
            ),
            Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(rashi.symbol, style: const TextStyle(fontSize: 30)),
                  const SizedBox(height: 6),
                  Text(
                    isEn ? rashi.en : rashi.ne,
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 15,
                      color: AppTheme.primary,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    rashi.rangeEn,
                    style: TextStyle(fontSize: 9.5, color: Colors.grey[600]),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class RashiDetailScreen extends StatelessWidget {
  final Rashi rashi;
  final bool isEn;
  const RashiDetailScreen({super.key, required this.rashi, required this.isEn});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('${rashi.symbol}  ${isEn ? rashi.en : rashi.ne}'),
      ),
      body: FutureBuilder<String?>(
        future: RashifalService.forRashi(rashi, isEn: isEn),
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          final text = snap.data;
          if (text == null || text.isEmpty) {
            return _Fallback(isEn: isEn);
          }
          return SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(rashi.symbol, style: const TextStyle(fontSize: 40)),
                    const SizedBox(width: 12),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          isEn ? rashi.en : rashi.ne,
                          style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                            color: AppTheme.primary,
                          ),
                        ),
                        Text(
                          isEn ? "Today's horoscope" : 'आजको राशिफल',
                          style: TextStyle(
                              fontSize: 12, color: Colors.grey[600]),
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                Text(text, style: const TextStyle(fontSize: 15, height: 1.6)),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: () => TtsService.speak(text, isEn: isEn),
                  icon: const Icon(Icons.volume_up, size: 18),
                  label: Text(isEn ? 'Read aloud' : 'सुन्नुहोस्'),
                ),
                const SizedBox(height: 24),
                Text(
                  isEn
                      ? 'For entertainment. Generated by AI.'
                      : 'मनोरञ्जनका लागि। एआईद्वारा तयार।',
                  style: TextStyle(fontSize: 11, color: Colors.grey[500]),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _Fallback extends StatelessWidget {
  final bool isEn;
  const _Fallback({required this.isEn});

  @override
  Widget build(BuildContext context) {
    final configured = AiService.isConfigured;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.auto_awesome_outlined,
                size: 40, color: Colors.grey[400]),
            const SizedBox(height: 12),
            Text(
              configured
                  ? (isEn
                      ? 'Could not load the horoscope. Check your connection and try again.'
                      : 'राशिफल लोड गर्न सकिएन। इन्टरनेट जाँच गरी फेरि प्रयास गर्नुहोस्।')
                  : (isEn
                      ? 'AI is not configured. Tap below to add a Groq API key.'
                      : 'एआई कन्फिगर गरिएको छैन। Groq API key थप्न तल ट्याप गर्नुहोस्।'),
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey[600]),
            ),
            if (!configured) ...[
              const SizedBox(height: 16),
              ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primary,
                  foregroundColor: Colors.white,
                ),
                onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                      builder: (_) =>
                          const SettingsScreen(scrollToApi: true)),
                ),
                icon: const Icon(Icons.key, size: 18),
                label: Text(isEn ? 'Add API key' : 'API key थप्नुहोस्'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
