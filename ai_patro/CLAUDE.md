# AI Patro

Nepali Bikram Sambat calendar (tithi, festivals, panchang) with Groq-backed AI
features: Rashifal, Panchang explainer, AI Assistant. Android app on Play as
`com.aipatro.ai_patro`; repo github.com/som3669/ai-patro (private).
Moved from `C:\tmp\ai_patro` on 2026-09-24 — older docs/scripts still quote that path.

## Stack
- Flutter (Dart SDK ^3.12), Riverpod 3, `nepali_utils`; compileSdk/targetSdk 36
- AI: `lib/data/services/ai_service.dart` → `api.groq.com` (model `openai/gpt-oss-120b`).
  Design rule: panchang values are computed deterministically in
  `panchang_service.dart`; the LLM only *explains* them, never generates dates.
- Holidays: `remote_config_service.dart` fetches `holidays.json` from a som3669 gist.

## Layout
- `lib/core/` constants, providers, theme · `lib/data/` models, repositories, services
- `lib/presentation/<feature>/` screens; `widgets/app_drawer.dart` holds the version labels
- `tool/release.ps1` build → `release/` · `tool/play-publish.py` upload to Play
- `brand/` icons + `store-listing.md` · `screenshots/play-*` Play-ready crops

## Commands
```
flutter pub get
flutter analyze / dart analyze
.\tool\release.ps1 [-AabOnly] [-Clean]   # signed AAB(+APK) -> release\ai-patro-v<name>-<build>.aab
python tool/play-publish.py              # production deploy: uploads, sets all 4 tracks
```

## Rules
- **Never change a version number without asking** (`pubspec.yaml` + two strings in
  `app_drawer.dart`: drawer footer and About `applicationVersion`). Make the fix, say a
  new version is needed, let the user pick.
- Release only from `release/` via `tool/release.ps1`, never `build/app/outputs/`.
- Full release flow, setup, signing and store listing: **RELEASING.md**. Don't duplicate it.
- Keep production, beta, alpha, internal on the same build — policy flags persist while
  *any* track serves an affected version code.

## Not in git (never commit, never paste values)
Backup of everything a clone can't restore: `C:\Users\som\Documents\AI-Patro-Backup\`
(README.txt inside). `api_keys.dart` → `lib/core/constants/`; `key.properties` → `android/`;
keystore `ai-patro-upload.jks` and `play-publisher.json` live in
`C:\Users\som\Documents\Android-Keys\`, outside the repo. Keystore alias is `upload`.
- Missing `api_keys.dart` does NOT fail the build — AI silently shows "add a key"
  (shipped in builds 8 and 9). Check Settings reads `कन्फिगर भयो` before shipping.

## Burned version codes
Play burns a code on any upload attempt: 2, 7, 8, 9, 11, 12, 13, 14. Current `1.2.4+14`.
Next build must be ≥15.

## Play policy history
- 2026-08-14 Edge-to-edge warning (Android 15 / SDK 35) → insets fixed 2026-08-15.
- 2026-08-24 Photo and Video Permissions rejection: `open_filex` merged `READ_MEDIA_*`;
  stripped with `tools:node="remove"` in AndroidManifest. Scanner gallery uses `ACTION_GET_CONTENT`.
- 2026-08-24 16 KB page size error (code 12): Huawei ML Kit `libHwDocRefine.so`; excluded
  `com.huawei.hms` in `android/app/build.gradle.kts`. A new dependency can reintroduce either.
- ~2026-09-03 project folder deleted with the in-repo keystore → multi-day upload key
  reset, approved 2026-09-24 (SHA-1 in RELEASING.md).
- 2026-09-05 privacy policy moved to som3669/privacy-policy and rewritten to disclose Groq
  calls; 2026-09-08 "Contains ads" declared (for future ads) and policy matched.
  Policy, Play declarations and the in-app `privacy_policy_screen.dart` must agree.
- 2026-09-24 build 14 committed on all four tracks (managed publishing on: Send for
  review, then Publish after approval).

## Gotchas
- `changesNotSentForReview`: Play requires it while policy issues are open and rejects it
  once a review is in flight. The script tries a plain commit and falls back
  (RELEASING.md step 4 still describes the older always-set behaviour).
- Phone screenshots max 2:1; 7-inch tablet must be exactly 9:16.
- `adb install -r` keeps the old launcher icon (uninstall first); `uiautomator dump` is
  useless on Flutter — navigate by screenshot coordinates.

## Open items (as of 2026-09-24)
- Confirm build 14 review cleared both policy items, then Publish.
- Rotate the `play-publisher.json` service-account key (exposed in a transcript).
- Copy `AI-Patro-Backup` off this machine.
- Known bugs: holiday sheet opens on 2082 rows; muhurat shows Arabic `7` instead of `७`.
