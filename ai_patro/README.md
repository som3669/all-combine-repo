# AI Patro

AI Patro — Nepali Bikram Sambat calendar with tithi, festivals, and AI features
(Rashifal, Panchang explainer, and an AI Assistant for festival/ritual & date questions).

## Build

```bash
flutter pub get
flutter build apk --release        # APK for direct testing
flutter build appbundle --release  # AAB for Play Store
```

## AI design note

Factual panchang values (tithi, nakshatra, yoga, karana) are **computed
deterministically** in `lib/data/services/panchang_service.dart` (astronomy, no
network). The LLM only *explains* those values — it never generates dates or
astronomical facts. This "compute-then-explain" split is why AI features are safe
to ship.
