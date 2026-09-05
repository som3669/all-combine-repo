import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

/// In-app copy of the privacy policy.
///
/// The canonical text lives in `src/ai-patro.md` in
/// github.com/som3669/privacy-policy and is published at
/// https://som3669.github.io/privacy-policy/ai-patro/ — that URL is what the
/// Play listing points at. Edit this screen in the same change as the policy
/// there: an inconsistency between the listing's policy, the data safety
/// disclosures and what the app actually does is a policy violation in its own
/// right, not just a stale doc.
class PrivacyPolicyScreen extends StatelessWidget {
  const PrivacyPolicyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Privacy Policy'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'AI Patro — Privacy Policy',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: AppTheme.primary,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Last updated: September 2026',
              style: TextStyle(color: Colors.grey[600], fontSize: 13),
            ),
            const SizedBox(height: 20),
            _section(
              'Data Collection',
              'AI Patro does not collect, store, or transmit any personally identifiable information. '
              'No account registration is required.',
            ),
            _section(
              'Permissions',
              'AI Patro does not request access to your camera, microphone, contacts, '
              'location, or any sensitive device features.',
            ),
            _section(
              'Remote Data Fetching',
              'On launch, the app fetches holiday and configuration data from a remote server '
              'to keep festival and tithi information up to date. No personal or device-identifying '
              'information is included in the request. Results are cached locally for up to 24 hours.',
            ),
            _section(
              'AI Features and Groq',
              'The AI assistant, panchang explanations, rashifal, greetings and name '
              'suggestions are served by Groq, a third-party inference provider. When you use '
              'one of those features — and only then — the app sends your request text to '
              'api.groq.com: the message you type, or the already-computed values you asked to '
              'have explained, plus the requested language and length. Your identity, device '
              'identifiers, location, preferences and calendar history are not sent, and there '
              'is no account to tie a request to. Groq handles those requests under its own '
              'privacy policy. Every other feature — calendar, tithi, panchang, holidays, '
              'muhurat, date converter and the widget — is computed on your device and sends '
              'nothing anywhere.',
            ),
            _section(
              'Internet Access',
              'The INTERNET permission is used for the two purposes above: fetching remote '
              'holiday and configuration data, and the AI features. No other network activity '
              'occurs.',
            ),
            _section(
              'Data Storage',
              'The app stores user preferences, a cached copy of remote holiday data, and '
              'your Groq API key if you enter one, locally on your device. This data never '
              'leaves your device except as part of the requests described above; the API key '
              'is used only to authenticate your own AI requests.',
            ),
            _section(
              'Third Parties',
              'AI Patro does not use analytics, advertising SDKs, or tracking libraries. '
              'Two third parties receive requests: GitHub, which serves the remote holiday '
              'data, and Groq, which serves the AI features. Each provider\'s own privacy '
              'policy applies to requests made to their servers.',
            ),
            _section(
              'Children',
              'AI Patro is suitable for all ages and does not knowingly collect '
              'information from children under 13. Note that the AI features send text to a '
              'third-party service; a parent who would rather avoid that can simply not use '
              'them.',
            ),
            _section(
              'Contact',
              'For questions about this policy, contact: somshrestha3669@gmail.com',
            ),
            _section(
              'Full Policy',
              'The complete, canonical policy is published at '
              'https://som3669.github.io/privacy-policy/ai-patro/',
            ),
            const SizedBox(height: 20),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppTheme.todayHighlight,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppTheme.primary.withValues(alpha: 0.3)),
              ),
              child: const Text(
                '© 2083 BS / 2026 AD — AI Patro. All rights reserved.',
                style: TextStyle(fontSize: 12, color: AppTheme.primary),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _section(String title, String body) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.bold,
              color: Colors.black87,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            body,
            style: TextStyle(
              fontSize: 14,
              color: Colors.grey[700],
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }
}
