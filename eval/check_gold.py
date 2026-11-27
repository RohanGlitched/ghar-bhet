"""Independent gold checker for the Ghar Bhet test set.

Re-computes flags from each item's gold record using the rule table in SPEC.md
(written from the spec alone; imports no product code), and reports:
  - bad JSON / missing keys / bad id, lang, script
  - invalid record field names, types, enum codes, symptom codes
  - flags that disagree with the rule table, or are not sorted
  - unknown tags, or tags that contradict the flags (normal-visit, watch-only)
  - duplicate ids or duplicate sentences (also across files)
Then prints counts per type, language, script and tag.

Usage: python check_gold.py dev.jsonl heldout.jsonl
       python check_gold.py --fix dev.jsonl dev2.jsonl   (rewrite flags from the
       gold records with the current rule table, then check)
Exit code 0 when no problems.
Rule set: mohfw-2026.6 (SPEC.md v6).
"""
import json
import sys
from collections import Counter
from pathlib import Path

TYPES = {"anc", "pnc", "newborn"}
ID_PREFIX = {"anc": "anc-", "pnc": "pnc-", "newborn": "nb-"}
LANGS = {"hi", "mr", "en", "mix"}
SCRIPTS = {"devanagari", "roman"}

INT, NUM, STR, BOOL = "int", "num", "str", "bool"
COMMON = {"type": STR, "name": STR, "symptoms": "symptoms"}
# Rule set mohfw-2026.2 (SPEC.md v2). Fields marked v2 were added on 27 Nov 2026.
FIELDS = {
    "anc": {"weeks": INT, "month": INT, "bp_sys": INT, "bp_dia": INT, "hb": NUM,
            "weight_kg": NUM, "albumin": "albumin", "fetal_movement": "fetal",
            "ifa_tablets": INT,
            "age": INT, "height_cm": INT, "labour_hours": INT, "twins": BOOL,       # v2
            "prev_caesarean": BOOL, "prev_pph": BOOL, "prev_aph": BOOL,           # v2
            "prev_eclampsia": BOOL,                                                # v2
            "temp_c": NUM, "temp_f": NUM, "prev_stillbirth": BOOL, "prev_preterm": BOOL,  # v3
            "diabetes": BOOL, "heart_disease": BOOL, "rh_negative": BOOL,          # v3
            "hiv_syphilis": BOOL, "previous_births": INT, "malpresentation": BOOL,  # v3
            "td_doses": INT,                                                       # v3
            "pulse": INT, "bp_source": "source", "bp_date": STR, "hb_source": "source",  # v5
            "hb_date": STR,                                                        # v5
            "pain_severe": BOOL, "epilepsy": BOOL},                                # v6
    "pnc": {"day": INT, "pads": INT, "temp_c": NUM,
            "temp_f": NUM, "bp_sys": INT, "bp_dia": INT, "hb": NUM,                # v2
            "bp_source": "source", "bp_date": STR, "hb_source": "source", "hb_date": STR},  # v5
    "newborn": {"day": INT, "weight_g": INT, "temp_c": NUM, "resp_rate": INT,
                "feeding": "feeding",
                "temp_f": NUM, "birth_weight_g": INT,                              # v2
                "weeks_at_birth": INT, "preterm": BOOL, "birth_place": "birthplace",  # v3
                "prev_weight_g": INT},                                              # v5
}
SYMPTOMS = {
    "anc": {"bleeding", "leaking_fluid", "convulsions", "severe_headache", "blurred_vision",
            "swelling_face_hands", "swelling_feet", "fever", "breathless", "abdominal_pain",
            "vomiting", "dizziness", "burning_urine", "foul_discharge",
            "high_fever", "labour_pain",                                           # v3
            "pallor",                                                              # v4
            "jaundice", "epigastric_pain",                                         # v5
            "self_harm"},                                                          # v6
    "pnc": {"heavy_bleeding", "fever", "foul_discharge", "convulsions", "blurred_vision",
            "abnormal_speech", "breathless", "abdominal_pain", "burning_urine",
            "swelling_face_hands", "breast_problem", "dizziness",
            "severe_headache", "jaundice", "incontinence", "pallor",               # v2
            "wound_infection", "calf_pain", "low_mood",                            # v3
            "self_harm",                                                           # v4
            "high_fever", "epigastric_pain"},                                      # v5
    "newborn": {"convulsions", "chest_indrawing", "lethargy", "jaundice",
                "jaundice_palms_soles", "blood_stool", "cord_pus", "skin_pustules",
                "eye_discharge", "cold_to_touch", "hot_to_touch", "weak_cry", "vomiting",
                "diarrhoea", "difficulty_breathing",                                # v2
                "abdominal_distension",                                             # v3
                "cyanosis"},                                                        # v4
}
ALBUMIN = {"nil", "trace", "1", "2", "3", "4"}
FETAL = {"normal", "reduced", "absent"}
FEEDING = {"good", "poor", "none"}
BIRTHPLACE = {"home", "facility"}
SOURCE = {"today", "card", "earlier"}

R, W = "refer_now", "watch"
SEVERITY = {
    "anc_imminent_eclampsia": R, "anc_severe_hypertension": R, "anc_preeclampsia": R,
    "anc_hypertension": R, "anc_headache_vision": R, "anc_severe_anaemia": R,
    "anc_moderate_anaemia": W, "anc_mild_anaemia": W, "anc_bleeding": R, "anc_leaking": R,
    "anc_convulsions": R, "anc_fever": R, "anc_fetal_movement": R, "anc_swelling": R,
    "anc_breathless": R, "anc_abdominal_pain": R, "anc_burning_urine": R, "anc_discharge": R,
    "anc_labour_prolonged": R, "anc_multiple_pregnancy": R, "anc_vomiting": W,
    "anc_dizziness": W, "anc_high_risk": W,
    "anc_high_fever": R, "anc_low_fever": W, "anc_preterm_labour": R, "anc_labour": R,
    "anc_malpresentation": R, "anc_anaemia_breathless": R, "anc_pallor": R, "anc_jaundice": R, "anc_pulse": R, "anc_self_harm": R,
    "pnc_heavy_bleeding": R, "pnc_severe_hypertension": R, "pnc_hypertension": R,
    "pnc_severe_anaemia": R, "pnc_high_fever": R, "pnc_uti": R, "pnc_infection": R, "pnc_sepsis": R,
    "pnc_fever": R, "pnc_convulsions": R, "pnc_neuro": R, "pnc_headache": R,
    "pnc_breathless": R, "pnc_abdominal_pain": R, "pnc_swelling": R, "pnc_jaundice": R,
    "pnc_incontinence": R, "pnc_breast": R,
    "pnc_low_fever": W, "pnc_wound_infection": R, "pnc_calf_pain": R, "pnc_low_mood": R,
    "pnc_low_hb": R, "pnc_anaemia_signs": R, "pnc_moderate_anaemia": W, "pnc_self_harm": R, "pnc_mild_anaemia": W,
    "nb_not_feeding": R, "nb_poor_feeding": W, "nb_convulsions": R, "nb_fast_breathing": R,
    "nb_difficulty_breathing": R, "nb_chest_indrawing": R, "nb_lethargy": R, "nb_fever": R,
    "nb_hypothermia": R, "nb_cool": W, "nb_jaundice_palms": R, "nb_jaundice_early": R,
    "nb_jaundice_late": R, "nb_blood_stool": R, "nb_very_low_weight": R, "nb_low_weight": W,
    "nb_at_risk_birth_weight": W, "nb_cord_infection": R, "nb_skin_pustules": R,
    "nb_eye_discharge": R, "nb_sepsis_signs": R, "nb_weak_cry": W, "nb_vomiting": W,
    "nb_diarrhoea": W, "nb_preterm": W, "nb_abdominal_distension": W, "nb_cyanosis": R,
    "nb_very_low_weight_gaining": W, "nb_weight_loss": R, "nb_not_regained": W,
}

TAGS = {
    "numbers-digits", "numbers-in-words", "fraction-words", "stt-style", "fahrenheit",
    "celsius", "negation", "self-correction", "months-not-weeks", "local-idiom",
    "multi-sign", "normal-visit", "watch-only", "filler", "borderline", "code-mix",
    "distractor-number", "subject-ambiguity", "no-number-fever", "no-name",
    # v2 (dev3)
    "past-value", "range", "wrong-subject", "question-negation", "high-risk", "review-case",
    "doubt", "name-correction", "new-rule", "thousands-comma",
    # v3 (dev4)
    "mild", "list-negation", "high-risk-history",
    # v5 (dev6)
    "card-value", "self-harm", "weight-trend",
}

# Tag vocabulary of eval/adversarial.jsonl and eval/adversarial2.jsonl (each written by a separate
# author from SPEC.md). Accepted only for those files; every record, flag and severity check still applies to it.
ADV_TAGS = {
    "abbreviation", "albumin-plus-plus", "birth-vs-now", "boundary", "bp-bata", "bp-par",
    "bp-slash", "bp-upar-neeche", "bp-words-over", "celsius", "clinical-english", "colloquial",
    "colloquial-danger", "comma-number", "day-boundary", "denial", "denial-list", "denies-list",
    "distractor-numbers", "duration-not-day", "duration-trap", "english-in-devanagari", "fahrenheit", "feet-vs-face",
    "fever-exclusion", "filler", "fractions", "glued-units", "hinglish", "implausible-weight",
    "indian-english", "khoon-not-bleeding", "khoon-not-hb", "kilo-gram", "long-rambling", "marathi-english",
    "marathi-roman", "marathi-she-hundreds", "mild-pain", "mild-still-danger", "mild-vs-severe", "months-vs-weeks",
    "name-like-word", "negated-list", "negation", "negation-is-danger", "negation-trap", "no-punctuation",
    "normal", "normal-visit", "not-in-spec", "noted-not-flag", "numbers-in-words", "ordinal",
    "paraphrase", "past-present", "past-value", "question-answer-negation", "range", "risk-items",
    "rule-overlap", "self-correction", "sepsis-count", "smell-not-discharge", "subject-baby", "subject-both",
    "subject-mother", "subject-relative", "temp-word-not-hot", "threshold-edge", "typo", "unitless-temp",
    "watch-only", "weeks-vs-day", "wrong-subject",
}

EPS = 1e-9


def f_to_c(f):
    return (f - 32) * 5 / 9


def temp_exact(r):
    """Exact temperature in C: from temp_f when present, else temp_c."""
    if r.get("temp_f") is not None:
        return f_to_c(r["temp_f"])
    return r.get("temp_c")


def above_f(r, f):
    """'above f degrees F': exact with temp_f, else above the rounded C value."""
    if r.get("temp_f") is not None:
        return r["temp_f"] > f + EPS
    if r.get("temp_c") is not None:
        return r["temp_c"] > round(f_to_c(f), 1) + EPS
    return False


def compute_flags(r):
    """Rule table from SPEC.md v2. A symptom marked False never fires."""
    t = r["type"]
    s = r.get("symptoms", {})
    yes = lambda code: s.get(code) is True
    g = r.get
    out = set()
    temp = temp_exact(r)
    sys_, dia = g("bp_sys"), g("bp_dia")
    high_bp = (sys_ is not None and sys_ >= 140) or (dia is not None and dia >= 90)
    severe_bp = (sys_ is not None and sys_ >= 160) or (dia is not None and dia >= 110)
    if t == "anc":
        alb2 = g("albumin") in {"2", "3", "4"}
        imminent = dia is not None and dia > 110
        if imminent:
            out.add("anc_imminent_eclampsia")
        if severe_bp and not imminent:
            out.add("anc_severe_hypertension")
        if high_bp and alb2:
            out.add("anc_preeclampsia")
        if high_bp and not severe_bp and not alb2:
            out.add("anc_hypertension")
        if yes("severe_headache") or yes("blurred_vision") or (yes("epigastric_pain") and high_bp):
            out.add("anc_headache_vision")
        if yes("epigastric_pain"):
            out.add("anc_abdominal_pain")
        if yes("jaundice"):
            out.add("anc_jaundice")
        if yes("self_harm"):
            out.add("anc_self_harm")
        if g("pulse") is not None and (g("pulse") > 90 or g("pulse") < 60):
            out.add("anc_pulse")
        hb = g("hb")
        if hb is not None:
            if hb < 7:
                out.add("anc_severe_anaemia")
            elif hb < 10:
                out.add("anc_moderate_anaemia")
            elif hb < 11:
                out.add("anc_mild_anaemia")
        high_fever = above_f(r, 101) or yes("high_fever")
        if high_fever:
            out.add("anc_high_fever")
        elif yes("fever") or above_f(r, 100):
            out.add("anc_fever")
        elif temp is not None and temp >= 37.5 - EPS:
            out.add("anc_low_fever")
        weeks, month = g("weeks"), g("month")
        early = (weeks is not None and weeks < 37) or (weeks is None and month is not None and month <= 8)
        in_labour = yes("labour_pain") or g("labour_hours") is not None
        if in_labour and early:
            out.add("anc_preterm_labour")
        elif yes("labour_pain") and not (g("labour_hours") is not None and g("labour_hours") > 12):
            out.add("anc_labour")
        late = (weeks is not None and weeks >= 36) or (weeks is None and month is not None and month >= 9)
        if g("malpresentation") is True and late:
            out.add("anc_malpresentation")
        for code, flag in [("bleeding", "anc_bleeding"), ("leaking_fluid", "anc_leaking"),
                           ("convulsions", "anc_convulsions"),
                           ("swelling_face_hands", "anc_swelling"),
                           ("breathless", "anc_breathless"),
                           ("abdominal_pain", "anc_abdominal_pain"),
                           ("burning_urine", "anc_burning_urine"),
                           ("foul_discharge", "anc_discharge"),
                           ("vomiting", "anc_vomiting"), ("dizziness", "anc_dizziness")]:
            if yes(code):
                out.add(flag)
        if g("fetal_movement") in {"reduced", "absent"}:
            out.add("anc_fetal_movement")
        if yes("pallor") and yes("breathless"):
            out.add("anc_anaemia_breathless")
        elif yes("pallor"):
            out.add("anc_pallor")
        if g("labour_hours") is not None and g("labour_hours") > 12:
            out.add("anc_labour_prolonged")
        if g("twins") is True:
            out.add("anc_multiple_pregnancy")
        age, h = g("age"), g("height_cm")
        pb = g("previous_births")
        if ((age is not None and (age < 18 or age > 35)) or (h is not None and h < 145)
                or (pb is not None and pb >= 4)
                or any(g(k) is True for k in ("prev_caesarean", "prev_pph", "prev_aph", "prev_eclampsia",
                                               "prev_stillbirth", "prev_preterm", "diabetes", "heart_disease",
                                               "rh_negative", "hiv_syphilis", "epilepsy"))):
            out.add("anc_high_risk")
    elif t == "pnc":
        if (g("pads") is not None and g("pads") >= 5) or yes("heavy_bleeding"):
            out.add("pnc_heavy_bleeding")
        if severe_bp:
            out.add("pnc_severe_hypertension")
        elif high_bp:
            out.add("pnc_hypertension")
        hb = g("hb")
        if hb is not None and hb < 7:
            out.add("pnc_severe_anaemia")
        elif hb is not None and hb < 8:
            out.add("pnc_low_hb")
        elif hb is not None and hb < 11:
            out.add("pnc_moderate_anaemia")
        elif hb is not None and hb < 12:
            out.add("pnc_mild_anaemia")
        if (yes("dizziness") or yes("pallor")) and not (hb is not None and hb < 8):
            out.add("pnc_anaemia_signs")
        if yes("self_harm"):
            out.add("pnc_self_harm")
        high = above_f(r, 102) or yes("high_fever")
        if high:
            out.add("pnc_high_fever")
        if yes("burning_urine"):
            out.add("pnc_uti")
        if yes("foul_discharge"):
            sepsis = (above_f(r, 100) or yes("high_fever") or yes("abdominal_pain")
                      or (yes("fever") and temp is None))                           # v6
            out.add("pnc_sepsis" if sepsis else "pnc_infection")
        if ((yes("fever") or above_f(r, 100)) and not high
                and not yes("burning_urine") and not yes("foul_discharge")):
            out.add("pnc_fever")
        if temp is not None and temp >= 37.5 - EPS and not above_f(r, 100) and not yes("fever"):
            out.add("pnc_low_fever")
        if yes("epigastric_pain"):
            out.add("pnc_headache")
        for code, flag in [("convulsions", "pnc_convulsions"), ("severe_headache", "pnc_headache"),
                           ("breathless", "pnc_breathless"), ("abdominal_pain", "pnc_abdominal_pain"),
                           ("swelling_face_hands", "pnc_swelling"), ("jaundice", "pnc_jaundice"),
                           ("incontinence", "pnc_incontinence"), ("breast_problem", "pnc_breast"),
                           ("wound_infection", "pnc_wound_infection"), ("calf_pain", "pnc_calf_pain"),
                           ("low_mood", "pnc_low_mood")]:
            if yes(code):
                out.add(flag)
        if yes("blurred_vision") or yes("abnormal_speech"):
            out.add("pnc_neuro")
    elif t == "newborn":
        w, bw, day, rr = g("weight_g"), g("birth_weight_g"), g("day"), g("resp_rate")
        feed = g("feeding")
        if feed == "none":
            out.add("nb_not_feeding")
        if feed == "poor":
            out.add("nb_poor_feeding")
        if rr is not None and rr >= 60:
            out.add("nb_fast_breathing")
        if (temp is not None and temp >= 37.5 - EPS) or yes("hot_to_touch"):
            out.add("nb_fever")
        if (temp is not None and temp < 36 - EPS) or yes("cold_to_touch"):
            out.add("nb_hypothermia")
        if temp is not None and 36 - EPS <= temp < 36.5 - EPS:
            out.add("nb_cool")
        if yes("jaundice") and day is not None and day <= 1:
            out.add("nb_jaundice_early")
        if yes("jaundice") and day is not None and day > 14:
            out.add("nb_jaundice_late")
        earlier = g("prev_weight_g") if g("prev_weight_g") is not None else bw
        if w is not None and w < 1800:
            out.add("nb_very_low_weight_gaining" if (earlier is not None and w > earlier) else "nb_very_low_weight")
        if w is not None and bw is not None and day is not None and day < 14 and w < 0.9 * bw:
            out.add("nb_weight_loss")
        if w is not None and bw is not None and day is not None and day >= 14 and w < bw:
            out.add("nb_not_regained")
        if w is not None and 1800 <= w < 2500:
            out.add("nb_low_weight")
        if bw is not None and bw < 2500:
            out.add("nb_at_risk_birth_weight")
        for code, flag in [("convulsions", "nb_convulsions"), ("chest_indrawing", "nb_chest_indrawing"),
                           ("difficulty_breathing", "nb_difficulty_breathing"),
                           ("lethargy", "nb_lethargy"), ("jaundice_palms_soles", "nb_jaundice_palms"),
                           ("blood_stool", "nb_blood_stool"), ("cord_pus", "nb_cord_infection"),
                           ("skin_pustules", "nb_skin_pustules"), ("eye_discharge", "nb_eye_discharge"),
                           ("weak_cry", "nb_weak_cry"), ("vomiting", "nb_vomiting"),
                           ("diarrhoea", "nb_diarrhoea"), ("abdominal_distension", "nb_abdominal_distension"),
                           ("cyanosis", "nb_cyanosis")]:
            if yes(code):
                out.add(flag)
        # HBNC 2014 sepsis checklist: two or more signs
        if g("preterm") is True or (g("weeks_at_birth") is not None and g("weeks_at_birth") < 37):
            out.add("nb_preterm")
        sepsis = [yes("lethargy"), feed in ("poor", "none"), yes("weak_cry"), yes("vomiting") or yes("abdominal_distension"),
                  yes("cold_to_touch") or yes("hot_to_touch")
                  or (temp is not None and (temp < 36 - EPS or temp > f_to_c(99) + EPS)),
                  yes("chest_indrawing"), rr is not None and rr > 60, yes("cord_pus")]
        if sum(1 for x in sepsis if x) >= 2:
            out.add("nb_sepsis_signs")
    return sorted(out)


def is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def is_num(v):
    return (isinstance(v, (int, float))) and not isinstance(v, bool)


def one_decimal(v):
    return abs(round(v, 1) - v) < 1e-9


def check_record(r, problems, where):
    if not isinstance(r, dict):
        problems.append(f"{where}: record is not an object")
        return False
    t = r.get("type")
    if t not in TYPES:
        problems.append(f"{where}: bad type {t!r}")
        return False
    allowed = dict(COMMON)
    allowed.update(FIELDS[t])
    for k, v in r.items():
        kind = allowed.get(k)
        if kind is None:
            problems.append(f"{where}: field {k!r} not allowed for {t}")
        elif kind == STR and not (isinstance(v, str) and v.strip()):
            problems.append(f"{where}: {k} must be a non-empty string")
        elif kind == INT and not is_int(v):
            problems.append(f"{where}: {k} must be an integer, got {v!r}")
        elif kind == NUM and not is_num(v):
            problems.append(f"{where}: {k} must be a number, got {v!r}")
        elif kind == BOOL and not isinstance(v, bool):
            problems.append(f"{where}: {k} must be true/false, got {v!r}")
        elif kind == "albumin" and v not in ALBUMIN:
            problems.append(f"{where}: albumin {v!r} not in {sorted(ALBUMIN)}")
        elif kind == "fetal" and v not in FETAL:
            problems.append(f"{where}: fetal_movement {v!r} invalid")
        elif kind == "feeding" and v not in FEEDING:
            problems.append(f"{where}: feeding {v!r} invalid")
        elif kind == "birthplace" and v not in BIRTHPLACE:
            problems.append(f"{where}: birth_place {v!r} invalid")
        elif kind == "source" and v not in SOURCE:
            problems.append(f"{where}: {k} {v!r} not in {sorted(SOURCE)}")
        elif kind == "symptoms":
            if not isinstance(v, dict) or not v:
                problems.append(f"{where}: symptoms must be a non-empty object (omit when none said)")
                continue
            for code, val in v.items():
                if code not in SYMPTOMS[t]:
                    problems.append(f"{where}: symptom {code!r} not valid for {t}")
                if not isinstance(val, bool):
                    problems.append(f"{where}: symptom {code} must be true/false")
    # plausibility and precision
    rng = {"month": (1, 10), "weeks": (4, 42), "bp_sys": (70, 220), "bp_dia": (40, 140),
           "hb": (3, 16), "weight_kg": (30, 120), "ifa_tablets": (1, 400),
           "day": (0, 60), "pads": (0, 30), "temp_c": (32, 43), "weight_g": (500, 6000),
           "resp_rate": (10, 120), "age": (12, 55), "height_cm": (120, 190),
           "labour_hours": (1, 72), "birth_weight_g": (500, 6000), "temp_f": (86, 110),
           "previous_births": (0, 15), "td_doses": (0, 3), "weeks_at_birth": (22, 44)}
    for k, (lo, hi) in rng.items():
        if k in r and is_num(r[k]) and not (lo <= r[k] <= hi):
            problems.append(f"{where}: {k}={r[k]} outside plausible range {lo}-{hi}")
    for k in ("hb", "temp_c"):
        if k in r and is_num(r[k]) and not one_decimal(r[k]):
            problems.append(f"{where}: {k}={r[k]} must have at most one decimal")
    if "temp_f" in r and is_num(r["temp_f"]) and not ("temp_c" in r and abs(round(f_to_c(r["temp_f"]), 1) - r["temp_c"]) < 1e-9):
        problems.append(f"{where}: temp_f={r['temp_f']} needs temp_c={round(f_to_c(r['temp_f']), 1)}")
    sym = r.get("symptoms") or {}
    if sym.get("hot_to_touch") is True and sym.get("cold_to_touch") is True:
        problems.append(f"{where}: hot_to_touch and cold_to_touch cannot both be true")
    if ("bp_sys" in r) != ("bp_dia" in r):
        problems.append(f"{where}: bp_sys and bp_dia should come together")
    if "name" not in r:
        pass  # allowed: name not said
    return True


def check_file(path, seen_ids, seen_said):
    problems = []
    items = []
    for n, line in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
        where = f"{Path(path).name}:{n}"
        if not line.strip():
            problems.append(f"{where}: blank line")
            continue
        try:
            it = json.loads(line)
        except json.JSONDecodeError as e:
            problems.append(f"{where}: bad JSON ({e})")
            continue
        keys = {"id", "lang", "script", "said", "record", "flags", "tags"}
        if set(it) != keys:
            problems.append(f"{where}: keys {sorted(it)} != {sorted(keys)}")
            continue
        where = f"{Path(path).name}:{it['id']}"
        heldout = "heldout" in Path(path).name
        if it["id"] in seen_ids:
            problems.append(f"{where}: duplicate id")
        seen_ids.add(it["id"])
        said_key = " ".join(it["said"].split()).lower()
        if said_key in seen_said:
            problems.append(f"{where}: duplicate sentence (also {seen_said[said_key]})")
        seen_said[said_key] = it["id"]
        if it["lang"] not in LANGS:
            problems.append(f"{where}: bad lang {it['lang']!r}")
        if it["script"] not in SCRIPTS:
            problems.append(f"{where}: bad script {it['script']!r}")
        if it["lang"] == "en" and it["script"] != "roman":
            problems.append(f"{where}: English item must be roman script")
        has_deva = any("ऀ" <= ch <= "ॿ" for ch in it["said"])
        if it["script"] == "devanagari" and not has_deva:
            problems.append(f"{where}: script devanagari but no Devanagari text")
        if it["script"] == "roman" and has_deva:
            problems.append(f"{where}: script roman but contains Devanagari")
        if not check_record(it["record"], problems, where):
            continue
        t = it["record"]["type"]
        fname = Path(path).name
        adversarial = "adversarial" in fname
        prefix = "adv-" if adversarial else ("h-" if heldout else "d2-" if "dev2" in fname else "d3-" if "dev3" in fname else "d4-" if "dev4" in fname else "d5-" if "dev5" in fname else "d6-" if "dev6" in fname else "") + ID_PREFIX[t]
        if adversarial:  # adv-NNN (adversarial.jsonl) or adv2-NNN (adversarial2.jsonl) for every visit type
            ap = "adv2-" if "adversarial2" in fname else "adv-"
            if not (it["id"].startswith(ap) and it["id"][len(ap):].isdigit()):
                problems.append(f"{where}: id should look like {ap}NNN")
        elif not (it["id"].startswith(prefix) and it["id"][len(prefix):].isdigit()):
            problems.append(f"{where}: id should look like {prefix}NNN")
        flags = it["flags"]
        if not isinstance(flags, list):
            problems.append(f"{where}: flags must be a list")
            continue
        for f in flags:
            if f not in SEVERITY:
                problems.append(f"{where}: unknown flag {f!r}")
        if flags != sorted(flags):
            problems.append(f"{where}: flags not sorted alphabetically")
        want = compute_flags(it["record"])
        if sorted(flags) != want:
            problems.append(f"{where}: flags {sorted(flags)} != rule table {want}")
        tags = it["tags"]
        if not isinstance(tags, list) or not tags:
            problems.append(f"{where}: tags must be a non-empty list")
            tags = []
        for tg in tags:
            if tg not in TAGS and not (adversarial and tg in ADV_TAGS):
                problems.append(f"{where}: unknown tag {tg!r}")
        if ("normal-visit" in tags) != (len(want) == 0):
            problems.append(f"{where}: 'normal-visit' tag must be set exactly when there are no flags")
        watch_only = bool(want) and all(SEVERITY[f] == "watch" for f in want)
        if ("watch-only" in tags) != watch_only:
            problems.append(f"{where}: 'watch-only' tag must be set exactly when all flags are watch")
        # the adversarial set's descriptive tags were written by another author; the two
        # mechanical tag rules below are checked for our own sets only
        if not adversarial and ("code-mix" in tags) != (it["lang"] == "mix"):
            problems.append(f"{where}: 'code-mix' tag must be set exactly when lang is mix")
        if not adversarial and ("numbers-digits" in tags) != any(ch.isascii() and ch.isdigit() for ch in it["said"]):
            problems.append(f"{where}: 'numbers-digits' tag must be set exactly when the sentence has digits")
        if not adversarial and ("no-name" in tags) == ("name" in it["record"]):
            problems.append(f"{where}: 'no-name' tag must be set exactly when no name in record")
        items.append(it)
    return items, problems


def report(path, items):
    n = len(items)
    print(f"\n== {Path(path).name}: {n} items")
    types = Counter(i["record"]["type"] for i in items)
    print("  type   :", ", ".join(f"{k} {v} ({v / n:.0%})" for k, v in sorted(types.items())))
    ls = Counter(f"{i['lang']}/{i['script']}" for i in items)
    print("  lang   :", ", ".join(f"{k} {v} ({v / n:.0%})" for k, v in sorted(ls.items())))
    no_refer = sum(1 for i in items if not any(SEVERITY[f] == "refer_now" for f in i["flags"]))
    no_flag = sum(1 for i in items if not i["flags"])
    print(f"  refer  : no refer_now flag {no_refer} ({no_refer / n:.0%}); "
          f"of which no flag at all {no_flag}")
    tags = Counter(t for i in items for t in i["tags"])
    print("  tags   :", ", ".join(f"{k} {v}" for k, v in tags.most_common()))
    fl = Counter(f for i in items for f in i["flags"])
    print("  flags  :", ", ".join(f"{k} {v}" for k, v in fl.most_common()))


def fix_file(path):
    """Rewrite each item's flags (and the flag-derived tags normal-visit and
    watch-only) from its gold record with the current rule table. Records,
    sentences and other tags are never touched. Keeps the file's JSON spacing."""
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    spaced = bool(lines) and '": ' in lines[0]
    seps = (", ", ": ") if spaced else (",", ":")
    out, changed = [], 0
    for line in lines:
        if not line.strip():
            continue
        it = json.loads(line)
        want = compute_flags(it["record"])
        need = {"normal-visit": not want,
                "watch-only": bool(want) and all(SEVERITY[f] == "watch" for f in want)}
        tags = [t for t in it["tags"] if t not in need or need[t]]
        tags += [t for t, on in need.items() if on and t not in tags]
        if want != it["flags"] or tags != it["tags"]:
            changed += 1
            print(f"  {it['id']}: flags {it['flags']} -> {want}")
        it["flags"], it["tags"] = want, tags
        out.append(json.dumps(it, ensure_ascii=False, separators=seps))
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(out) + "\n")
    print(f"{Path(path).name}: {changed} item(s) updated")


def main(argv):
    if "--help" in argv or "-h" in argv:
        print(__doc__)
        return 0
    here = Path(__file__).parent
    # bare names ("dev.jsonl") resolve against eval/ when run from elsewhere
    argv = [argv[0]] + [a if a.startswith("-") or Path(a).exists() else str(here / a) for a in argv[1:]]
    if "--fix" in argv:
        # python check_gold.py --fix dev.jsonl dev2.jsonl heldout.jsonl
        for p in [a for a in argv[1:] if a != "--fix"]:
            fix_file(p)
        argv = [a for a in argv if a != "--fix"]
    paths = argv[1:] or [str(Path(__file__).with_name("dev.jsonl")),
                         str(Path(__file__).with_name("heldout.jsonl"))]
    seen_ids, seen_said = set(), {}
    all_problems = []
    for p in paths:
        items, problems = check_file(p, seen_ids, seen_said)
        all_problems += problems
        report(p, items)
    print()
    for pr in all_problems:
        print("PROBLEM", pr)
    print(f"{len(all_problems)} problem(s)")
    return 1 if all_problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
