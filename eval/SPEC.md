# Ghar Bhet: record and rule spec (v2, rule set `mohfw-2026.2`, 27 Nov 2026)

This is the contract between the product and the test sets. The product fills a **record** from what the ASHA says, and a fixed **rule table** turns the record into **flags**. A test item gives, for each spoken visit, the record and flags a careful human would write. Gold flags are always recomputed from the gold record by `check_gold.py`, which implements the rule table below without importing product code.

Sources for every threshold are in `../docs/RESEARCH.md` (MoHFW CHO manuals 2021, SBA guidelines 2010, Maternal Near Miss guidelines 2014, MCP card, HBNC 2014, SSBSK Operational Guidelines 2026 final of 06-08-2026, Anemia Mukt Bharat 2026, PMSMA fact sheet 2026). Section 9 of RESEARCH.md lists the pages.

v2 changes (from `mohfw-2026.1`): pnc BP and Hb; pregnancy risk items; labour hours; birth weight; `temp_f`; new symptom codes; 27 new rules; newborn cold line moved to 36 °C (official SSBSK), fast breathing to 60 or more; cord, skin and eye signs refer (SSBSK Form 3); after-birth fever refers (SSBSK Form 4).

## Visit types

`anc` (a pregnant woman), `pnc` (the mother after delivery), `newborn` (a baby, day 0 to 42).

## Record fields

All fields are optional. Leave a field out when it was not said. A record never carries a field of another visit type. Symptoms are a map of code → `true` (said present) or `false` (said absent, e.g. "no swelling", "सूजन नहीं है"). Leave a symptom out entirely when it was not mentioned.

**Past and present.** When a value is said twice, the one said for now wins: a number next to a past marker (pichli baar, pehle, kal, janam ke samay, at birth, tha/thi/the, was, last time, मागच्या वेळी, आधी) loses to a number next to a now marker (aaj, ab, abhi, now, आता) or an unmarked one. "BP 140 by 90 hai, lekin pichli baar 120 by 80 tha" → 140/90. When the speaker corrects herself ("140 by 90, nahi, 150 by 100") the record holds the corrected value.

**Ranges.** "chaar se paanch pad", "4 ya 5", "4 to 5": the more dangerous end (higher pads, temperature, breaths, BP; lower weight, Hb).

**Subject.** Symptoms said about someone else (saas, sasur, pati, devar, another woman; the mother in a newborn visit; the baby in a pnc visit) are left out.

### Common
| field | type | notes |
|---|---|---|
| `type` | `anc` / `pnc` / `newborn` | |
| `name` | string | first name as said, e.g. "Sunita". For a newborn, the mother's name if that is how she is referred to ("Sunita ka baby" → name "Sunita") |

### `anc`
| field | type | notes |
|---|---|---|
| `weeks` | integer | weeks of pregnancy if said in weeks ("32 hafte") |
| `month` | integer 1-10 | month of pregnancy if said in months ("saatva mahina" → 7). Do not convert between months and weeks |
| `bp_sys`, `bp_dia` | integers | "150 by 100", "150/100", "150 bata 100", "150 slash 100", "one fifty over hundred", "एक सौ पचास बटा सौ", "150 upar 100 neeche" → 150 / 100 |
| `hb` | number, g/dl, one decimal | "Hb 8.5", "साढ़े आठ" → 8.5, "सात पॉइंट दो" → 7.2. Bare "khoon" is not Hb; "khoon ki matra/kami/jaanch" is |
| `weight_kg` | number | |
| `albumin` | `nil` / `trace` / `1` / `2` / `3` / `4` | "albumin 2 plus", "albumin plus plus" → 2; "albumin nahi" → nil |
| `fetal_movement` | `normal` / `reduced` / `absent` | |
| `ifa_tablets` | integer | |
| `age` | integer years | "umar 17 saal", "age 38", "वय 19 वर्षे" (v2) |
| `height_cm` | integer | "lambai 140 cm" (v2) |
| `labour_hours` | integer | hours of labour pain: "dard 14 ghante se", "labour pain for 14 hours" (v2) |
| `twins` | boolean | "judwa", "जुळी", "twins" (v2) |
| `prev_caesarean` | boolean | previous delivery by operation (v2) |
| `prev_pph` | boolean | heavy bleeding after a previous delivery (v2) |
| `prev_aph` | boolean | bleeding in a previous pregnancy (v2) |
| `prev_eclampsia` | boolean | fits or eclampsia in a previous pregnancy (v2) |

Symptom codes (`anc`): `bleeding`, `leaking_fluid` (water leaking / bag burst), `convulsions`, `severe_headache`, `blurred_vision`, `swelling_face_hands` (face, hands or whole body), `swelling_feet` (feet/legs only), `fever`, `breathless`, `abdominal_pain` (severe), `vomiting`, `dizziness` (giddiness, weakness, darkness before eyes), `burning_urine`, `foul_discharge` (foul or abnormal discharge).

### `pnc`
| field | type | notes |
|---|---|---|
| `day` | integer | days since delivery |
| `pads` | integer | pads changed per day |
| `temp_c` | number, °C, one decimal | if said in °F convert: C = (F − 32) × 5/9, round to one decimal. "102 bukhar" with no unit and value > 45 → °F |
| `temp_f` | number | v2, optional: the Fahrenheit value exactly as said, kept so 102 °F compares as 102 °F. Only when said in °F |
| `bp_sys`, `bp_dia` | integers | as for `anc` (v2) |
| `hb` | number | as for `anc` (v2) |

Symptom codes (`pnc`): `heavy_bleeding`, `fever`, `foul_discharge`, `convulsions`, `blurred_vision`, `abnormal_speech`, `breathless`, `abdominal_pain`, `burning_urine`, `swelling_face_hands`, `breast_problem`, `dizziness`, and in v2 `severe_headache`, `jaundice` (her eyes or skin yellow), `incontinence` (urine or stool she cannot hold), `pallor` (pale, white).

### `newborn`
| field | type | notes |
|---|---|---|
| `day` | integer | day of life ("teesra din" → 3, "7 din ka" → 7). "do din se dast" is a duration, not the day |
| `weight_g` | integer grams | weight now. "1.6 kilo" → 1600, "2,400 grams" → 2400. Under 800 or over 6000 is not filled; the app asks back |
| `birth_weight_g` | integer grams | v2: weight at birth ("janam ke samay vajan 1700 tha") |
| `temp_c` | number °C | as for `pnc`; "99 degree" (value > 45) → °F → 37.2 |
| `temp_f` | number | as for `pnc` (v2) |
| `resp_rate` | integer per minute | |
| `feeding` | `good` / `poor` / `none` | "stanpan nahi kar raha" → none |

Symptom codes (`newborn`): `convulsions`, `chest_indrawing` ("pasli chal rahi", "chest andar ja raha"), `lethargy`, `jaundice` (any yellowness), `jaundice_palms_soles`, `blood_stool`, `cord_pus` (pus, redness or bleeding at the cord), `skin_pustules`, `eye_discharge`, `cold_to_touch`, `hot_to_touch`, `weak_cry`, `vomiting`, `diarrhoea`, and in v2 `difficulty_breathing` ("saans lene mein takleef", "श्वास घ्यायला त्रास").

Never both `hot_to_touch` and `cold_to_touch` true. A temperature word alone ("taapmaan", "tapman") is not `hot_to_touch`.

## Rule table (flags)

Flags are computed from the record only. Severity: `refer_now` (refer the same day) or `watch` (advise, recheck, tell the ANM). Rules marked **urgent** say "now, call 108" because the source says immediately or urgently. A symptom marked `false` never fires a flag. Temperatures compare on `temp_f` when present (exact), else on `temp_c`; "above 102 °F" with `temp_c` only means `temp_c` > 38.9.

### `anc`
| flag | when | severity |
|---|---|---|
| `anc_imminent_eclampsia` | `bp_dia` > 110 | refer_now, urgent |
| `anc_severe_hypertension` | (`bp_sys` ≥ 160 or `bp_dia` ≥ 110) and not `bp_dia` > 110 | refer_now, urgent |
| `anc_preeclampsia` | (`bp_sys` ≥ 140 or `bp_dia` ≥ 90) and `albumin` ≥ 2 | refer_now, urgent |
| `anc_hypertension` | (`bp_sys` ≥ 140 or `bp_dia` ≥ 90), not severe range, `albumin` < 2 | refer_now |
| `anc_headache_vision` | `severe_headache` or `blurred_vision` | refer_now, urgent |
| `anc_severe_anaemia` | `hb` < 7 | refer_now, urgent |
| `anc_moderate_anaemia` | 7 ≤ `hb` < 10 | watch |
| `anc_mild_anaemia` | 10 ≤ `hb` < 11 | watch |
| `anc_bleeding` | `bleeding` | refer_now, urgent |
| `anc_leaking` | `leaking_fluid` | refer_now, urgent |
| `anc_convulsions` | `convulsions` | refer_now, urgent |
| `anc_fever` | `fever` | refer_now |
| `anc_fetal_movement` | `fetal_movement` is `reduced` or `absent` | refer_now |
| `anc_swelling` | `swelling_face_hands` | refer_now |
| `anc_breathless` | `breathless` | refer_now |
| `anc_abdominal_pain` | `abdominal_pain` | refer_now |
| `anc_burning_urine` | `burning_urine` | refer_now |
| `anc_discharge` | `foul_discharge` | refer_now |
| `anc_labour_prolonged` | `labour_hours` > 12 | refer_now, urgent |
| `anc_multiple_pregnancy` | `twins` | refer_now |
| `anc_vomiting` | `vomiting` | watch |
| `anc_dizziness` | `dizziness` | watch |
| `anc_high_risk` | `age` < 18 or > 35, `height_cm` < 145, or any of `prev_caesarean`, `prev_pph`, `prev_aph`, `prev_eclampsia` | watch |

### `pnc`
| flag | when | severity |
|---|---|---|
| `pnc_heavy_bleeding` | `pads` ≥ 5, or `heavy_bleeding` | refer_now, urgent |
| `pnc_severe_hypertension` | `bp_sys` ≥ 160 or `bp_dia` ≥ 110 | refer_now, urgent |
| `pnc_hypertension` | (`bp_sys` ≥ 140 or `bp_dia` ≥ 90), not severe range | refer_now |
| `pnc_severe_anaemia` | `hb` < 7, or `dizziness`, or `pallor` | refer_now |
| `pnc_high_fever` | temperature above 102 °F | refer_now, urgent |
| `pnc_uti` | `burning_urine` | refer_now |
| `pnc_infection` | `foul_discharge` | refer_now |
| `pnc_fever` | (`fever` or temperature ≥ 37.5 °C), and no high fever, no `burning_urine`, no `foul_discharge` | refer_now |
| `pnc_convulsions` | `convulsions` | refer_now, urgent |
| `pnc_neuro` | `blurred_vision` or `abnormal_speech` | refer_now |
| `pnc_headache` | `severe_headache` | refer_now |
| `pnc_breathless` | `breathless` | refer_now |
| `pnc_abdominal_pain` | `abdominal_pain` | refer_now |
| `pnc_swelling` | `swelling_face_hands` | refer_now |
| `pnc_jaundice` | `jaundice` | refer_now |
| `pnc_incontinence` | `incontinence` | refer_now |
| `pnc_breast` | `breast_problem` | watch |

### `newborn` (SSBSK 2026: any single danger sign means immediate referral)
| flag | when | severity |
|---|---|---|
| `nb_not_feeding` | `feeding` is `none` | refer_now, urgent |
| `nb_poor_feeding` | `feeding` is `poor` | watch |
| `nb_convulsions` | `convulsions` | refer_now, urgent |
| `nb_fast_breathing` | `resp_rate` ≥ 60 | refer_now, urgent |
| `nb_difficulty_breathing` | `difficulty_breathing` | refer_now, urgent |
| `nb_chest_indrawing` | `chest_indrawing` | refer_now, urgent |
| `nb_lethargy` | `lethargy` | refer_now, urgent |
| `nb_fever` | temperature ≥ 37.5 °C, or `hot_to_touch` | refer_now, urgent |
| `nb_hypothermia` | temperature < 36 °C, or `cold_to_touch` | refer_now, urgent |
| `nb_cool` | 36 ≤ temperature < 36.5 °C | watch |
| `nb_jaundice_palms` | `jaundice_palms_soles` | refer_now, urgent |
| `nb_jaundice_early` | `jaundice` and `day` ≤ 1 | refer_now, urgent |
| `nb_jaundice_late` | `jaundice` and `day` > 14 | refer_now |
| `nb_blood_stool` | `blood_stool` | refer_now, urgent |
| `nb_very_low_weight` | `weight_g` < 1800 | refer_now, urgent |
| `nb_low_weight` | 1800 ≤ `weight_g` < 2500 | watch |
| `nb_at_risk_birth_weight` | `birth_weight_g` < 2500 | watch |
| `nb_cord_infection` | `cord_pus` | refer_now |
| `nb_skin_pustules` | `skin_pustules` | refer_now |
| `nb_eye_discharge` | `eye_discharge` | refer_now |
| `nb_sepsis_signs` | 2 or more of: `lethargy`; `feeding` poor or none; `weak_cry`; `vomiting`; `cold_to_touch`, `hot_to_touch`, temperature < 36 °C or > 99 °F; `chest_indrawing`; `resp_rate` > 60; `cord_pus` (HBNC 2014 checklist) | refer_now, urgent |
| `nb_weak_cry` | `weak_cry` | watch |
| `nb_vomiting` | `vomiting` | watch |
| `nb_diarrhoea` | `diarrhoea` | watch |

### Never silent

`noted(record, flags)` in rules.js lists every symptom marked `true` that no fired flag covers (for example jaundice on day 5, or swelling of the feet in pregnancy). The app shows these as "Noted: tell the nurse" and never shows "No danger signs" while the list is not empty.

## Test item format (JSONL, one object per line)

```json
{"id":"nb-017","lang":"hi","script":"devanagari","said":"सुनीता का बच्चा सात दिन का है, वजन एक किलो सात सौ ग्राम, बुखार नहीं है, दूध कम पी रहा है","record":{"type":"newborn","name":"Sunita","day":7,"weight_g":1700,"feeding":"poor","symptoms":{"hot_to_touch":false}},"flags":["nb_poor_feeding","nb_very_low_weight"],"tags":["numbers-in-words","negation"]}
```

Ids: `nb-`, `anc-`, `pnc-` in dev; `d2-` and `d3-` prefixes in dev2 and dev3; `h-` in the held-out sets.

Notes for labellers: `fever` is not a newborn symptom code; for a newborn "बुखार नहीं" means `hot_to_touch: false`. For newborn and pnc, "bukhar hai" with no number means `hot_to_touch: true` (newborn) or `fever: true` (pnc). Use these exact codes.

## How fields added later are scored

Sets written before v2 (dev, dev2, heldout) have no gold for the v2 fields, though a sentence may say such a value (a pnc BP, a previous caesarean). `eval/run.js` therefore counts a predicted field only when that set's gold records use the same field for the same visit type somewhere, or the item's own gold has it. Every gold field always counts for recall. Expected flags are recomputed from the gold records with the current rules (`python eval/check_gold.py --fix …`); the published run-1 and run-2 files keep the flags of their time.
