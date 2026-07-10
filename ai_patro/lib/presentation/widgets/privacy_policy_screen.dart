import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

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
              'Last updated: June 2026',
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
              'Internet Access',
              'The INTERNET permission is used to fetch remote holiday and configuration data. '
              'No other network activity occurs.',
            ),
            _section(
              'Data Storage',
              'The app stores user preferences and a cached copy of remote holiday data locally '
              'on your device. This data never leaves your device except as part of the remote fetch described above.',
            ),
            _section(
              'Third Parties',
              'AI Patro does not use analytics, advertising SDKs, or tracking libraries. '
              'Remote holiday data is served via GitHub\'s infrastructure. '
              'GitHub\'s privacy policy applies to requests made to their servers.',
            ),
            _section(
              'Children',
              'AI Patro is suitable for all ages and does not knowingly collect '
              'information from children under 13.',
            ),
            _section(
              'Contact',
              'For questions about this policy, contact: somshrestha3669@gmail.com',
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
