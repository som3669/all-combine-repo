"""Upload the staged AAB to Play and set it live on every track.

Run it yourself -- this performs a production deploy:

    cd C:\\tmp\\ai_patro
    python tool\\play-publish.py

Reads the version from pubspec.yaml and expects the matching bundle in
release\\, so it can never upload a stale artifact by accident. Credentials
come from the service account JSON, which lives outside the repo.
"""

import re
import sys
from pathlib import Path

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from googleapiclient.errors import HttpError

KEY = r'C:\Users\som\Documents\Android-Keys\play-publisher.json'
PKG = 'com.aipatro.ai_patro'
TRACKS = ['production', 'beta', 'alpha', 'internal']

NOTES = (
    "- Android 15 and later: fixed edge-to-edge layout, so no content sits "
    "under the status or navigation bars\n"
    "- New app icon and refreshed branding\n"
    "- AI features now work without any setup\n"
    "- Build and packaging fixes"
)

root = Path(__file__).resolve().parent.parent
version = re.search(r'^version:\s*(.+)$', (root / 'pubspec.yaml').read_text(), re.M).group(1).strip()
name, build_no = version.split('+', 1)
aab = root / 'release' / f'ai-patro-v{name}-{build_no}.aab'
if not aab.exists():
    sys.exit(f'{aab} not found -- run tool\\release.ps1 first')

print(f'publishing {name}+{build_no}')
print(f'  {aab}')

creds = service_account.Credentials.from_service_account_file(
    KEY, scopes=['https://www.googleapis.com/auth/androidpublisher'])
svc = build('androidpublisher', 'v3', credentials=creds, cache_discovery=False)

try:
    eid = svc.edits().insert(body={}, packageName=PKG).execute()['id']
    print('edit', eid)

    media = MediaFileUpload(str(aab), mimetype='application/octet-stream', resumable=True)
    vc = svc.edits().bundles().upload(
        packageName=PKG, editId=eid, media_body=media).execute()['versionCode']
    print('uploaded versionCode', vc)

    for track in TRACKS:
        svc.edits().tracks().update(
            packageName=PKG, editId=eid, track=track,
            body={'releases': [{
                'versionCodes': [str(vc)],
                'status': 'completed',
                'releaseNotes': [{'language': 'en-US', 'text': NOTES}],
            }]}).execute()
        print('set track', track)

    # Play flips on whether changesNotSentForReview is required: it insists on
    # it while the app has open policy issues, and rejects it once a review is
    # already in flight. Which applies depends on Console state at this moment,
    # so try the normal commit and fall back on that specific complaint.
    try:
        svc.edits().commit(packageName=PKG, editId=eid).execute()
        sent = True
    except HttpError as first:
        if 'changesNotSentForReview' not in str(first):
            raise
        svc.edits().commit(
            packageName=PKG, editId=eid, changesNotSentForReview=True).execute()
        sent = False

    print('COMMITTED on', ', '.join(TRACKS))
    print('sent for review automatically' if sent else
          'NOT sent for review -- Play Console -> Publishing overview -> Send for review')
except HttpError as e:
    sys.exit(f'FAILED {e.status_code}: {e.reason}')
