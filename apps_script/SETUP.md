# Survey logging — Google Sheets via Apps Script

The app sends each questionnaire submission as JSON to a Google Apps Script
web app, which appends it as a row in a Google Sheet on your Drive. No API
keys or OAuth live in the app.

## One-time setup

1. Create a new Google Sheet on the Drive account that should own the data.
2. In the Sheet: **Extensions → Apps Script**.
3. Delete the default `Code.gs` contents and paste this folder's `Code.gs`. Save.
4. **Deploy → New deployment → ⚙ → Web app**:
   - *Description*: `mmfetus survey`
   - *Execute as*: **Me**
   - *Who has access*: **Anyone**
   - Click **Deploy**, authorize when prompted.
5. Copy the **Web app URL** (ends in `/exec`).

## Wire it into the app

Either edit `flutter_app/lib/config.dart` (`defaultValue:` of `appsScriptUrl`),
or pass it at build time without touching source:

```bash
flutter build apk --release --dart-define=APPS_SCRIPT_URL=https://script.google.com/macros/s/XXXX/exec
```

## Test it

```bash
curl -L -X POST -H "Content-Type: application/json" \
  -d '{"timestamp":"test","case_id":"Caso 01","role":"Estudante","q1":5}' \
  "https://script.google.com/macros/s/XXXX/exec"
```

A new row should appear in the `respostas` tab. Columns are created
automatically from the JSON keys, so the first submission defines the header.
