import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/providers/api_key_provider.dart';
import '../../core/providers/language_provider.dart';
import '../../core/providers/theme_provider.dart';
import '../../core/theme/app_theme.dart';
import '../../data/services/ai_service.dart';
import '../../data/services/notification_service.dart';
import '../../data/services/remote_config_service.dart';
import '../calendar/calendar_provider.dart';

/// App settings hub: language, Groq API key, and data refresh.
/// [scrollToApi] highlights the API-key section (used when arriving from the
/// "AI not configured" prompt).
class SettingsScreen extends ConsumerStatefulWidget {
  final bool scrollToApi;
  const SettingsScreen({super.key, this.scrollToApi = false});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  late final TextEditingController _keyController;
  final _apiKey = GlobalKey();
  bool _obscure = true;
  bool _saving = false;

  bool _dailyOn = false;
  int _dHour = 7;
  int _dMin = 0;

  @override
  void initState() {
    super.initState();
    _keyController = TextEditingController(text: AiService.savedKey);
    _loadNotifPrefs();
    if (widget.scrollToApi) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final ctx = _apiKey.currentContext;
        if (ctx != null) {
          Scrollable.ensureVisible(ctx,
              duration: const Duration(milliseconds: 400));
        }
      });
    }
  }

  @override
  void dispose() {
    _keyController.dispose();
    super.dispose();
  }

  Future<void> _loadNotifPrefs() async {
    final on = await NotificationService.isDailyEnabled();
    final (h, m) = await NotificationService.dailyTime();
    if (!mounted) return;
    setState(() {
      _dailyOn = on;
      _dHour = h;
      _dMin = m;
    });
  }

  Future<void> _applyDaily(bool enabled, bool isEn) async {
    if (enabled) {
      final granted = await NotificationService.requestPermission();
      if (!granted) {
        _snack(isEn
            ? 'Notification permission denied.'
            : 'सूचना अनुमति अस्वीकृत भयो।');
        return;
      }
    }
    await NotificationService.setDaily(
        enabled: enabled, hour: _dHour, minute: _dMin);
    if (!mounted) return;
    setState(() => _dailyOn = enabled);
  }

  String _timeLabel() =>
      '${_dHour.toString().padLeft(2, '0')}:${_dMin.toString().padLeft(2, '0')}';

  Future<void> _saveKey(bool isEn) async {
    setState(() => _saving = true);
    await ref.read(apiKeyProvider.notifier).save(_keyController.text);
    if (!mounted) return;
    setState(() => _saving = false);
    _snack(AiService.isConfigured
        ? (isEn ? 'API key saved. AI features enabled.' : 'API key सेभ भयो। एआई सुविधा सक्रिय।')
        : (isEn ? 'API key cleared.' : 'API key हटाइयो।'));
  }

  void _snack(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), duration: const Duration(seconds: 2)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isEn = ref.watch(languageProvider) == AppLanguage.english;
    // Rebuild when the key changes so the status chip updates.
    ref.watch(apiKeyProvider);
    final configured = AiService.isConfigured;

    return Scaffold(
      appBar: AppBar(title: Text(isEn ? 'Settings' : 'सेटिङ')),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: [
          // ── Language ──
          _SectionHeader(title: isEn ? 'Language' : 'भाषा'),
          _LangTile(
            label: 'नेपाली',
            selected: !isEn,
            onTap: () {
              if (ref.read(languageProvider) != AppLanguage.nepali) {
                ref.read(languageProvider.notifier).toggle();
              }
            },
          ),
          _LangTile(
            label: 'English',
            selected: isEn,
            onTap: () {
              if (ref.read(languageProvider) != AppLanguage.english) {
                ref.read(languageProvider.notifier).toggle();
              }
            },
          ),

          const Divider(),

          // ── Theme ──
          _SectionHeader(title: isEn ? 'Theme' : 'थिम'),
          Builder(builder: (context) {
            final mode = ref.watch(themeProvider);
            return Column(
              children: [
                _ThemeTile(
                  label: isEn ? 'System default' : 'सिस्टम अनुसार',
                  icon: Icons.brightness_auto,
                  selected: mode == ThemeMode.system,
                  onTap: () => ref.read(themeProvider.notifier).set(ThemeMode.system),
                ),
                _ThemeTile(
                  label: isEn ? 'Light' : 'उज्यालो',
                  icon: Icons.light_mode,
                  selected: mode == ThemeMode.light,
                  onTap: () => ref.read(themeProvider.notifier).set(ThemeMode.light),
                ),
                _ThemeTile(
                  label: isEn ? 'Dark' : 'अँध्यारो',
                  icon: Icons.dark_mode,
                  selected: mode == ThemeMode.dark,
                  onTap: () => ref.read(themeProvider.notifier).set(ThemeMode.dark),
                ),
              ],
            );
          }),

          const Divider(),

          // ── AI / Groq API key ──
          Container(
            key: _apiKey,
            child: _SectionHeader(title: isEn ? 'AI (Groq API key)' : 'एआई (Groq API key)'),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
            child: Row(
              children: [
                Icon(
                  configured ? Icons.check_circle : Icons.error_outline,
                  size: 16,
                  color: configured ? Colors.green : Colors.orange,
                ),
                const SizedBox(width: 6),
                Text(
                  configured
                      ? (isEn ? 'Configured — AI features active' : 'कन्फिगर भयो — एआई सक्रिय')
                      : (isEn ? 'Not configured' : 'कन्फिगर गरिएको छैन'),
                  style: TextStyle(
                    fontSize: 12.5,
                    color: configured ? Colors.green[700] : Colors.orange[800],
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
            child: Text(
              isEn
                  ? 'Rashifal, Panchang explanation, and the AI Assistant use Groq. '
                      'Paste your free API key to enable them.'
                  : 'राशिफल, पञ्चाङ्ग व्याख्या र एआई सहायक Groq प्रयोग गर्छन्। '
                      'सक्रिय गर्न निःशुल्क API key टाँस्नुहोस्।',
              style: TextStyle(fontSize: 12.5, color: Colors.grey[600], height: 1.5),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: TextField(
              controller: _keyController,
              obscureText: _obscure,
              autocorrect: false,
              enableSuggestions: false,
              decoration: InputDecoration(
                labelText: isEn ? 'Paste key (gsk_…)' : 'Key टाँस्नुहोस् (gsk_…)',
                border: const OutlineInputBorder(),
                prefixIcon: const Icon(Icons.key),
                suffixIcon: IconButton(
                  icon: Icon(_obscure ? Icons.visibility : Icons.visibility_off),
                  onPressed: () => setState(() => _obscure = !_obscure),
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 6, 8, 0),
            child: Row(
              children: [
                const Icon(Icons.info_outline, size: 15, color: Colors.grey),
                const SizedBox(width: 6),
                Expanded(
                  child: SelectableText(
                    'console.groq.com/keys',
                    style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                  ),
                ),
                IconButton(
                  tooltip: isEn ? 'Copy link' : 'लिङ्क कपी',
                  icon: const Icon(Icons.copy, size: 16),
                  onPressed: () {
                    Clipboard.setData(const ClipboardData(
                        text: 'https://console.groq.com/keys'));
                    _snack(isEn ? 'Link copied' : 'लिङ्क कपी भयो');
                  },
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primary,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 13),
                ),
                onPressed: _saving ? null : () => _saveKey(isEn),
                icon: _saving
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.save),
                label: Text(isEn ? 'Save key' : 'Key सेभ गर्नुहोस्'),
              ),
            ),
          ),
          if (AiService.savedKey.isNotEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: TextButton.icon(
                onPressed: _saving
                    ? null
                    : () {
                        _keyController.clear();
                        _saveKey(isEn);
                      },
                icon: const Icon(Icons.delete_outline, size: 18),
                label: Text(isEn ? 'Remove key' : 'Key हटाउनुहोस्'),
              ),
            ),

          const Divider(),

          // ── Notifications ──
          _SectionHeader(title: isEn ? 'Notifications' : 'सूचना'),
          SwitchListTile(
            title: Text(isEn ? 'Daily reminder' : 'दैनिक सम्झना'),
            subtitle: Text(
              isEn
                  ? "Today's tithi & festival each morning"
                  : 'हरेक बिहान आजको तिथि र चाडपर्व',
              style: const TextStyle(fontSize: 11.5),
            ),
            value: _dailyOn,
            activeThumbColor: AppTheme.primary,
            onChanged: (v) => _applyDaily(v, isEn),
          ),
          if (_dailyOn)
            ListTile(
              leading: const Icon(Icons.schedule),
              title: Text(isEn ? 'Reminder time' : 'सम्झना समय'),
              trailing: Text(_timeLabel(),
                  style: const TextStyle(
                      fontWeight: FontWeight.bold, fontSize: 15)),
              onTap: () async {
                final picked = await showTimePicker(
                  context: context,
                  initialTime: TimeOfDay(hour: _dHour, minute: _dMin),
                );
                if (picked != null) {
                  setState(() {
                    _dHour = picked.hour;
                    _dMin = picked.minute;
                  });
                  await _applyDaily(true, isEn);
                }
              },
            ),

          const Divider(),

          // ── Data ──
          _SectionHeader(title: isEn ? 'Data' : 'डाटा'),
          ListTile(
            leading: const Icon(Icons.refresh),
            title: Text(isEn ? 'Refresh holidays & notices' : 'बिदा र सूचना ताजा गर्नुहोस्'),
            subtitle: Text(
              isEn ? 'Re-fetch remote calendar data' : 'रिमोट डाटा पुनः ल्याउनुहोस्',
              style: const TextStyle(fontSize: 11.5),
            ),
            onTap: () async {
              await RemoteConfigService.clearCache();
              ref.invalidate(remoteConfigProvider);
              _snack(isEn ? 'Refreshed' : 'ताजा गरियो');
            },
          ),
        ],
      ),
    );
  }
}

class _LangTile extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _LangTile({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      title: Text(label),
      trailing: selected
          ? const Icon(Icons.check_circle, color: AppTheme.primary)
          : const Icon(Icons.circle_outlined, color: Colors.grey),
      onTap: onTap,
    );
  }
}

class _ThemeTile extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;
  const _ThemeTile({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: selected ? AppTheme.primary : Colors.grey),
      title: Text(label),
      trailing: selected
          ? const Icon(Icons.check_circle, color: AppTheme.primary)
          : null,
      onTap: onTap,
      dense: true,
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Text(
        title,
        style: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.bold,
          color: AppTheme.primary,
          letterSpacing: 0.3,
        ),
      ),
    );
  }
}
