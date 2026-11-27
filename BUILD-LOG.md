# Build log

Ghar Bhet was built during Round 2 of the Scaler × Wispr Flow "India Runs on Voice" hackathon (Round 2 window: 27 to 30 Nov 2026), by one person with a coding tool. All times are IST.

## 27 Nov 2026

| When | What | Commit |
|---|---|---|
| Morning | Research brief on ASHA home visits, the official forms (MCP card, SSBSK 2026 Forms 3 and 4, HBNC 2014) and every danger threshold with its source: `docs/RESEARCH.md`. Three design directions mocked up and one chosen. | (before the first commit) |
| Morning | The contract first: `eval/SPEC.md` (record fields and rule table). Test sets written from the spec alone by a separate AI writing pass that never saw the code. | (before the first commit) |
| Late morning | The reader (`understand.js`), the 37-rule table (`rules.js`), the server and register, the visit page, the nurse's board, the slip, the home, rules and results pages, tests. The first held-out run (96.6% of fields, 37 of 38 danger visits) was made at 12:43, before the first commit; its log and per-item outputs are in `eval/heldout-run1.*`. | `166ed9f` 12:57, the first commit, which holds this morning's work |
| 12:58 | Test results published with the site | `7d8f230` |
| 13:09 | Number words shown in Roman letters; typing box opens when the browser can't listen | `3ec2870` |
| 13:13 | The nurse can ask the board out loud | `ccf399b` |
| 13:20 | Cover image; the brief's "typing, tapping or filling forms" quoted | `f34bdd4` |
| 13:20 to 14:29 | An internal review in eight parts (voice, build, health, deck, design, adversarial, an AI-screener read, copy) found gaps: no after-birth BP rule, "2,400 g" read as 400 g, a loose voice-save command, claims worded too strongly. Fixed: 64 cited rules, a sturdier reader, a hands-free voice loop with read-back and offline saving, a safer server with the register in Cloud Storage, honest wording, a guideline-labelled vignette check (first run: 11 of 24) and a real-speech test page | `d5c521a` 14:29 |
| 14:33 | Results that have not run yet shown as pending | `9dbe455` |

Later entries follow the commit history: `git log --reverse`.

## What is ours

Everything in this repository was written during the hackathon: there is no template and there are no npm dependencies. The only outside pieces at run time are the browser's speech recognition and text-to-speech, Google Fonts, and Node.js itself.
