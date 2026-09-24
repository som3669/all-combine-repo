# Releasing AI Patro

Every release is: bump the version, build, publish, submit, then publish again
(managed publishing is on, so approval and going live are separate steps).

Package `com.aipatro.ai_patro` · developer id `7464976609215734315` ·
app id `4972921767319419336` · Play Console URLs use `/u/2/` because the
machine is signed into several Google accounts.

## 0. Setting up on a new machine

```bash
git clone https://github.com/som3669/ai-patro.git
cd ai-patro
flutter pub get
```

The clone is complete except for four files, which are gitignored on purpose.
They live in `Documents\AI-Patro-Backup\` on the original machine; copy that
folder across:

| File | Goes to |
|---|---|
| `api_keys.dart` | `lib\core\constants\` |
| `key.properties` | `android\` |
| `ai-patro-upload.jks` | anywhere **outside** the repo; point `storeFile` at it |
| `play-publisher.json` | anywhere outside the repo; update the path in `tool\play-publish.py` |

Keep the keystore out of the project directory. The previous one lived in
`android/keystore/`, and when that folder was deleted the key went with it.

Also needed: Flutter with the Android SDK, and `pip install google-auth
google-api-python-client` for the publish script.

Two silent failures to watch for on a fresh setup:

- A missing `api_keys.dart` does **not** break the build. Flutter compiles the
  placeholder and every AI feature shows "add a key" at runtime. Check Settings
  in the app reads `कन्फिगर भयो` before shipping.
- A wrong `storeFile` path or alias fails only at the signing step, minutes
  into the build. The alias is `upload`.

## 1. Bump the version

`pubspec.yaml`:

```yaml
version: 1.2.5+15
```

The build number must be higher than any ever uploaded, **including numbers
burnt by rejected uploads**. Play never releases a version code once it has
seen it. Codes used so far: 2, 7, 8, 9, 11, 12, 13, 14.

Update the two copies in `lib/presentation/widgets/app_drawer.dart` in the same
change — the drawer footer label and `applicationVersion` in the About dialog.
They are easy to miss and users see both.

## 2. Build

```powershell
cd C:\tmp\ai_patro
.\tool\release.ps1              # AAB + APK
.\tool\release.ps1 -AabOnly     # AAB only
.\tool\release.ps1 -Clean       # flutter clean first
```

Output: `release\ai-patro-v<name>-<build>.aab`

The script refuses to run without `android\key.properties`, so a debug-signed
bundle can never reach Play by accident. It also refuses to overwrite an
existing artifact, which forces a version bump instead of silently rebuilding
the same number twice.

### Signing

`android\key.properties` (gitignored, never commit it):

```properties
storePassword=<password>
keyPassword=<password>
keyAlias=upload
storeFile=C:/Users/som/Documents/Android-Keys/ai-patro-upload.jks
```

The alias is `upload`, not the filename. Keystore SHA-1
`FC:BA:43:A5:0B:9E:2A:0C:59:7B:6C:6F:23:12:35:17:6B:24:1B:53` must match the
upload certificate on the App signing page, or Play rejects the bundle.

**Back the keystore up outside this repo.** The previous one lived in
`android/keystore/` and was lost with the project folder, which cost a
multi-day upload key reset.

## 3. Verify before uploading

```powershell
$aapt = (Get-ChildItem "$env:LOCALAPPDATA\Android\Sdk\build-tools\*\aapt2.exe" | Select-Object -Last 1).FullName
& $aapt dump badging release\ai-patro-v<name>-<build>.apk | Select-Object -First 1
```

Confirm the version code, and that no `READ_MEDIA_*` permission is present.
Both have caused rejections before:

- **Photo and Video Permissions policy** — `open_filex` declares `READ_MEDIA_*`
  in its own manifest and manifest merging pulls them in. Stripped with
  `tools:node="remove"` in `android/app/src/main/AndroidManifest.xml`. The app
  never uses them: the scanner's gallery path is `ACTION_GET_CONTENT`, a system
  picker.
- **16 KB memory page sizes** — Huawei ML Kit shipped `libHwDocRefine.so`
  aligned to 4 KB. Excluded with `exclude(group = "com.huawei.hms")` in
  `android/app/build.gradle.kts`. Every Flutter-produced `.so` was already fine.

Neither fix needs repeating, but a new dependency can reintroduce either.

## 4. Publish

```bash
cd /c/tmp/ai_patro
python tool/play-publish.py
```

Uploads the bundle matching `pubspec.yaml` and sets it on production, beta,
alpha and internal at 100%, with the release notes from the script.

It commits with `changesNotSentForReview=True`. Play refuses to auto-submit
while the app has open policy issues, so the release lands in Console and waits
for a manual submit.

Credentials: `C:\Users\som\Documents\Android-Keys\play-publisher.json`
(service account `som-169@ai-patro.iam.gserviceaccount.com`). Outside the repo,
never committed.

### Keep every track on the same build

Policy flags persist while *any* track serves an affected version code, not
just production. Rejections kept reappearing because beta, alpha and internal
still served old bundles long after the fixes shipped. The script writes all
four for this reason.

## 5. Send for review

```
https://play.google.com/console/u/2/developers/7464976609215734315/app/4972921767319419336/publishing-overview
```

**Publishing overview → Send for review.** Binary and listing changes submit
together as one batch.

## 6. Publish once approved

Managed publishing is on, so approval does not make anything live. Approved
changes sit under **Changes ready to publish** until you press **Publish**.

## Store listing (no build required)

Listing edits are independent of the binary and can go out any time.

```
https://play.google.com/console/u/2/developers/7464976609215734315/app/4972921767319419336/main-store-listing
```

| Field | File |
|---|---|
| App icon | `brand\blue\play-icon-512.png` (512x512, opaque) |
| Feature graphic | `assets\feature_graphic.png` (1024x500) |
| Phone screenshots | `screenshots\play-light\` (1080x2160) |
| 7-inch tablet | `screenshots\play-tablet7\` (1080x1920, exactly 9:16) |
| Text | `brand\store-listing.md` |

Play caps phone screenshots so the long side is at most twice the short side.
Raw 1080x2400 captures are 2.22:1 and get rejected; the `play-*` folders are
pre-cropped to 2:1.

## Regenerating screenshots

Boot the emulator, install a build, drive the app with `adb`, then crop. The
raw captures live in `screenshots/`, the Play-ready crops in the `play-*`
subfolders. All are committed — the project folder has been deleted once
already and only what was in git survived.

Two gotchas: a plain `adb install -r` keeps the **old launcher icon** from the
launcher's cache, so uninstall first when checking an icon change; and
`uiautomator dump` returns nothing useful for a Flutter app, so navigation is
by coordinates read off a screenshot.

## Things that are not in git

- `android\key.properties` and the keystore
- `lib\core\constants\api_keys.dart` — the Groq key, compiled into the binary.
  If it is missing at build time Flutter does **not** error; it ships the
  placeholder and every AI feature silently shows "add a key". That shipped
  once, in builds 8 and 9.
- `play-publisher.json`
- `release\*.aab` and `.apk`
