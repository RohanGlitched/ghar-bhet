# ASHA voice app: research brief (compiled 27 Nov 2026)

Conventions: every fact has its source URL. "UNCONFIRMED" = not verified in a primary document I could open. Where I read a PDF myself I say so ("read"). Where I only saw a search snippet I say "snippet only".

Access notes: hbnc-hbyc.mohfw.gov.in refused connections (so the 2018 revised MCP card PDF could not be opened); nhm.gov.in MIS 2025-26 PDFs now return 404; Lok Sabha eparlib refused connections. Gaps below are from that.

---

## 0. The most important finding for the build

India's newest official newborn guideline, **Samagra Shishu Bal Swasthya Karyakram (SSBSK) Operational Guidelines 2026**, replaces HBNC/HBYC. It changes the visit schedule, defines newborn danger signs in new units (Celsius), and says home-visit data will be recorded through a mobile app ("Shaishav App") feeding the JANANI portal with a built-in Decision Support System. Our rules engine must be versioned: 2014 HBNC form (Fahrenheit, 6-7 visits) vs 2026 SSBSK (Celsius, 4 or 9 visits). Source (read): https://nurturing-care.org/files/SSBSK_Operational_Guidline_2026.pdf (same file is on nhm.gov.in at https://nhm.gov.in/New-Update-2025-26/Guidelines/HBNC&HBYC/SSBSK_Operational-Guidline_Final_27-06-2026.pdf, which returned 404 to me; verify the official version before quoting in a submission).

---

## 1. Scale

| Fact | Value | Source |
|---|---|---|
| ASHAs in India, latest official statement found | "over 10.29 lakh ASHAs" (25 Jan 2025) | PIB: https://pib.gov.in/PressReleasePage.aspx?PRID=2096075 (read) |
| ASHAs in position, FY 2022-23 | 10,03,790 total (9,23,869 rural + 79,921 urban) | NHSRC ASHA Update 2023: https://www.nhsrcindia.org/sites/default/files/2023-09/ASHA_UPDATE_2023.pdf (read) |
| ASHAs in Maharashtra, FY 2022-23 | 70,267 (60,981 rural vs target 64,644; 9,286 urban vs target 15,441) | same NHSRC PDF (read) |
| Maharashtra, Sept 2023 | 72,412 (62,092 NRHM + 10,320 NUHM) | search snippet of a Lok Sabha reply only, UNCONFIRMED (eparlib.nic.in AS12 / AU395 hits; not opened) |
| NHM MIS Sept 2025 state table (newest) | not read, file removed | https://nhm.gov.in/MIS-NHM/2025-26/Sept-25/G1.pdf returns 404. Latest Maharashtra count: UNCONFIRMED |
| Newborns receiving ASHA home visits | "More than 1.5 Crore newborns ... annually achieving nearly 90% coverage" | SSBSK 2026 (read): https://nurturing-care.org/files/SSBSK_Operational_Guidline_2026.pdf |
| Registered births, India | 254.4 lakh in 2022, 242.0 lakh in 2021 (Civil Registration System; registered, not estimated total) | https://dc.crsorgi.gov.in/assets/download/Annual-Reports/crs/2022.pdf (read) |
| Birth rate | 18.4 per 1,000 population in 2023; Maharashtra 18.7 | SRS Bulletin 2023: https://censusindia.gov.in/nada/index.php/catalog/46178/download/50426/SRS_Bulletin_2023_Vol_58_No_1.pdf (read) |
| Total births per year | No single official "total births" figure found. At 18.4/1000 it is roughly 2.5 crore (my arithmetic, not a published number). Say "about 2.5 crore births a year (CRS registered 2.54 crore in 2022)" | CRS link above |
| Infant mortality rate | 25 per 1,000 live births (2023); Maharashtra 26 | SRS 2023 bulletin, link above |
| Neonatal mortality rate | 19 per 1,000 (SRS 2021, was 26 in 2014) | Business Standard report of SRS 2021, snippet only: https://www.business-standard.com/amp/health/maternal-child-health-india-mmr-imr-u5mr-nmr-srs-report-2021-125051301613_1.html . SSBSK 2026 chart labels "Status (SRS 2024)" with NMR 18 and U5MR 28, but the chart text is garbled: UNCONFIRMED |
| Maternal mortality ratio | **88 per 100,000 live births (2021-23)**, same as 2020-22; 93 in 2019-21; 130 in 2014-16. **Maharashtra 36** (95% CI 13-60). EAG states 118. | SRS Special Bulletin on Maternal Mortality 2021-23 (read, table viewed): https://censusindia.gov.in/nada/index.php/catalog/46177/download/50425/SRS_MMR_Bulletin_2021_2023.pdf |
| 2021-23 bulletin on causes of death | It has no cause breakdown | same PDF |
| Leading causes of maternal death | Haemorrhage 47.2%, pregnancy-related infection (sepsis) 12%, hypertensive disorders 6.7%, abortion 4.9%, other direct 19.6%, indirect 9.8%. Million Death Study, deaths 2007-2014 (peer reviewed, not the latest) | Meh et al., BJOG 2022;129:550-561, https://pmc.ncbi.nlm.nih.gov/articles/PMC9292773 (fetched summary) |
| Nearly 80% of neonatal deaths from prematurity/LBW, infection, birth asphyxia | stated in SSBSK (line truncated in my read, check before quoting) | SSBSK 2026 PDF above |
| Neonatal deaths concentrated early | HBNC 2014: nearly 40% of neonatal deaths in first 24 h, about 10% around day 3 | HBNC Operational Guidelines 2014 (read): https://medbox.org/index.php/dl/5e148832db60a2044c2d3cf4 |

---

## 2. Documentation burden

**What an ASHA is meant to keep (official)**
- Village Health Register (pregnant women, 0-5 children, eligible couples, others needing service) and an ASHA Diary (record of work, used to track performance-based payment) and a drug-kit stock card. Source (read): ASHA Induction Module https://nhm.gov.in/images/pdf/communitisation/asha/ASHA_Induction_Module_English.pdf
- Paid routine tasks: household line listing at start of year updated every 6 months; village health register; monthly due lists for ANC beneficiaries, children to be immunised, and eligible couples (Rs 500/month for maintaining records under the 2013-14 list). Source (read): NHSRC Update on ASHA Programme Jan 2014, Annexure 1: https://www.nhsrcindia.org/sites/default/files/2021-03/Update%20on%20ASHA%20Program%20January%202014.pdf (incentive amounts may have changed since)
- Per newborn, two forms to claim HBNC incentive: First Examination of Newborn form and Home Visit form, plus the HBNC card as voucher and entries in the MCP card. Source (read): HBNC 2014 link above, section 2.5.
- Home-visit kit list: ASHA Diary/Register of all newborns and children up to 15 months, HBNC and HBYC cards, MCP card, HBNC kit (digital watch, thermometer, scale and sling, blanket, spoon, medicines). Source (read): https://nhm.gov.in/New-Update-2022-24/CH-Programmes/HBNC-&-HBYC-Resource-%20Material/HBNC_&_HBYC_Jobaid_for_ASHA.pdf
- A count of "how many registers/forms in total" is not stated in any official document I found. UNCONFIRMED. Anecdote: one ASHA in Shirol, Maharashtra carries four thick diaries (see below).

**Digital layer ASHAs are asked to use**
- ANMOL (ANM Online) is the tablet app for ANMs: registration, ANC, delivery, due lists, high-risk list; data flows to the RCH portal (successor of MCTS). It is an ANM tool, not an ASHA tool. https://wcd.nic.in/poshan/Events/TechThon/ExistingTechnologyPlatform_for_HealthSchemes_MoHFW-28-06-2018.pdf (snippet only). RCH 2.0 is the newer stack (2025 MoHFW deck, snippet only): https://cdnbbsr.s3waas.gov.in/s37993e11204b215b27694b6f139e34ce8/uploads/2025/06/202506191103957461.pdf
- Other apps named in reporting: Ni-Kshay (TB), ABHA health-ID app, Hajeri attendance app (Chhatrapati Sambhajinagar, Maharashtra). Source (read): New Lines Magazine, https://newlinesmag.com/reportage/indias-digital-health-push-is-overworking-its-front-line-women/
  - An ASHA in Walhe, Maharashtra juggles seven apps plus WhatsApp groups and Excel sheets and says she works "until midnight to complete records both offline and online".
  - An ASHA in Shirol, Maharashtra: nearly two days to enter 200 patients into Ni-Kshay; "we do everything twice, once online, and again on paper" since 2022.
  - ABHA app logs off every 15 minutes with no save.
  - Officials reportedly assumed about four hours of work a day; ASHAs say six to eight.
  - Incentives depend on completed records, so some enter false entries (Haryana union leader quote).
  - Most states do not provide phones; Maharashtra ran a partial phone programme from 2019.
  - Caveat: journalism, not peer review; figures are anecdotal.
- SSBSK 2026 says a new mobile "Shaishav App" will record home visits and feed the JANANI portal (also U-WIN, MPCDSR, RBSK 2.0, POSHAN Tracker, ABDM/ABHA), with an embedded Decision Support System and digital referral tracking. Source (read): SSBSK 2026 PDF, section 3.2.7.

**Studies**
- Workload, Maharashtra: 67 ASHAs, rural and tribal PHCs in Pune district. ASHAs worked up to 20 h/week, served about 800-1,200 people, two-thirds felt tired and rushed; "poor literacy of some of the tribal ASHAs affected documentation and record keeping". Kawade et al., Human Resources for Health 2021;19:3. https://pmc.ncbi.nlm.nih.gov/articles/PMC7789492 (full text read via Europe PMC)
- Diary usability: 57 ASHAs; poor visual cues, difficulty in comprehension, inconsistent data presentation, excessive cognitive load. Patel and Tandon, Social Science & Medicine 382 (2025), DOI 10.1016/j.socscimed.2025.118370, abstract at https://ideas.repec.org/a/eee/socmed/v382y2025ics0277953625007014.html
- No study found that measures hours of paperwork specifically across India. UNCONFIRMED.
- ASHAs did not type: in the ASHABot pilot "typing Hindi, especially half letters, is difficult and leads to spelling mistakes" and ASHAs used voice dictation and voice messages on WhatsApp. https://arxiv.org/html/2409.10913v3

**Literacy / education**
- Criteria: resident woman, married/widow/divorced, preferably 25-45 years, "literate woman with formal education up to Eighth Class. This may be relaxed only if no suitable person ... is available". Source (read): Guidelines on ASHA https://www.iapsm.org/pdf/Guidelines/RMNCH+A/Guidelines%20on%20Accredited%20Social%20Health%20Activist.pdf
- Some state/NHM pages prefer Class 10 where available (search snippet; UNCONFIRMED which is current): https://nhm.gov.in/index1.php?lang=1&level=1&sublinkid=150&lid=226
- Practical reading level: "many ASHAs who studied up to 8th grade cannot read well. Sons or husbands often fill in forms" (Jhpiego, Bihar, quoted in New Lines link above). A 2025 government survey: 64% of rural women cannot perform basic smartphone tasks (same article, figure as reported, not verified).
- Incentive: fixed monthly incentive raised from Rs 2,000 to Rs 3,500 (MSG, 4 Mar 2025) per a Lok Sabha reply reported at https://www.onmanorama.com/news/kerala/2025/07/25/asha-worker-incentive-increase-centre-health-ministry.html (secondary).

---

## 3. Fields recorded at an ANC visit

**A. MCP card (NHM-hosted English card, read)** https://nhm.gov.in/New_Updates_2018/NHM_Components/Immunization/Guildelines_for_immunization/MCP_Card_English_version.pdf
(The 2018 "Revised India MCP Card" is at https://hbnc-hbyc.mohfw.gov.in/assets/document/Revised India MCP Card English_(28-05-2018).pdf but I could not open it; its layout may differ slightly. UNCONFIRMED for the revised card.)
- Family identification: mother's name, age, father's (husband's) name, address, mobile (mother / father), MCTS/RCH ID, bank and branch, account no. and IFSC. Flag "Is the pregnancy high risk?"
- Pregnancy record: date of last menstrual period; expected date of delivery; number of pregnancies / previous live births; last delivery conducted at; current delivery.
- Obstetric complication in previous pregnancy (tick): APH, eclampsia, PIH, anaemia, obstructed labour, PPH, LSCS, congenital anomaly in baby, others.
- Past history (tick): tuberculosis, hypertension, heart disease, diabetes, asthma, others.
- Examination: heart, lungs, breasts (inverted nipple).
- Antenatal visits 1-5 (5th under PMSMA): date; any complaints; POG (weeks); weight (kg); pulse rate; blood pressure; pallor; oedema; jaundice; fundal height (weeks/cm, normal/reduced/absent); lie/presentation; fetal movements; fetal heart rate per minute; P/V if done.
- Essential investigations: haemoglobin, urine albumin, urine sugar, urine pregnancy test, HIV screening, syphilis, ultrasonography, gestational diabetes, blood group and Rh typing. Optional: TSH, HBsAg, blood sugar.
- Supplements/vaccines on card: TT1 when pregnancy confirmed and TT2 after 1 month (one dose if vaccinated within 3 years); IFA one tablet daily for at least 6 months after first trimester, at least 180 tablets (quantity and date issued); calcium two tablets/day for 6 months after first trimester; albendazole 400 mg single dose after first trimester.
- Card text on schedule: "at least 3 antenatal checkups". Newer MoHFW material says 4 checkups (CHO manual) and SSBSK 2026 says 5 for normal pregnancy incl. PMSMA, 8 for high risk (3 extra under E-PMSMA). See sources below.
- Postpartum care table (days 1, 3, 7, 6th week): complaints, pallor, pulse, BP, temperature, breasts soft/engorged, nipples cracked/normal, uterus tenderness, bleeding P/V excessive/normal, lochia healthy/foul smelling, episiotomy/tear, family planning counselling, other complications and referral.
- Birth record: sex, weight of baby (three extra visits if <2.5 kg), cried immediately, exclusive breastfeeding within 1 hour, injection Vitamin K.

**B. RCH register, ANC section (PW-1 / PW-2), as ANMs record** (read) https://upnrhm.gov.in/assets/site-files/downloads/Instruction_manual_for_ANM_to_record_information_in_RCH_register_version_1.1.pdf
- Registration (PW-1): serial no., MCTS/RCH ID, name, address, husband's name, mobile, religion, caste SC/ST, BPL/APL, age (DOB), date of LMP, date of registration, weeks of pregnancy, registered within 12 weeks (Y/N), weight, EDD, blood group, past illness history, past obstetric history, planned place of delivery, VDRL/RPR, HIV screening.
- Per ANC visit (PW-2): ANC number, date, facility/place, completed weeks, abortion (spontaneous/induced), weight (kg), BP systolic/diastolic, Hb (gm%), urine albumin and sugar (P/A or not done), blood sugar, Inj TT dose dates, folic acid tablets (within 12 weeks), IFA tablets (100 after 12 weeks, 200 if Hb 9-11 in this old manual), fundal height / size of uterus, foetal heart rate (after 24 weeks), foetal presentation (after 32 weeks), foetal movements (normal/increased/decreased/absent, mother's report), any high-risk symptom, referral (date, reason, facility), maternal death.
- This is the older 2010s ANM manual; its anaemia cut-offs (9-11 gm%) are outdated versus the current 7-9.9 moderate (see section 4).

**C. State ANC register example (adds gravida/para)** Nagaland (read): https://www.nhsrcindia.org/sites/default/files/2021-04/Resource%20Material%20-%20Day%201%20Primary%20Register%20Activity%20-%20ANC%20Register_0.pdf
- Name, age, EC registration no, UID, gravida, para, LMP, EDD, per visit: date, height, weight, BP, Hb, urine sugar and protein; foetus details (no. of foetus, position, movement present/absent, heart rate), examined by, IFA, TT 1/2/BD, complication (hypertensive/convulsions/APH/anaemia/malaria/diabetes/RTI-STI/none), ASHA name and phone, JSY beneficiary.

**What the ASHA herself measures:** the HBNC kit lists a thermometer, weighing scale, watch, not a BP cuff or Hb meter (job aid link in section 2). So for ANC, an ASHA mostly records history, symptoms and what the ANM/PHC measured. Inference, not stated in a document. Design implication: BP and Hb will mostly arrive as numbers the ASHA reads off the MCP card or the ANM's statement.

---

## 4. ANC danger signs and referral rules

Primary source for this section (read): MoHFW/NHSRC Training Manual on Care During Pregnancy and Childbirth for CHO at AB-HWC (2021), https://nhsrcindia.org/sites/default/files/2021-12/Care%20During%20Pregnancy%20and%20Childbirth%20Training%20Manual%20for%20CHO%20at%20AB-HWC.pdf ("CHO manual" below). The ASHA-level lists are on the MCP card (section 3).

**MCP card danger signs, to the family: "take the pregnant woman to the hospital immediately"** (NHM-hosted card, section 3 link)
- Bleeding during pregnancy
- Excessive bleeding during or after delivery
- High fever during pregnancy or within one month of delivery
- Labour pain for more than 12 hours
- Severe anaemia with or without breathlessness
- Headache, blurring of vision, fits and swelling all over the body
- Bursting of water bag without labour pains

**Thresholds (CHO manual)**
- Hypertension: systolic >=140 and/or diastolic >=90 on two readings 4 or more hours apart (manual also uses "BP more than 140/90" as the referral trigger). Recheck after 4 hours; after 1 hour if urgent.
- Pre-eclampsia: hypertension plus albumin 2+ in urine; refer to PHC MO immediately.
- Imminent eclampsia: diastolic above 110 mmHg; if urine albumin strongly positive, refer to FRU immediately. Eclampsia: convulsions with BP >=140/90 and proteinuria 2+ or more. Convulsion: left lateral position, clear airway, refer and accompany to FRU.
- Severe pre-eclampsia in the CHO manual table: diastolic 110 and 3+ proteinuria; first dose MgSO4 5 g (10 ml) deep IM in each buttock, then urgent referral to PHC/FRU (only for CHO/nurse level, not ASHA).
- The widely used "160/110 = severe hypertension" cut-off was NOT found in these MoHFW documents; the Indian-source hits were a slide deck (https://www.slideshare.net/caulderrylin/preventionidentificationandmanagementofpeeclampsiapptx) and foreign guidelines. Treat 160/110 as UNCONFIRMED for MoHFW. The official MoHFW lines are 140/90 and diastolic >110.
- High BP but no albumin: refer to PHC Medical Officer.
- Anaemia grading in pregnancy: mild 10.0-10.9 g/dl, moderate 7-9.9, severe <7. Severe (<7, or pallor of inner eyelids/nails/palm, breathlessness at rest, palpitations): refer to FRU MO; Hb <5 immediate hospitalisation. Same CHO manual, tables on anaemia.
- Hb 11 g/dl or above = normal. The RCH register flags "Severe anaemia (Hb <7 gms%)" as a high-risk pregnancy symptom. Source: RCH manual link, section 3B.
- Also refer to a 24-hour PHC/FRU: pulse >90 or <60; respiratory rate >30 with anaemia; oedema of face, hands, abdominal wall, vulva or tight finger rings; jaundice; weight gain more than 3 kg/month with pre-eclampsia/diabetes; uterus height differing by more than 3 cm from gestational age; no foetal movement or heart sound; breech or non-longitudinal lie; multiple pregnancy; foetal growth retardation.
- Normal weight gain 9-11 kg (CHO manual) vs 10-12 kg (MCP card). Under-gain: less than 2 kg/month after first trimester suggests inadequate intake.
- Foetal movements: "Normally 10-12 foetal movements should be felt by the pregnant woman in a day"; decreased movement may indicate foetal distress. Foetal heart rate normal 120-160 per minute.
- Vaginal bleeding after 20 weeks (APH): "Any bleeding (light or heavy) at this time of pregnancy is dangerous", refer to FRU with blood transfusion and surgical facility; no P/V examination after 20 weeks if bleeding.
- Leaking of watery fluid (PROM) and "leaking for more than 12 hours without labour pain": refer to FRU. Abnormal vaginal discharge: refer to MO.
- Fever with chills in pregnancy: test for malaria; fever in itself is a refer-and-investigate sign.
- Symptom list the CHO asks about: fever, persistent vomiting with dehydration, palpitations, tiredness, breathlessness at rest or on mild exertion, generalised swelling or facial puffiness, severe headache and/or blurring of vision, small amount of urine or burning micturition, leaking or bleeding P/V, abnormal discharge, decreased or absent foetal movements.
- Emergency transport: referral slip, JSSK free transport; ambulance number field is on the MCP card ("Ambulance Toll Free Number"). 102/108 numbers: state-specific, UNCONFIRMED in these documents.
- Direct referral to a centre with blood transfusion and gynaecologist for PPH, eclampsia, retained placenta and sepsis (CHO booklet, https://nhm.gov.in/New_Update-2022-23/MH/GUIDELINES-%20MH/CHO_Booklet_%20Maternal_Health-English.pdf, read).

**Postnatal maternal danger signs**
- ASHA 2014 home-visit form (read, pages 19-20): bleeding more than 5 pads a day (refer to hospital); temperature up to 102 F treat with paracetamol, above 102 F refer; foul-smelling discharge with fever more than 100 F (37.8 C) refer; mother speaking abnormally or having fits refer; fewer than 4 meals a day (counsel). HBNC 2014: https://medbox.org/index.php/dl/5e148832db60a2044c2d3cf4
- SSBSK 2026 mother PNC form (read, Form 4): fever; severe anaemia (excessive bleeding, changing 5 or more pads/day, giddiness, paleness, weakness); UTI (high fever >102 F, burning urination); vaginal infection (foul-smelling white discharge, fever >100 F); abdominal pain; neurological (blurred vision, convulsion, speaking abnormally); oedema of face, hands and legs; difficulty in breathing; jaundice; incontinence of stool/urine. Any "yes" triggers a referral pop-up. https://nurturing-care.org/files/SSBSK_Operational_Guidline_2026.pdf
- Heads-up for mixing units: the same SSBSK form mixes F with C elsewhere. Store temperatures canonically in Celsius and convert.

---

## 5. HBNC / SSBSK schedule and newborn rules

**Visit schedule**
- 2014 HBNC (in force through 2025): institutional births 6 visits, days 3, 7, 14, 21, 28, 42; home births 7 visits, adds day 1. Source (read): HBNC 2014 section 2.5 https://medbox.org/index.php/dl/5e148832db60a2044c2d3cf4 ; ASHA job aid (same schedule, plus HBYC visits at 3, 6, 9, 12, 15 months) https://nhm.gov.in/New-Update-2022-24/CH-Programmes/HBNC-&-HBYC-Resource-%20Material/HBNC_&_HBYC_Jobaid_for_ASHA.pdf
- Incentive Rs 250 per newborn for completing the visits, paid on day 45 if birth weight is in MCP card, BCG/OPV/DPT given, birth registered, mother and baby alive at day 42 (HBNC 2014). Rs 50/month follow-up for LBW babies (two years) and SNCU-discharged babies (one year). Incentive values could have changed since 2014: UNCONFIRMED.
- **SSBSK 2026 (new)**: healthy newborn 4 visits on days 3, 7, 14, 42 (plus day 1 for home delivery = 5); "At-risk" newborn 9 visits on day 1/discharge, 3, 5, 7, 10, 14, 21, 28, 42; joint ASHA+ANM/CHO visits for at-risk babies on days 3 and 7; young-child visits at 3, 6, 9, 12, 18, 24, 30, 36 months. Source (read): https://nurturing-care.org/files/SSBSK_Operational_Guidline_2026.pdf (visit-schedule comparison table and "Form 2B").
- At-risk newborn criteria (SSBSK 2026): birth weight under 2500 g, or preterm (<37 weeks), not initiated on breastmilk, requiring hospitalisation or discharged from SNCU, visible life-threatening or feeding-hampering malformation (e.g. cleft), low weight for age; additionally not regained birth weight by day 14, or not gaining weight on two consecutive visits after day 14.
- Whether SSBSK is already in force in Maharashtra: UNCONFIRMED (the file is dated June/August 2026). Build both schedules behind a switch.

**Newborn danger signs**
- SSBSK 2026 Table 3.3 (read) lists ten: movement only when stimulated or no movement at all; not able to feed; convulsion; difficulty in breathing; fast breathing (more than 60 breaths per minute); severe chest indrawing; yellowness in palm and feet; blood in stool; axillary temperature 37.5 C or above (hot to touch); axillary temperature below 35.5 C (cold to touch). Any yes triggers a referral pop-up: assessment by CHO/MO, stabilisation at CHC/PHC, treatment at district hospital.
- CHO newborn manual (read): possible serious bacterial infection if not able to feed, convulsions, breathing 60 or more per minute (repeat the count if elevated), severe chest indrawing, axillary 37.5 C or above, below 35.5 C, movement only when stimulated or none. Refer urgently to NBSU at CHC or SNCU; skin-to-skin if temperature below 36.5 C while arranging referral. Umbilicus red or draining pus = local bacterial infection. https://nhsrcindia.org/sites/default/files/2021-12/Newborn%20and%20Child%20Health%20Services%20Training%20Manual%20for%20CHO%20at%20AB-HWC.pdf
- Weight: below 1800 g = refer urgently to NBSU/SNCU; 1800-2500 g = low weight, keep warm and feeding support (CHO newborn manual above). ASHA job aid: "weight <1800 GM" refer; <2.5 kg and temperature <97 F counsel warmth; <1.8 kg advise KMC, expressed milk, refer.
- Jaundice: refer if yellowness noticed on day 1 or after day 14 (job aid); yellow palms and soles is on the family-facing danger list; the 2014 form says refer if jaundice since first day or persisting beyond 14 days.
- Skin pustules, umbilical pus/bleeding, eye swelling/discharge (give antibiotic ointment per 2014 form): SSBSK Form 3 asks yes/no and refers in consultation with ANM/CHO.

**2014 HBNC home-visit form thresholds (read pages 19-22), still printed in many ASHA diaries**
- Temperature (baby): below 97 F advise warmth, skin to skin; below 95.9 F warm bed and refer; above 99 F (fever) look for sepsis signs, paracetamol only if no sepsis signs, refer.
- Sepsis checklist: all limbs limp, feeding less/stopped, cry weak/stopped, distended abdomen or vomits often, "cold to touch" or fever above 99 F (37.2 C), chest indrawing, respiratory rate more than 60 per minute, pus on umbilicus. "At least two criteria ... diagnose as sepsis", first dose of cotrimoxazole (a quarter teaspoon) and refer to SNCU immediately. Only one sign: visit every day. First three signs count only if newly developed.
- Weight rules: below 2.5 kg keep warm and feed more often; below 1.8 kg refer to SNCU/newborn care unit and extra visits; low birth weight or normal baby not gaining: refer.
- Weighing scale colour code: green >2500 g, yellow 2000-2500 g, red <2000 g (annexure 2).
- Note the conflict: 2014 form says fever above 99 F (37.2 C), the newer CHO manual and SSBSK use 37.5 C (99.5 F). Hypothermia 2014: below 97 F (36.1 C) vs 2026: below 35.5 C. The newer ones win once SSBSK is adopted; keep both rule sets.

**Why 2014 and 2026 differ for sepsis:** 2014 needed two criteria, 2026/IMNCI treats any single danger sign as referral. For a product: flag on one sign and show which rule set fired.

---

## 6. How these are said in Hindi and Marathi

Honest status: I found no primary document or corpus giving spoken phrasing. Everything in this section is linguistic knowledge from me, NOT sourced, UNCONFIRMED until checked with native-speaker ASHAs. Use it as a test-set seed, not as fact. The one sourced point: ASHAs used voice dictation and voice notes in Hindi rather than typing (https://arxiv.org/html/2409.10913v3), and Indic speech datasets exist for training/evaluation: IndicVoices https://arxiv.org/pdf/2403.01926 .

How blood pressure is spoken (unsourced):
- Hindi: "एक सौ पचास बटा सौ", "150 by 100", "BP 150/100 है", "डेढ़ सौ पर सौ", "बीपी डेढ़ सौ", colloquial "ऊपर वाला 150 नीचे वाला 100". Also "सवा सौ" = 125, "ढाई सौ" = 250. Mixed with English digits: "बीपी one-forty over nine-ty".
- Marathi: "एकशे पन्नास बाय शंभर", "दीडशे बाय शंभर", "BP 150 by 100 आहे", "सव्वाशे" = 125.
- Hb and weight: "हीमोग्लोबिन साढ़े आठ" (8.5), "सात पॉइंट पाच", "वजन साठ किलो", Marathi "हिमोग्लोबिन साडेआठ".
- Dates: "पिछले महीने की पंद्रह तारीख", "LMP 12 जून", "पाँच महीने", "सातवाँ महीना" (month of pregnancy, not weeks); Marathi "सातवा महिना". Product point: ASHAs and families say months of pregnancy and "मोठा/छोटा" (big/small) not weeks. Convert to weeks only with confirmation.

Candidate danger-sign phrases (unsourced; verify with native speakers):
| Sign | Hindi | Marathi |
|---|---|---|
| Swelling of legs/face | पैरों में सूजन, चेहरे पर सूजन, पूरे शरीर में सूजन | पायांना सूज, चेहऱ्यावर सूज, अंगावर सूज |
| Dizziness/weakness | चक्कर आना, कमज़ोरी, आँखों के आगे अंधेरा | चक्कर येणे, अशक्तपणा, डोळ्यांसमोर अंधारी |
| Blurred vision/headache | धुंधला दिखना, तेज़ सिरदर्द | धूसर दिसणे, खूप डोकेदुखी |
| Fits | दौरे पड़ना, झटके, मिर्गी जैसा | आकडी, फिट येणे, झटके |
| Bleeding | खून जाना, ब्लीडिंग, पानी के साथ खून | रक्तस्राव, ब्लीडिंग होणे |
| Water leaking | पानी की थैली फटना, पानी निकलना | पाणी जाणे, पाणीची पिशवी फुटणे |
| Baby not moving | बच्चा हिल नहीं रहा, हलचल कम | बाळ हलत नाही, हालचाल कमी |
| Fever | बुखार, तेज़ बुखार, बदन गरम | ताप, खूप ताप, अंग गरम |
| Breathless | साँस फूलना, साँस लेने में तकलीफ | दम लागणे, श्वास घ्यायला त्रास |
| Newborn not feeding | बच्चा दूध नहीं पी रहा, दूध नहीं पकड़ रहा | बाळ दूध पीत नाही |
| Newborn fits | बच्चे को झटके आ रहे हैं | बाळाला झटके/आकडी येते |
| Jaundice | पीलिया, आँखें/हथेली पीली | कावीळ, डोळे/तळवे पिवळे |
| Fast breathing | बच्चा तेज़ साँस ले रहा, पसली चल रही है ("पसली चलना" is common UP/Bihar idiom for chest indrawing/pneumonia) | बाळाचा श्वास जलद, छाती आत ओढली जाते |
| Cord pus | नाभि से मवाद / पानी | नाळेतून पू / पाणी |
| Cold/hot to touch | बदन ठंडा, बदन गरम | अंग थंड, अंग गरम |
| Limp/weak cry | ढीला पड़ गया, रोना कमज़ोर | शिथिल, रडणे कमी |

Likely failure modes to test (my hypotheses): numbers spoken as fractions ("डेढ़"), Marathi-Hindi-English code-mix mid-sentence, negation ("दौरा नहीं पड़ा"), "bacha" ambiguity of subject (mother vs baby), terms for both mother and child in one utterance, units (kg vs "सेर"), temperature in F and "बुखार है" with no number.

---

## 7. Existing tools and what is different

| Tool | What it does | Source |
|---|---|---|
| ANMOL / RCH portal / RCH 2.0 | ANM tablet app, registration, ANC/PNC, due lists, high-risk list, feeds the RCH database; ANM tool, not voice | https://wcd.nic.in/poshan/Events/TechThon/ExistingTechnologyPlatform_for_HealthSchemes_MoHFW-28-06-2018.pdf (snippet) ; Anmol-2 outage in Madhya Pradesh, 2025: https://www.freepressjournal.in/bhopal/anmol-2-app-glitch-hits-maternal-care-leaves-pregnant-women-untracked (snippet) |
| Shaishav App + JANANI portal (planned, SSBSK 2026) | Official mobile recording of home visits, DSS, referral pop-ups, ABHA linkage; typed forms (we should output into this schema) | SSBSK PDF above |
| Khushi Baby (Rajasthan) | CHW app: village digital census, integrated due list, high-risk flags; scaled with Rajasthan govt for about 50,000 ASHAs (project claim). Cluster RCT in Udaipur: positive effect on infant immunisation; no change in hospitalisation or infant mortality | https://solve.mit.edu/solutions/28855 ; https://www.3ieimpact.org/node/18116 |
| ASHABot (Microsoft Research, Cornell, Khushi Baby) | WhatsApp LLM Q&A in Hindi with speech in/out; 20 ASHAs + 15 ANMs, 107 days, Salumbar Rajasthan; 26.7% of ASHA questions were audio; it answers questions, it does not fill records | https://arxiv.org/html/2409.10913v3 (read) |
| Wadhwani AI Shishu Maapan | Video-based newborn weight/length/circumference for 0-42 days by FLWs, schedules next HBNC visit, offline, Hindi/English; 92 ASHAs in 4 PHCs in Daman, impact "too early" | https://www.wadhwaniai.org/?p=4138 (read) |
| M-SAKHI (rural Maharashtra) | ASHA app, evaluated for knowledge and acceptance | https://chwcentral.org/wp-content/uploads/Evaluation-of-Impact-of-the-M-SAKHI-mHealth-App-on-Knowledge-Skills-and-Acceptance-of-use-of-App-by-Maternal-and-Child-Health-Community-Health-Workers-in-Rural-Maharashtra.pdf (snippet only) |
| ANCHAL (UNDP, Pune district) | digital ANC/newborn tracking and logistics tool, planned integration with ANMOL/RCH and CoWIN | https://www.undp.org/india/projects/advancing-maternal-health-services-digital-technology-anchal-antenatal-neonatal-child-health-systems-and-logistics-tracking-tool (page returned 403, snippet only) |
| CommCare (Dimagi) ReMiND, UP | feature-phone ASHA app with registration, pregnancy, postpartum, newborn and referral modules; "over 4,000 ASHAs ... 60 projects" (older figure) | https://openknowledge.worldbank.org/entities/publication/788db928-998e-5586-9062-d0f0f3646a26 (snippet); ICDS-CAS: nothing confirmed |
| Kilkari and Mobile Academy (MoHFW + ARMMAN) | IVR: weekly audio to pregnant women; IVR course for ASHAs (11 chapters, 50% pass); voice, but one-way content, no record filling | https://pib.gov.in/PressReleasePage.aspx?PRID=2003571 ; https://armman.org/mobile-academy/ (snippet) |
| Dendrite (hackathon page) | "speech-based replacement for paper registers", Hindi/English mix; unverified, treat as a competitor claim only | https://lablab.ai/u/@Alphha (snippet) |
| IndicVoices, SRUTI | datasets / ASR research for Indian languages (not ASHA products) | https://arxiv.org/pdf/2403.01926 ; https://www.arxiv.org/pdf/2506.09653 |

**What we can honestly claim as different** (inference from the above): (1) fills the official fields from spoken Hindi/Marathi/English instead of typing, where the evidence says ASHAs avoid typing; (2) danger-sign flags come from a fixed, versioned, cited rule table (2014 HBNC vs SSBSK 2026) shown with the clause that fired, not from an LLM judgement; (3) outputs to the existing MCP/RCH/SSBSK schema so it is complementary to ANMOL/Shaishav rather than another silo; (4) records once, so it attacks the "everything twice" complaint. Do not claim clinical validation, regulatory approval, or integration with the live government systems. No search found a voice-first ASHA record-filling product with published evidence (UNCONFIRMED: absence of evidence only).

---

## 8. Open items to verify before submission
1. Latest Maharashtra ASHA count (NHM MIS 2025-26 PDFs gone; try NHM Maharashtra or a Lok Sabha/Rajya Sabha answer).
2. Whether SSBSK 2026 visit schedule and thresholds are already adopted by Maharashtra NHM.
3. The 2018 revised MCP card field list (try the nhm.gov.in copy of the Hindi/Marathi/English card).
4. Maharashtra's preferred MCP card (Marathi) and the state's ASHA diary format.
5. Native-speaker check of every Hindi/Marathi phrase in section 6 and the number-speech patterns.
6. Whether severe-BP 160/110 appears in the MoHFW eclampsia/MgSO4 protocol (not in the documents read).
7. 102/108 ambulance numbers per MoHFW (state-specific).
