# Security

## What Turant keeps

Turant has no server, no database, no user accounts and no analytics, and it stores no personal data.

- Bank actions, phone numbers and SMS commands are fixed files in this repository (`data/actions.json`, `data/grievance.json`), each linked to the bank's own official page.
- The only thing saved is your language choice, in your own browser. Card digits and complaint details stay in the browser's memory and are cleared when you leave that screen. Card digits go into a link only inside the `sms:` link you tap yourself.
- Turant never sends anything by itself. You always press Send or Call.
- Voice input uses the browser's built-in speech recognition (Google's service in Chrome). Turant never receives the audio or the text.

## Report a wrong number or SMS command

Open an issue in this repository's GitHub Issues. Include the bank, the action, and a link to the bank's own official page that shows the right number or command. Entries change only from a bank's official source.

## Report a security bug

Do not open a public issue. Use GitHub private vulnerability reporting: on this repository's **Security** tab, choose **Report a vulnerability**. Only the maintainer can see the report.
