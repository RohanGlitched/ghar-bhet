# How the published numbers are made

Everything here runs with plain Node 20 and no dependencies. `python eval/check_gold.py` needs Python 3 and nothing else.

## The sets

| File | Items | What it is |
|---|---|---|
| `dev.jsonl` | 120 | First tuning set. The reader was built against it. |
| `dev2.jsonl` | 80 | Second tuning set, written after the first reader worked. |
| `dev3.jsonl` | 76 | **Tuning set, written on 27 Nov 2026 by the same author as the reader fixes.** It holds the judges' round-1 failure sentences and a case for every rule added in `mohfw-2026.2`, in Hindi, Marathi and English, Devanagari and Roman, with normal visits. It is not held out and its numbers are not evidence of accuracy on new speech. |
| `heldout.jsonl` | 60 | First held-out set, written from `SPEC.md` only by a separate AI writing pass that never saw the code. It has been run twice (run 1 and run 2 below) and tuned on since, so it is **no longer unseen**. |
| `heldout2.jsonl` | 60 | Second held-out set, sealed. It is run once, at the end (see below). |
| `vignettes.jsonl` | 30 | Clinical vignettes. Each is labelled only `should_refer` and `urgent`, from the guideline text quoted in its `basis` field, not from `rules.js`. |

Expected flags in every set are recomputed from the gold records by `check_gold.py`, which implements the rule table in `SPEC.md` without importing product code. When the rules change, run `python eval/check_gold.py --fix dev.jsonl dev2.jsonl dev3.jsonl heldout.jsonl`: it rewrites only the `flags` and the two flag-derived tags (`normal-visit`, `watch-only`). Sentences and gold records are never changed by it.

## Which command gives which number

| Published number | Command | Notes |
|---|---|---|
| Held-out run 1: 96.6% of fields, 37 of 38 danger visits, 1 of 22 false alarms (rule set `mohfw-2026.1`) | none can rebuild it exactly, see below | The record is `heldout-run1.json`, `heldout-run1.log` and `heldout-run1.sha256`. |
| Held-out run 2: 99.3% of fields, 38 of 38, 0 of 22 (`mohfw-2026.1`) | `git checkout f34bdd4 -- public/js/understand.js public/js/rules.js eval/run.js eval/heldout.jsonl` then `node eval/run.js heldout` | Every commit from `166ed9f` to `f34bdd4` has the same reader, rules and set (checked 27 Nov 2026). Recorded in `heldout-run2.json`. Run 2 was also made shortly before the first commit; the committed files reproduce its numbers exactly. |
| Held-out now (`mohfw-2026.2`) | `node eval/run.js heldout` | 99.3% of fields, 45 of 45 danger visits, 0 of 15 false alarms. The new rules changed the expected flags of 17 items; 7 visits that were normal under `2026.1` now refer (newborn below 36 °C, breathing exactly 60, cord or skin signs and after-birth fever refer under SSBSK 2026 Forms 3 and 4, foul discharge alone). |
| dev / dev2 / dev3 | `node eval/run.js dev` (or `dev2`, `dev3`) | Add `--misses` to print every miss. |
| Vignettes | `node eval/run.js vignettes` | Sensitivity and specificity of "should refer", and how many urgent vignettes got an urgent flag. |
| Real speech (dictation page) | `node eval/run.js realspeech <results.json>` | Results file from `public/dictation.html`: `{engine, results:[{id, lang, heard}]}`. Scores the reader on what the speech engine heard and, for the same items, on the written sentence. Writes `public/data/eval-realspeech-<engine>.json`. |

Add `--publish` to write `public/data/eval-<set>.json` for the site. Without it nothing in the repository changes, so `node --test` leaves a clean tree. `--out=DIR` writes elsewhere. The published run files (`heldout-run*.json`, `public/data/eval-heldout-run*.json`) are history and are never rewritten.

### Fields added after a set was written

Rule set `mohfw-2026.2` added fields (pnc BP and Hb, pregnancy risk items, labour hours, birth weight, `temp_f`) and symptom codes. Older sets have no gold for them, even where a sentence says such a value. `run.js` therefore counts a predicted field only when that set's gold records use the same field for the same visit type somewhere, or the item's own gold has it. Every gold field always counts for recall. Flags are not filtered.

## Vignettes: the first run and the three label corrections

The 30 vignettes were written and labelled on 27 Nov 2026 before any rule output was looked at. Their first run used the unchanged rule set `mohfw-2026.1` (`rules.js` and `understand.js` as committed in `f34bdd4`). At that time 24 vignettes were labelled should-refer, 6 not, and 12 urgent. Result: 11 of 24 should-refer caught (sensitivity 45.8%), 6 of 6 non-referrals correctly not referred (specificity 100%), and 0 of 12 urgent vignettes got an urgent flag. That last number is 0 by construction, because the 2026.1 rules had no urgent marking. After that run, three labels were corrected from the source text, not from rule output. v-01 and v-05 became urgent because SSBSK 2026 (official) p.22 says danger signs need "immediate referral". v-13 (twins, previous caesarean, age 17) became should-refer because the CHO ANC manual p.27 lists multi-foetal pregnancy for referral. That left 25 should-refer, 5 not, and 14 urgent. Each corrected item says so in its `basis` field. With the new rule table (`mohfw-2026.2`) and the old reader, the result was 21 of 25 (84%), specificity 5 of 5, and urgent 12 of 14. After the reader fixes it was 25 of 25, 5 of 5, and urgent 14 of 14. Several of those fixes were made after seeing vignette misses: the urgent marking, breathing 60 or more, labour hours, the number word "baarah", the after-birth jaundice and incontinence phrases, and cord and eye signs referring. So the vignettes are now a tuned-on set, and the first run is the honest number.

## Run 1 cannot be rebuilt from git, and why

The first held-out run was made at 07:13 UTC (12:43 IST) on 27 Nov 2026, before the first commit (`166ed9f`, 12:57 IST). `heldout-run1.sha256` pins the reader used (`understand.js` sha256 `4000127f…`), but that file was edited before it was first committed (every commit has `3619e19a…`), so its exact text is not in the repository. `rules.js` (`6d153521…`) and `heldout.jsonl` (`59497123…`) in the first commit do match the pins.

What is kept from run 1: the aggregate numbers and, in `heldout-run1.json`, every item that had any error (`typed.misses` and `auto.misses`, with the sentence, each wrong field and the flags wanted and got). An item not listed there was read exactly right. That file is the record of run 1; we do not claim it can be reproduced.

## How the sealed run (heldout2) will be recorded

`heldout2.jsonl` is not opened, printed or run before the final run. The final run will be one command, `node eval/run.js heldout2 --publish`, made once on a committed tree. The log will record, next to the numbers:

- the commit hash (`git rev-parse HEAD`) and `git status --porcelain` showing a clean tree,
- `sha256sum public/js/understand.js public/js/rules.js eval/run.js eval/heldout2.jsonl`,
- the rule set id printed by `run.js`.

These go in `eval/heldout2-run1.log` and `eval/heldout2-run1.sha256`, and the JSON result in `eval/heldout2-run1.json`, committed together right after the run. Any later fix is reported as a separate run, and the first run stays the headline.
