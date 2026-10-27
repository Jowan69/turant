# Turant

Mobile-first emergency help for Indian bank customers. In an emergency (lost card, UPI misuse, money stolen) Turant opens the user's SMS app with the bank's official block command prefilled, or dials the bank's official number, in English, Hindi or Malayalam. The user can also simply say the bank and the problem; the microphone listens in the language chosen next to it, which does not have to match the interface language. It also drafts a complaint letter the user can email or print.

Turant is a static web app. There is no backend, no analytics and no runtime dependency, and it never sends anything by itself — the user always presses Send or Call.

## Status

The core flow works: pick a bank (or "Money stolen"), pick the problem, then send the bank's official SMS or dial its official number. Actions come from `data/actions.json`, imported at build time, and every entry links back to the bank's own page with its verification date. Bank entries are added only from a bank's own official source, with the source recorded in `evidence/`.

## Getting started

```
npm install
npm run dev       # Vite dev server
npm test          # vitest, no tests fail an empty suite
npm run validate  # data + policy checks
npm run build     # static output in dist/
npm run preview   # serve the built output
```

## Layout

- `index.html` — the shell, with `<main id="app">`.
- `src/main.ts` — the hash router and the three screens (bank, problem, action), plus the language switch and voice input.
- `src/links.ts` — pure helpers for the SMS body, `sms:` links and `tel:` links.
- `src/match.ts` — turns spoken words into a bank and a problem using keyword lists in English, Hindi and Malayalam.
- `src/voice.ts` — pure transcript-to-action routing, testable without a microphone or a browser.
- `src/style.css` — plain CSS, single column, 18px minimum text, works from 360px.
- `src/i18n/<lang>.json` — every UI string, for `en`, `hi` and `ml`.
- `data/actions.json` — official emergency actions (call number, SMS block commands) per bank.
- `data/grievance.json` — official grievance channels (emails, phones, portal) per bank.
- `data/schemas/` — JSON Schema for both data files.
- `scripts/validate.mjs` — validates the data files and the project's rules.
- `tests/` — vitest tests.
- `evidence/` — recorded sources for every bank entry.
- `automations/`, `docs/` — supporting material.

## Adding a bank

Look up the number and block command on the bank's own official website or an RBI-published contact page, record the source under `evidence/`, add the entry to `data/actions.json` or `data/grievance.json`, then run `npm run validate`. Never invent a phone number, SMS command, email address or URL.

## Rules

See `AGENTS.md`.