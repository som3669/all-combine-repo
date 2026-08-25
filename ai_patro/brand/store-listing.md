# Play Store listing copy

Paste into Play Console → Grow users → Store presence → Main store listing.
Limits: app name 30, short description 80, full description 4000, what's new 500.

## App name (30)

```
AI Patro - Nepali Calendar
```
25 chars.

## Short description (80)

```
Nepali Bikram Sambat calendar with tithi, panchang, festivals and muhurat.
```
73 chars.

## Full description (4000)

```
AI Patro is a Nepali Bikram Sambat (BS) calendar for everyday use - accurate
tithi, public holidays, panchang and muhurat, in Nepali or English.

WHAT'S INSIDE

- Full BS calendar with matching AD dates
- Daily tithi, paksha and nakshatra
- Nepali public holidays and festivals
- Tithi Patro: tithi and nakshatra for every day of the month
- Panchang detail: tithi, nakshatra, yoga, karana, sunrise, sunset, Rahukaal
- Muhurat / Saait finder: auspicious dates for marriage and other ceremonies
- Kundali and rashifal
- Puja vidhi (ritual guides) and festival greetings
- Baby name suggestions
- BS to AD date converter, both directions
- Foreign exchange rates
- Document scanner with PDF export
- Event reminders and notifications
- Home screen widget
- Full Nepali / English toggle, light and dark themes

HOW THE PANCHANG IS CALCULATED

Tithi, nakshatra, yoga and karana are computed astronomically on your device.
No network needed, no guesswork. Where AI is used, it only explains those
already-computed values in plain language - it never generates a date or an
astronomical fact.

ABOUT THE AI FEATURES

The AI assistant, panchang explanations, greetings and name suggestions run on
Groq. To use them, add your own free Groq API key in Settings (get one at
console.groq.com/keys). Everything else - calendar, tithi, panchang, holidays,
muhurat, date converter, widget - works fully offline without a key.

PRIVACY

No account required. No personal data collected. Your API key is stored only
on your device.
```

## What's new (500)

```
- Android 15 and later: fixed edge-to-edge layout, so no content sits under
  the status or navigation bars
- Refreshed app icon to match the in-app theme
- Build and packaging fixes
```

## Graphics to upload

| Asset | File | Size |
|---|---|---|
| App icon | `brand/blue/play-icon-512.png` | 512x512, opaque |
| Feature graphic | `assets/feature_graphic.png` | 1024x500 |
| Phone screenshots | `screenshots/play/*.png` | 1080x2160 |

Screenshot order: `01-calendar`, `04-tithi-patro`, `02-panchang`, `05-muhurat`,
`03-drawer`.

## Also fix in Console

- **App content -> Ads**: the listing currently says "Contains ads". The project
  has no ads SDK (no admob, google_mobile_ads, applovin, unity_ads). Set this to
  "No, my app does not contain ads" or the declaration is inaccurate.
- **Tablet screenshots**: the production track targets Phones, Tablets, Chrome OS
  and Android XR. Only phone screenshots exist; large-screen listings will show
  reduced quality without 7-inch and 10-inch captures.
