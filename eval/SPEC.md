# Ghar Bhet: record and rule spec (v1, 27 Nov 2026)

This is the contract between the product and the test set. The product fills a **record** from what the ASHA says, and a fixed **rule table** turns the record into **flags**. The test set gives, for each spoken visit, the record and flags a careful human would write.

Sources for every threshold are in `../research/RESEARCH.md` (MoHFW CHO manuals 2021, MCP card, HBNC 2014, SSBSK 2026).

## Visit types

`anc` (a pregnant woman), `pnc` (the mother after delivery), `newborn` (a baby, day 0 to 42).

## Record fields

All fields are optional. Leave a field out when it was not said. Symptoms are a map of code → `true` (said present) or `false` (said absent, e.g. "no swelling", "सूजन नहीं है"). Leave a symptom out entirely when it was not mentioned.

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
| `bp_sys`, `bp_dia` | integers | "150 by 100", "150/100", "एक सौ पचास बटा सौ", "डेढ़ सौ बाय सौ" → 150 / 100 |
| `hb` | number, g/dl, one decimal | "Hb 8.5", "साढ़े आठ" → 8.5, "सात पॉइंट दो" → 7.2 |
| `weight_kg` | number | |
| `albumin` | `nil` / `trace` / `1` / `2` / `3` / `4` | urine albumin plus count: "albumin 2 plus" → 2; "albumin nahi" → nil |
| `fetal_movement` | `normal` / `reduced` / `absent` | "bachha kam hil raha hai" → reduced; "hilna band" → absent |
| `ifa_tablets` | integer | tablets given or taken today/in total as said |

Symptom codes (`anc`): `bleeding`, `leaking_fluid` (water leaking / bag burst), `convulsions`, `severe_headache`, `blurred_vision`, `swelling_face_hands` (face, hands or whole body), `swelling_feet` (feet/legs only), `fever`, `breathless`, `abdominal_pain` (severe), `vomiting` (persistent), `dizziness` (giddiness, weakness, darkness before eyes), `burning_urine`, `foul_discharge`.

### `pnc`
| field | type | notes |
|---|---|---|
| `day` | integer | days since delivery |
| `pads` | integer | pads changed per day |
| `temp_c` | number, °C, one decimal | if said in °F convert: C = (F − 32) × 5/9, round to one decimal. "102 bukhar" with no unit and value > 45 → °F |

Symptom codes (`pnc`): `heavy_bleeding`, `fever`, `foul_discharge`, `convulsions`, `blurred_vision`, `abnormal_speech`, `breathless`, `abdominal_pain`, `burning_urine`, `swelling_face_hands`, `breast_problem`, `dizziness`.

### `newborn`
| field | type | notes |
|---|---|---|
| `day` | integer | day of life ("teesra din" → 3, "7 din ka" → 7) |
| `weight_g` | integer grams | "1.6 kilo" → 1600, "1700 gram" → 1700, "डेढ़ किलो" → 1500, "पौने दो किलो" → 1750 |
| `temp_c` | number °C | as for `pnc`; "99 degree" (value > 45) → °F → 37.2 |
| `resp_rate` | integer per minute | "saans 64 minute mein" → 64 |
| `feeding` | `good` / `poor` / `none` | "doodh theek pee raha" → good; "kam pee raha" → poor; "doodh nahi pee raha" / "not able to feed" → none |

Symptom codes (`newborn`): `convulsions`, `chest_indrawing` ("pasli chal rahi", "chest goes in"), `lethargy` (moves only when touched / does not move / limp), `jaundice` (any yellowness), `jaundice_palms_soles` (yellow palms or soles), `blood_stool`, `cord_pus` (pus, redness or bleeding at the cord), `skin_pustules`, `eye_discharge`, `cold_to_touch`, `hot_to_touch`, `weak_cry`, `vomiting`, `diarrhoea`.

## Rule table (flags)

Flags are computed from the record only. Severity: `refer_now` (danger: refer the same day) or `watch` (counsel, recheck, inform the ANM).

### `anc`
| flag | when | severity |
|---|---|---|
| `anc_imminent_eclampsia` | `bp_dia` > 110 | refer_now |
| `anc_preeclampsia` | (`bp_sys` ≥ 140 or `bp_dia` ≥ 90) and `albumin` ≥ 2 | refer_now |
| `anc_hypertension` | (`bp_sys` ≥ 140 or `bp_dia` ≥ 90), and neither of the two flags above | refer_now |
| `anc_headache_vision` | `severe_headache` or `blurred_vision` present | refer_now |
| `anc_severe_anaemia` | `hb` < 7 | refer_now |
| `anc_moderate_anaemia` | 7 ≤ `hb` < 10 | watch |
| `anc_mild_anaemia` | 10 ≤ `hb` < 11 | watch |
| `anc_bleeding` | `bleeding` present | refer_now |
| `anc_leaking` | `leaking_fluid` present | refer_now |
| `anc_convulsions` | `convulsions` present | refer_now |
| `anc_fever` | `fever` present | refer_now |
| `anc_fetal_movement` | `fetal_movement` is `reduced` or `absent` | refer_now |
| `anc_swelling` | `swelling_face_hands` present | refer_now |
| `anc_breathless` | `breathless` present | refer_now |
| `anc_abdominal_pain` | `abdominal_pain` present | refer_now |

### `pnc`
| flag | when | severity |
|---|---|---|
| `pnc_heavy_bleeding` | `pads` ≥ 5, or `heavy_bleeding` present | refer_now |
| `pnc_high_fever` | `temp_c` > 38.9 (102 °F) | refer_now |
| `pnc_infection` | `foul_discharge` present and (`fever` present or `temp_c` > 37.8) | refer_now |
| `pnc_fever` | `fever` present or `temp_c` ≥ 37.5, and neither fever flag above fired | watch |
| `pnc_convulsions` | `convulsions` present | refer_now |
| `pnc_neuro` | `blurred_vision` or `abnormal_speech` present | refer_now |
| `pnc_breathless` | `breathless` present | refer_now |

### `newborn` (SSBSK 2026 rules: any single sign refers)
| flag | when | severity |
|---|---|---|
| `nb_not_feeding` | `feeding` is `none` | refer_now |
| `nb_poor_feeding` | `feeding` is `poor` | watch |
| `nb_convulsions` | `convulsions` present | refer_now |
| `nb_fast_breathing` | `resp_rate` > 60 | refer_now |
| `nb_chest_indrawing` | `chest_indrawing` present | refer_now |
| `nb_lethargy` | `lethargy` present | refer_now |
| `nb_fever` | `temp_c` ≥ 37.5, or `hot_to_touch` present | refer_now |
| `nb_hypothermia` | `temp_c` < 35.5, or `cold_to_touch` present | refer_now |
| `nb_jaundice_palms` | `jaundice_palms_soles` present | refer_now |
| `nb_jaundice_early` | `jaundice` present and `day` ≤ 1 | refer_now |
| `nb_blood_stool` | `blood_stool` present | refer_now |
| `nb_very_low_weight` | `weight_g` < 1800 | refer_now |
| `nb_low_weight` | 1800 ≤ `weight_g` < 2500 | watch |
| `nb_cord_infection` | `cord_pus` present | watch |
| `nb_skin_pustules` | `skin_pustules` present | watch |

A symptom marked `false` (said absent) never fires a flag.

## Test item format (JSONL, one object per line)

```json
{"id":"nb-017","lang":"hi","script":"devanagari","said":"सुनीता का बच्चा सात दिन का है, वजन एक किलो सात सौ ग्राम, बुखार नहीं है, दूध कम पी रहा है","record":{"type":"newborn","name":"Sunita","day":7,"weight_g":1700,"feeding":"poor","symptoms":{"hot_to_touch":false}},"flags":["nb_very_low_weight","nb_poor_feeding"],"tags":["numbers-in-words","negation"]}
```

Notes for labellers: `fever` is not a newborn symptom code; for a newborn "बुखार नहीं" means `hot_to_touch: false`. For newborn and pnc, "bukhar hai" with no number means `hot_to_touch: true` (newborn) or `fever: true` (pnc). Use these exact codes. When the speaker corrects herself ("140 by 90, nahi, 150 by 100") the record holds the corrected value.
