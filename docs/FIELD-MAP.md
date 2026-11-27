# Field map: official visit forms vs the Ghar Bhet record

Ghar Bhet fills the **danger-sign and vital fields** of a home visit from what the ASHA says. It does not yet fill every item of the official forms. This table lists the items on the forms, the record field that holds each one, and whether the reader captures it today (rule set `mohfw-2026.3`, 27 Nov 2026).

Sources: Mother and Child Protection (MCP) card, NHM-hosted English card (see `RESEARCH.md` section 3); SSBSK Operational Guidelines 2026, official final of 06-08-2026: Form 2B and Form 3 (newborn, ASHA) pp.112-114, Form 4 (mother after birth) p.115; RCH register PW-2 (pregnancy visit). Page numbers are the printed ones.

Legend: **yes** = read from speech and checked by the rules where a rule exists; **yes (no rule)** = read and stored, no rule uses it; **not yet** = not captured.

## Pregnancy visit (MCP card antenatal section, RCH PW-2)

| Form item | Ghar Bhet field | Captured |
|---|---|---|
| Woman's name | `name` | yes |
| Age | `age` | yes (high-risk rule: under 18 or over 35) |
| Weeks of pregnancy (POG) | `weeks` | yes |
| Month of pregnancy (as ASHAs say it) | `month` | yes |
| LMP, EDD (dates) | — | not yet (dates are not parsed) |
| Number of pregnancies / previous live births (gravida, para) | `previous_births` | yes (births before this pregnancy; 4 or more is high risk) |
| Obstetric complication in previous pregnancy: APH, PPH, eclampsia, LSCS | `prev_aph`, `prev_pph`, `prev_eclampsia`, `prev_caesarean` | yes |
| Previous stillbirth or newborn death | `prev_stillbirth` | yes |
| Previous preterm birth or baby under 2500 g | `prev_preterm` | yes |
| Obstructed labour, congenital anomaly, infertility treatment (CHO p.18 history list) | — | not yet |
| Past history: hypertension, heart disease, diabetes, TB, asthma | `heart_disease`, `diabetes` | heart disease and diabetes yes; others not yet |
| Weight (kg) | `weight_kg` | yes (no rule) |
| Height | `height_cm` | yes (cm, or feet and inches; under 145 cm is high risk) |
| Pulse rate | — | not yet |
| Blood pressure | `bp_sys`, `bp_dia` | yes |
| Pallor, oedema | `symptoms.swelling_face_hands`, `symptoms.swelling_feet` | oedema yes; pallor not yet in pregnancy |
| Temperature (fever) | `temp_c`, `temp_f`, `symptoms.fever`, `symptoms.high_fever` | yes |
| Fundal height, lie/presentation | `malpresentation` | breech or transverse yes (refers at 36 weeks or later); fundal height not yet |
| Foetal movements | `fetal_movement` | yes |
| Foetal heart rate | — | not yet |
| Haemoglobin | `hb` | yes |
| Urine albumin | `albumin` | yes |
| Urine sugar, blood sugar / GDM | `diabetes` | as "sugar/diabetes said"; the test value not yet |
| HIV, syphilis | `hiv_syphilis` | yes (positive or negative) |
| Blood group and Rh | `rh_negative` | Rh negative yes; group not yet |
| Twins / multiple pregnancy | `twins` | yes |
| Td/TT doses | `td_doses` | yes (no rule) |
| IFA tablets | `ifa_tablets` | yes (no rule) |
| Calcium, albendazole | — | not yet |
| Danger signs on the card (bleeding, water bag, fits, headache, blurred vision, swelling, high fever, labour over 12 hours, severe anaemia) | `symptoms.*`, `labour_hours` | yes |
| Labour pains (and before 37 weeks) | `symptoms.labour_pain` | yes |
| Planned place of delivery, birth preparedness | — | not yet |
| "Is the pregnancy high risk?" | flag `anc_high_risk` (and the refer rules) | yes, computed |

## Newborn visit (SSBSK Form 2B registration, Form 3 for the ASHA)

| Form item | Ghar Bhet field | Captured |
|---|---|---|
| Mother's name / child's name | `name` (the mother's, as ASHAs refer to the baby) | yes |
| Date of birth / day of life | `day` | day of life yes; dates not yet |
| Birth weight | `birth_weight_g` | yes (under 2500 g: at-risk, 9 visits) |
| Place of delivery: home / institution | `birth_place` | yes (no rule) |
| Type of delivery (normal / C-section), discharge dates | — | not yet |
| Cried immediately after birth, first feed, breastfeeding started within 1 hour | — | not yet |
| Immunisation at birth (BCG, OPV-0, Hep B-0) | — | not yet (SSBSK autofills it from U-WIN) |
| At-risk: preterm, born before 37 weeks | `preterm`, `weeks_at_birth` | yes |
| At-risk: discharged from SNCU, visible birth defect, regained birth weight by day 14 | — | not yet |
| Temperature | `temp_c`, `temp_f`, `symptoms.hot_to_touch`, `symptoms.cold_to_touch` | yes |
| Danger signs (Table 3.3): movement only when stimulated, not able to feed, convulsion, difficulty in breathing, fast breathing, chest indrawing, yellow palms and soles, blood in stool, 37.5 °C or above, below 36 °C | `symptoms.lethargy`, `feeding`, `symptoms.convulsions`, `symptoms.difficulty_breathing`, `resp_rate`, `symptoms.chest_indrawing`, `symptoms.jaundice_palms_soles`, `symptoms.blood_stool`, temperature | yes, all ten |
| Weight (grams) | `weight_g` | yes |
| Exclusively breastfed, feeding adequately | `feeding` (good / poor / none) | partly: feeding well or not; exclusive vs mixed not yet |
| LBW / preterm receiving KMC | — | not yet |
| Skin pustules | `symptoms.skin_pustules` | yes |
| Yellow discolouration / discharge from eyes | `symptoms.eye_discharge`, `symptoms.jaundice` | yes |
| Pus or bleeding from umbilicus | `symptoms.cord_pus` | yes |
| HBNC 2014 sepsis checklist extras: weak cry, vomiting, distended abdomen | `symptoms.weak_cry`, `symptoms.vomiting`, `symptoms.abdominal_distension` | yes |
| Diarrhoea (SSBSK CHO/ANM sick-newborn form) | `symptoms.diarrhoea` | yes |
| Household profile, domestic violence, indoor pollution, heat counselling | — | not yet |

## Mother after birth (SSBSK Form 4, MCP card postpartum table)

| Form item | Ghar Bhet field | Captured |
|---|---|---|
| Name, days since delivery | `name`, `day` | yes |
| Temperature (°F) | `temp_c`, `temp_f`, `symptoms.fever` | yes |
| Fever | `symptoms.fever`, temperature | yes |
| Severe anaemia: pads 5 or more a day, giddiness, paleness, weakness | `pads`, `symptoms.heavy_bleeding`, `symptoms.dizziness`, `symptoms.pallor`, `hb` | yes |
| Urinary tract infection: fever over 102 °F, burning urination | `symptoms.burning_urine`, temperature | yes |
| Vaginal infection: foul-smelling discharge, fever over 100 °F | `symptoms.foul_discharge`, temperature | yes |
| Abdominal pain | `symptoms.abdominal_pain` | yes |
| Neurological: blurred vision, convulsion, abnormal speech | `symptoms.blurred_vision`, `symptoms.convulsions`, `symptoms.abnormal_speech` (and `symptoms.severe_headache`) | yes |
| Oedema of face, hands and legs | `symptoms.swelling_face_hands`, `symptoms.calf_pain` | face and hands yes; a painful or swollen calf yes; ankle swelling alone not yet |
| Difficulty in breathing | `symptoms.breathless` | yes |
| Jaundice | `symptoms.jaundice` | yes |
| Incontinence of stool and urine | `symptoms.incontinence` | yes |
| Psychological distress (two questions) | `symptoms.low_mood` | yes as "low mood said"; the rule tells the ASHA to ask the two questions |
| BP (MCP postpartum table; CHO manual: every postnatal visit) | `bp_sys`, `bp_dia` | yes |
| Breasts engorged, nipples cracked (Form 3, MCP table) | `symptoms.breast_problem` | yes |
| Episiotomy / tear | `symptoms.wound_infection` | infected stitches yes |
| Adequate diet, hand washing, IFA and calcium taken, spacing method, family-planning counselling | — | not yet |
