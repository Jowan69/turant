# Turant

Mobile-first emergency help for Indian bank customers. In an emergency (lost card, UPI misuse, money stolen) Turant opens the user's SMS app with the bank's official block command prefilled, or dials the bank's official number, in English, Hindi or Malayalam. The user can also simply say the bank and the problem: the browser's built-in speech recognition turns it into text in the language chosen next to the microphone (which does not have to match the interface language), and Turant opens the matching action. It also drafts a complaint letter the user can email or print.

Turant is a static web app. It has no server and never receives audio or text. There are no analytics and no runtime dependencies, and Turant never sends anything by itself — the user always presses Send or Call.

## Status

The core flow works: pick a bank (or "Money stolen"), pick the problem, then send the bank's official SMS or dial its official number. Actions come from `data/actions.json`, imported at build time, and every entry links back to the bank's own page with its verification date.

Every action card also has a **Write complaint** button. It opens a short form (kept in memory only, cleared when the user leaves) and builds an English letter to the branch, with the user's own words kept exactly as typed in any language. The user can open it in their own mail app, print it (A4, with signature and "received by" boxes), or get directions to the branch. Typing a branch IFSC looks up the branch address at `ifsc.razorpay.com`. That lookup is the only network call Turant's code makes (`npm run validate` checks). The emailed copy leaves the card digits blank because `AGENTS.md` keeps card digits out of every URL except `sms:`. Bank entries are added only from a bank's own official source, with the source recorded in `evidence/`.

## Getting started

```
npm install
npm run dev            # Vite dev server on http://localhost:5173
npm test               # vitest
npm run validate       # data + policy checks
npm run build          # static output in dist/
npm run preview        # serve the built output, with the production security headers
```

## Voice input

Voice input uses the browser's built-in speech recognition (the Web Speech API, `src/speech.ts`), which is Google's speech service in Chrome. Turant has no server and never receives the audio or the text.

1. Tap **Speak** and say the bank and the problem. Tap again to stop early; otherwise the browser stops when you pause.
2. The browser recognises the speech in the language chosen next to the microphone (`en-IN`, `hi-IN` or `ml-IN`) and hands the text to the page.
3. The text goes through the keyword matcher (`src/match.ts`, `src/voice.ts`) and the app opens the matching action, or the bank screen. What was heard is shown on that screen, so a wrong screen can be told apart from a wrong transcript.

**Privacy.** The screen tells users, before they tap, that their browser sends their voice to its own speech service (Google, in Chrome), that Turant does not receive or save it, and that they should not say a card number, PIN or OTP. Digits in what was heard are masked on screen.

**Where it works.** Chrome and Edge (desktop and Android) and Safari. Firefox has no speech recognition, so the microphone says voice is not available and the bank tiles keep working. The browser's speech service needs an internet connection; without one, voice reports a network error.

**Browsers only allow the microphone on `https://` or `localhost`.** On a phone, test against an HTTPS deployment; `http://<your-PC's-IP>:5173` will not offer the microphone.

## Deploying

`npm run build` writes a static site to `dist/`, which any static host can serve over HTTPS. `vercel.json` sets the security headers (Content-Security-Policy and others) on Vercel; on another host, send the same headers.

## Layout

- `index.html` — the shell, with `<main id="app">`.
- `src/main.ts` — the hash router and the screens (bank, problem, action, complaint form, letter), plus the language switch and the microphone buttons.
- `src/links.ts` — pure helpers for the SMS body and `sms:`, `tel:`, `mailto:` and Maps links.
- `src/letter.ts` — pure `buildLetter()` for the complaint letter.
- `src/ifsc.ts` — IFSC format check and the branch lookup.
- `src/speech.ts` — the browser's built-in speech recognition, and its error messages.
- `src/match.ts` — turns spoken words into a bank and a problem using keyword lists in English, Hindi and Malayalam.
- `src/voice.ts` — pure transcript-to-action routing, testable without a microphone or a browser.
- `vercel.json` — security headers (Content-Security-Policy and others); `vite preview` sends the same ones.
- `SECURITY.md` — what Turant keeps, and how to report a wrong number or a security bug.
- `src/style.css` — plain CSS, single column, 18px minimum text, works from 360px.
- `src/i18n/<lang>.json` — every UI string, for `en`, `hi` and `ml`.
- `data/actions.json` — official emergency actions (call number, SMS block commands) per bank.
- `data/grievance.json` — official grievance channels (emails, phones, portal) per bank.
- `data/schemas/` — JSON Schema for both data files.
- `scripts/validate.mjs` — validates the data files and the project's rules.
- `tests/` — vitest tests.
- `.github/workflows/ci.yml` — runs validate, test and build on every push and pull request.
- `.github/CODEOWNERS`, `.github/dependabot.yml` — review owners and weekly npm updates.
- `evidence/` — recorded sources for every bank entry.
- `automations/`, `docs/` — supporting material.

## Adding a bank

Look up the number and block command on the bank's own official website or an RBI-published contact page, record the source under `evidence/`, add the entry to `data/actions.json` or `data/grievance.json`, then run `npm run validate`. Never invent a phone number, SMS command, email address or URL.

## Rules

See `AGENTS.md`.