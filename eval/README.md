# How the published numbers are made

Everything here runs with plain Node 20 and no dependencies. `python eval/check_gold.py` needs Python 3 and nothing else.

## The sets

| File | Items | What it is |
|---|---|---|
| `dev.jsonl` | 120 | First tuning set. The reader was built against it. |
| `dev2.jsonl` | 80 | Second tuning set, written after the first reader worked. |
| `dev3.jsonl` | 76 | **Tuning set, written on 27 Nov 2026 by the same author as the reader fixes.** It holds the round-1 review's failure sentences and a case for every rule added in `mohfw-2026.2`, in Hindi, Marathi and English, Devanagari and Roman, with normal visits. It is not held out and its numbers are not evidence of accuracy on new speech. |
| `dev4.jsonl` | 51 | **Tuning set, written on 27 Nov 2026 (second review round) by the same author as the reader fixes.** It holds the second review's failure sentences (everyday phrasings, whose complaint it is, denials, mild pain, inverted BP) and a case for every rule added in `mohfw-2026.3`. Not held out. |
| `dev5.jsonl` | 26 | **Tuning set, written on 27 Nov 2026 (fourth review round) by the same author as the reader fixes**: English negation, sleepy babies, a fever said with a reading, Fahrenheit corrections, general jaundice/swelling/vision/breathing patterns, blue lips, self-harm, anaemia after birth, pallor in pregnancy, unpunctuated clinical English. Not held out. |
| `heldout.jsonl` | 60 | First held-out set, written from `SPEC.md` only by a separate AI writing pass that never saw the code. It has been run twice (run 1 and run 2 below) and tuned on since, so it is **no longer unseen**. |
| `adversarial.jsonl` | 100 | Independent adversarial set, written from `SPEC.md` (v3) by a separate agent that never saw the code: colloquial danger phrasings, wrong subject, negated lists, boundaries, clinical English, Devanagari-English. Run once as run 1 (below), then tuned on, so it is **no longer unseen**. |
| `adversarial2.jsonl` | 60 | Second independent adversarial set (English and clinical-shorthand heavy, many without punctuation), written from `SPEC.md` by another separate agent that never saw the code. Run once as run 1 against the committed reader `0ed097e`, then tuned on, so it is **no longer unseen**. |
| `heldout2.jsonl` | 60 | Second held-out set, sealed. It is run once, at the end (see below). |
| `vignettes.jsonl` | 40 | Clinical vignettes (30 from the first round, 10 added in the second). Each is labelled only `should_refer` and `urgent`, from the guideline text quoted in its `basis` field, not from `rules.js`. |

Expected flags in every set are recomputed from the gold records by `check_gold.py`, which implements the rule table in `SPEC.md` without importing product code. When the rules change, run `python eval/check_gold.py --fix dev.jsonl dev2.jsonl dev3.jsonl dev4.jsonl dev5.jsonl heldout.jsonl adversarial.jsonl adversarial2.jsonl` (bare names resolve against `eval/`; `--help` prints usage): it rewrites only the `flags` and the two flag-derived tags (`normal-visit`, `watch-only`). Sentences and gold records are never changed by it.

## Which command gives which number

| Published number | Command | Notes |
|---|---|---|
| Held-out run 1: 96.6% of fields, 37 of 38 danger visits, 1 of 22 false alarms (rule set `mohfw-2026.1`) | none can rebuild it exactly, see below | The record is `heldout-run1.json`, `heldout-run1.log` and `heldout-run1.sha256`. |
| Held-out run 2: 99.3% of fields, 38 of 38, 0 of 22 (`mohfw-2026.1`) | `git checkout f34bdd4 -- public/js/understand.js public/js/rules.js eval/run.js eval/heldout.jsonl` then `node eval/run.js heldout` | Every commit from `166ed9f` to `f34bdd4` has the same reader, rules and set (checked 27 Nov 2026). Recorded in `heldout-run2.json`. Run 2 was also made shortly before the first commit; the committed files reproduce its numbers exactly. |
| Held-out now (`mohfw-2026.4`) | `node eval/run.js heldout` | 99.3% of fields, 45 of 45 danger visits, 0 of 15 false alarms. Rule set `2026.2` changed the expected flags of 17 items; 7 visits that were normal under `2026.1` now refer (newborn below 36 °C, breathing exactly 60, cord or skin signs and after-birth fever refer under SSBSK 2026 Forms 3 and 4, foul discharge alone). `2026.3` changed no held-out flags; `2026.4` changed one (h-pnc-002: giddiness after birth is now "signs of anaemia", Hb test today). Two held-out items (h-pnc-001, h-pnc-007) now read `fever: true` where the old gold has only the reading (SPEC v4, below); this costs field precision only. |
| Adversarial run 1: 88.3% of fields (96% precision), 50 of 59 danger visits, 7 of 41 false alarms (`mohfw-2026.3`, 27 Nov 2026 09:39 UTC) | frozen | The record is `adversarial-run1.json`, `adversarial-run1.log` (every miss) and `adversarial-run1.sha256`, plus `public/data/eval-adversarial-run1.json`. These files are never modified. |
| Adversarial run 2 (after fixes) | `node eval/run.js adversarial` | 100% of fields (100% precision), 59 of 59, 0 of 41. Tuned on the set's misses, so this is not an independent number; run 1 is the honest one. |
| Adversarial set 2, run 1: 80.3% of fields (91.6% precision), 36 of 39 danger visits, 9 of 21 false alarms (committed reader `0ed097e`, rule set `mohfw-2026.3`) | frozen | `adversarial2-run1.json`, `adversarial2-run1.log`, `adversarial2-run1.sha256`, `public/data/eval-adversarial2-run1.json`. Never modified. |
| Adversarial set 2, run 2 (after fixes, `mohfw-2026.4`) | `node eval/run.js adversarial2` | 100% of fields (99.7% precision), 40 of 40 danger visits, 0 of 20 false alarms. Tuned on the set; run 1 is the honest number. |
| dev / dev2 / dev3 / dev4 / dev5 | `node eval/run.js dev` (or `dev2` … `dev5`) | Add `--misses` to print every miss. |
| Vignettes | `node eval/run.js vignettes` | Sensitivity and specificity of "should refer", and how many urgent vignettes got an urgent flag. |
| Real speech (dictation page) | `node eval/run.js realspeech <results.json>` | Results file from `public/dictation.html`: `{engine, results:[{id, lang, heard}]}`. Scores the reader on what the speech engine heard and, for the same items, on the written sentence. Writes `public/data/eval-realspeech-<engine>.json`. |

Add `--publish` to write `public/data/eval-<set>.json` for the site. Without it nothing in the repository changes, so `node --test` leaves a clean tree. `--out=DIR` writes elsewhere. The published run files (`heldout-run*.json`, `public/data/eval-heldout-run*.json`) are history and are never rewritten.

### Fields added after a set was written

Rule set `mohfw-2026.2` added fields (pnc BP and Hb, pregnancy risk items, labour hours, birth weight, `temp_f`) and symptom codes; `mohfw-2026.3` added more (pregnancy temperature, further high-risk items, weeks at birth, place of birth, Td doses, and new symptom codes); `mohfw-2026.4` added the symptom codes `cyanosis` (newborn), `self_harm` (after birth) and `pallor` in pregnancy. Older sets have no gold for them, even where a sentence says such a value. `run.js` therefore counts a predicted field only when that set's gold records use the same field for the same visit type somewhere, or the item's own gold has it. Every gold field always counts for recall. Flags are not filtered.

## Adversarial set: run 1, what was fixed, run 2

Before run 1 the coordinator updated three gold records for SPEC v3 fields that the writer could not know: adv-063 `high_fever`, adv-055 `labour_pain` true, adv-049 `labour_pain` false. After run 1 **no gold record was changed**; `check_gold.py` accepts the set's `adv-NNN` ids and the writer's own tag words for this file only (records, flags and severities are checked as for every set).

Run 1 (honest): typed 88.3% of fields, 96% precision, 50 of 59 danger visits caught, 7 of 41 false alarms, 51% of visits exactly right; flags 81.8% recall, 89.2% precision.

What the misses showed, and the general fixes (no item is special-cased; each fix is a unit test in `test/review-cases.test.js`):
- Whose complaint: the named mother's own fever in a newborn visit ("मीना को बुखार", "Jyotila taap"); an elder sibling ("badi beti ko ... bukhar aur ulti"); a relative's fits in Marathi with "पण". Now the woman's own name before ko/को/-ला is the mother in a newborn visit and the patient in her own visit; "badi beti/bada beta" is someone else; a clause with no subject takes one said with ko/को/-ला just before it in the same sentence. In pregnancy "bachche ki halchal" stays the foetus.
- English said in Devanagari letters ("डे सेवन", "टेम्परेचर नाइंटी सेवन पॉइंट फ़ाइव", "बीपी वन थर्टी बाय एटी फ़ाइव") is read as English.
- Number words: the Roman 41-99 words (chhiyasath, bayalis, atthasi, chawalis, chaubees), "teen she" = 300, Marathi Roman "bay" for BP, ordinals chhathe/doosre/ekvisava.
- Days: "since two days", "for 2 days", "ek din mein" are no longer the day of life.
- Weight: "ek kilo saadhe saat sau gram" keeps the whole reading; a unitless birth weight after "janam ke samay" is read.
- Phrases: weak cry "dheema/halu" (also across "bhi"), strong cry "rona tez" as absent, eye discharge "aankh se peela chipchipa paani" (and that "peela" is not jaundice), pustules "pus wale daane", "no pustules" is not "no pus", jaundice "pivlepana", Roman "julab", "raktasrav", "khup raktasrav", "giddy", "talking irrelevant / not making sense", "laghvi thambavta yet nahi", fits described after birth ("aankhen upar chadh, haath pair akad"), burning urine said either way round ("burning while passing urine", "peshaab mein jalan", "urine pass kartana burning"), "saaf dikhta" (vision clear), "saans theek", "breasts soft", "no ... bleeding" after birth as heavy bleeding absent, "fetal movements present".
- A question answered "Bola nahi" is a no; feeding said in the past ("pee raha tha kal tak") is not today's feeding; mild pain reaches one more word ("dard abhi halka hai").
- Names: "baby of X", "visit for X", "X naam ki", and stop-words (वर्षे, from, says, झाग, registration); a name followed by a number must start its clause.
- Iron tablets counted when the iron word was said earlier in the visit.

Run 2 (after the fixes, same set, rule set `mohfw-2026.3`): typed 100% of fields, 100% precision, 59 of 59 danger visits, 0 of 41 false alarms. dev, dev2, dev3, dev4, heldout and the vignettes did not regress.

## Rule set mohfw-2026.4 and the second independent set

**Gold relabelling for SPEC v4 (one convention change, listed in full).** SPEC v3 said a temperature said with "bukhar/taap" is only a reading. SPEC v4 says a fever she says she has stays `fever: true` even with a reading, so "bukhar hai, 100 degree" refers instead of only "watch". In our own tuning sets the gold records were updated to the new convention: dev pnc-002, pnc-005, pnc-006, pnc-009, pnc-015, pnc-019; dev2 d2-pnc-003, d2-pnc-006, d2-pnc-013; dev3 d3-pnc-008, d3-pnc-010; dev4 d4-anc-003 (each adds `symptoms.fever: true`; nothing else changed). The held-out and both adversarial sets were **not** relabelled; where their sentences say a fever with a reading, the reader's `fever: true` shows as an extra field.

**Flags regenerated, records untouched.** Rule set 2026.4 (after-birth anaemia split, low mood refers) changed the expected flags of adversarial adv-076, adv-096, adv-099 and adversarial2 adv2-045, adv2-059 (and the flag-derived `normal-visit`/`watch-only` tags of adversarial2). These were rewritten by `check_gold.py --fix`; sentences and gold records are unchanged. So `adversarial.jsonl` and `adversarial2.jsonl` no longer have the byte hash pinned in their run-1 `.sha256` files; the pinned versions differ only in those `flags`/tags.

**Adversarial set 2, run 1 (honest):** typed 80.3% of fields, 91.6% precision, 36 of 39 danger visits, 9 of 21 false alarms, flags 74.2% recall (committed reader `0ed097e`, rule set `mohfw-2026.3`). Before run 1 the coordinator only normalised formatting (script "latin" to "roman", one empty symptoms map removed). After run 1 no gold record was changed.

What its misses showed, and the general fixes (each has a test in `test/review-cases.test.js`):
- Speech with no punctuation: one person's words spilled onto the next ("mother has fever 101F baby temp 36.2C"), and a "no" or "not" anywhere in the long clause denied everything. Now a person word that is not owned by the word before it ("Sunita ka baby", "Meena's baby" stay joined) starts a new clause; a negation reaches only four words after a sign and stops at the next sign word ("labour pains since 15 hrs water not broken" keeps the pains; "jhatke ya bukhar nahi" still denies both); English "no X" negates what follows it; "denies" negates what follows it and stops at "but", "complains", "c/o"; "cant keep food down" describes the sign.
- Feeding, foetal movement, past values, birth weight, history and Td/age/diabetes are read from the words around them instead of the whole clause ("FM good no h/o fits in previous pregnancy no bleeding PV").
- Shorthand: wt, temp, RR, wks, kgs, tabs, h/o, c/o, "abd pain", "9va din" / "42va din" / "8th month", "38 yrs", "known diabetic on insulin", "both TT done", "kavitas baby"; English "she" is no longer Marathi "she" (hundred).
- Phrases: "patli potty", "dheela pad", "khup zopte / uthat nahi", "passing clots", "delivery wale dard", "stan bhaari, nipple fat gaye", "feels low, crying all the time, no interest", "laghvila jalajal", "pot phuglay", "32 aathavdyat janmala", "pehla bacha" (no births before).
- In a mother's visit a clause that only mentions the baby at its end ("no interest in the baby") is still about her.

Remaining differences on adversarial set 2 after the fixes are SPEC v4 additions the v3 gold could not have: adv2-004 (blue lips, now `cyanosis`, an urgent rule) and adv2-058 (fever said with a reading).

**Adversarial set 2, run 2:** typed 100% of fields, 99.7% precision, 40 of 40 danger visits, 0 of 20 false alarms. dev to dev5, heldout, adversarial (run-2 level kept: 59 of 59, 0 of 41) and the vignettes did not regress.


## Vignettes: the first run and the three label corrections

The 30 vignettes were written and labelled on 27 Nov 2026 before any rule output was looked at. Their first run used the unchanged rule set `mohfw-2026.1` (`rules.js` and `understand.js` as committed in `f34bdd4`). At that time 24 vignettes were labelled should-refer, 6 not, and 12 urgent. Result: 11 of 24 should-refer caught (sensitivity 45.8%), 6 of 6 non-referrals correctly not referred (specificity 100%), and 0 of 12 urgent vignettes got an urgent flag. That last number is 0 by construction, because the 2026.1 rules had no urgent marking. After that run, three labels were corrected from the source text, not from rule output. v-01 and v-05 became urgent because SSBSK 2026 (official) p.22 says danger signs need "immediate referral". v-13 (twins, previous caesarean, age 17) became should-refer because the CHO ANC manual p.27 lists multi-foetal pregnancy for referral. That left 25 should-refer, 5 not, and 14 urgent. Each corrected item says so in its `basis` field. With the new rule table (`mohfw-2026.2`) and the old reader, the result was 21 of 25 (84%), specificity 5 of 5, and urgent 12 of 14. After the reader fixes it was 25 of 25, 5 of 5, and urgent 14 of 14. Several of those fixes were made after seeing vignette misses: the urgent marking, breathing 60 or more, labour hours, the number word "baarah", the after-birth jaundice and incontinence phrases, and cord and eye signs referring. So the vignettes are now a tuned-on set, and the first run is the honest number.

### Second round (rule set `mohfw-2026.3`)

Ten vignettes (v-31 to v-40) were added in the second review round. Their labels were written from the guideline text before any of the new rules existed, and before they were run. The first run used rule set `mohfw-2026.2` with the round-1 reader. On all 40 vignettes it caught 27 of 33 should-refer (81.8%), specificity 7 of 7, and urgent 15 of 18. The six misses were v-31 (fever 103 in pregnancy: no temperature field), v-33 (preterm labour), v-35 (swollen belly with poor feeding), v-36 (calf swelling after birth), v-39 ("daure pad rahe hain") and v-40 ("ghoom nahi raha"). After the round-2 rules and reader fixes, the result is 33 of 33, 7 of 7, and urgent 18 of 18. Two urgent flags fall on vignettes labelled not urgent: v-33 (preterm labour) and v-38 (severe headache and blurred vision after birth). The guideline text for those two says "refer", not "immediately", but the rules make them urgent on clinical grounds after the review. We report that disagreement rather than relabel.

## Run 1 cannot be rebuilt from git, and why

The first held-out run was made at 07:13 UTC (12:43 IST) on 27 Nov 2026, before the first commit (`166ed9f`, 12:57 IST). `heldout-run1.sha256` pins the reader used (`understand.js` sha256 `4000127f…`), but that file was edited before it was first committed (every commit has `3619e19a…`), so its exact text is not in the repository. `rules.js` (`6d153521…`) and `heldout.jsonl` (`59497123…`) in the first commit do match the pins.

What is kept from run 1: the aggregate numbers and, in `heldout-run1.json`, every item that had any error (`typed.misses` and `auto.misses`, with the sentence, each wrong field and the flags wanted and got). An item not listed there was read exactly right. That file is the record of run 1; we do not claim it can be reproduced.

## How the sealed run (heldout2) will be recorded

`heldout2.jsonl` is not opened, printed or run before the final run. The final run will be one command, `node eval/run.js heldout2 --publish`, made once on a committed tree. The log will record, next to the numbers:

- the commit hash (`git rev-parse HEAD`) and `git status --porcelain` showing a clean tree,
- `sha256sum public/js/understand.js public/js/rules.js eval/run.js eval/heldout2.jsonl`,
- the rule set id printed by `run.js`.

These go in `eval/heldout2-run1.log` and `eval/heldout2-run1.sha256`, and the JSON result in `eval/heldout2-run1.json`, committed together right after the run. Any later fix is reported as a separate run, and the first run stays the headline.
