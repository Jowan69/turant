- Never run git commit, git push or any git command that changes history. The human commits.

- Never invent a phone number, SMS command, email address or URL. Bank data comes only from data/actions.json and data/grievance.json.

- No runtime dependencies, no third-party scripts, no analytics, no external fonts or CDNs.

- Never store, log or put into a URL any card or account digits, except inside the sms: link the user taps.

- Turant never sends anything by itself. The user always presses Send or Call.

- Languages: en, hi, ml. Every UI string lives in src/i18n/<lang>.json.

- Before saying a task is done, run npm run validate (once it exists), npm test and npm run build, and fix failures.