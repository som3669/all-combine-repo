# release/

Staging folder for Play Store artifacts. **Every upload comes from here.**

Do not upload straight from `build/app/outputs/` — that path is wiped by
`flutter clean` and its filenames (`app-release.aab`) carry no version, so two
builds are indistinguishable once they leave the machine.

## Making a release

1. Bump `version:` in `pubspec.yaml` (`versionName+buildNumber`). The build
   number must increase on every Play upload.
2. Run:

   ```powershell
   .\tool\release.ps1
   ```

   It refuses to build if `android/key.properties` is missing (unsigned build)
   or if an artifact for that version already exists (accidental overwrite).
3. Upload `release/ai-patro-v<version>-<build>.aab` to the Play Console.
4. Tag the commit the build came from:

   ```powershell
   git tag v<version>+<build>; git push origin v<version>+<build>
   ```

The matching `.apk` is built for sideload testing only — Play takes the `.aab`.

## Contents

Artifacts are git-ignored (tens of MB each). Keep the local files around for
the versions currently live on Play so a crash report can be matched to the
exact binary; older ones can be deleted.
