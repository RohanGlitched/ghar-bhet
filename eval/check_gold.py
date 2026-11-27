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
Exit code 0 when no problems.
"""
import json
import sys
from collections import Counter
from pathlib import Path

TYPES = {"anc", "pnc", "newborn"}
ID_PREFIX = {"anc": "anc-", "pnc": "pnc-", "newborn": "nb-"}
LANGS = {"hi", "mr", "en", "mix"}
SCRIPTS = {"devanagari", "roman"}

INT, NUM, STR = "int", "num", "str"
COMMON = {"type": STR, "name": STR, "symptoms": "symptoms"}
FIELDS = {
    "anc": {"weeks": INT, "month": INT, "bp_sys": INT, "bp_dia": INT, "hb": NUM,
            "weight_kg": NUM, "albumin": "albumin", "fetal_movement": "fetal",
            "ifa_tablets": INT},
    "pnc": {"day": INT, "pads": INT, "temp_c": NUM},
    "newborn": {"day": INT, "weight_g": INT, "temp_c": NUM, "resp_rate": INT,
                "feeding": "feeding"},
}
SYMPTOMS = {
    "anc": {"bleeding", "leaking_fluid", "convulsions", "severe_headache", "blurred_vision",
            "swelling_face_hands", "swelling_feet", "fever", "breathless", "abdominal_pain",
            "vomiting", "dizziness", "burning_urine", "foul_discharge"},
    "pnc": {"heavy_bleeding", "fever", "foul_discharge", "convulsions", "blurred_vision",
            "abnormal_speech", "breathless", "abdominal_pain", "burning_urine",
            "swelling_face_hands", "breast_problem", "dizziness"},
    "newborn": {"convulsions", "chest_indrawing", "lethargy", "jaundice",
                "jaundice_palms_soles", "blood_stool", "cord_pus", "skin_pustules",
                "eye_discharge", "cold_to_touch", "hot_to_touch", "weak_cry", "vomiting",
                "diarrhoea"},
}
ALBUMIN = {"nil", "trace", "1", "2", "3", "4"}
FETAL = {"normal", "reduced", "absent"}
FEEDING = {"good", "poor", "none"}

SEVERITY = {
    "anc_imminent_eclampsia": "refer_now", "anc_preeclampsia": "refer_now",
    "anc_hypertension": "refer_now", "anc_headache_vision": "refer_now",
    "anc_severe_anaemia": "refer_now", "anc_moderate_anaemia": "watch",
    "anc_mild_anaemia": "watch", "anc_bleeding": "refer_now", "anc_leaking": "refer_now",
    "anc_convulsions": "refer_now", "anc_fever": "refer_now",
    "anc_fetal_movement": "refer_now", "anc_swelling": "refer_now",
    "anc_breathless": "refer_now", "anc_abdominal_pain": "refer_now",
    "pnc_heavy_bleeding": "refer_now", "pnc_high_fever": "refer_now",
    "pnc_infection": "refer_now", "pnc_fever": "watch", "pnc_convulsions": "refer_now",
    "pnc_neuro": "refer_now", "pnc_breathless": "refer_now",
    "nb_not_feeding": "refer_now", "nb_poor_feeding": "watch", "nb_convulsions": "refer_now",
    "nb_fast_breathing": "refer_now", "nb_chest_indrawing": "refer_now",
    "nb_lethargy": "refer_now", "nb_fever": "refer_now", "nb_hypothermia": "refer_now",
    "nb_jaundice_palms": "refer_now", "nb_jaundice_early": "refer_now",
    "nb_blood_stool": "refer_now", "nb_very_low_weight": "refer_now",
    "nb_low_weight": "watch", "nb_cord_infection": "watch", "nb_skin_pustules": "watch",
}

TAGS = {
    "numbers-digits", "numbers-in-words", "fraction-words", "stt-style", "fahrenheit",
    "celsius", "negation", "self-correction", "months-not-weeks", "local-idiom",
    "multi-sign", "normal-visit", "watch-only", "filler", "borderline", "code-mix",
    "distractor-number", "subject-ambiguity", "no-number-fever", "no-name",
}


def compute_flags(r):
    """Rule table from SPEC.md. A symptom marked False never fires."""
    t = r["type"]
    s = r.get("symptoms", {})
    yes = lambda code: s.get(code) is True
    g = r.get
    out = set()
    if t == "anc":
        sys_, dia = g("bp_sys"), g("bp_dia")
        high_bp = (sys_ is not None and sys_ >= 140) or (dia is not None and dia >= 90)
        alb = g("albumin")
        alb_n = int(alb) if alb in {"1", "2", "3", "4"} else 0
        if dia is not None and dia > 110:
            out.add("anc_imminent_eclampsia")
        if high_bp and alb_n >= 2:
            out.add("anc_preeclampsia")
        if high_bp and not ({"anc_imminent_eclampsia", "anc_preeclampsia"} & out):
            out.add("anc_hypertension")
        if yes("severe_headache") or yes("blurred_vision"):
            out.add("anc_headache_vision")
        hb = g("hb")
        if hb is not None:
            if hb < 7:
                out.add("anc_severe_anaemia")
            elif hb < 10:
                out.add("anc_moderate_anaemia")
            elif hb < 11:
                out.add("anc_mild_anaemia")
        for code, flag in [("bleeding", "anc_bleeding"), ("leaking_fluid", "anc_leaking"),
                           ("convulsions", "anc_convulsions"), ("fever", "anc_fever"),
                           ("swelling_face_hands", "anc_swelling"),
                           ("breathless", "anc_breathless"),
                           ("abdominal_pain", "anc_abdominal_pain")]:
            if yes(code):
                out.add(flag)
        if g("fetal_movement") in {"reduced", "absent"}:
            out.add("anc_fetal_movement")
    elif t == "pnc":
        temp = g("temp_c")
        if (g("pads") is not None and g("pads") >= 5) or yes("heavy_bleeding"):
            out.add("pnc_heavy_bleeding")
        if temp is not None and temp > 38.9:
            out.add("pnc_high_fever")
        if yes("foul_discharge") and (yes("fever") or (temp is not None and temp > 37.8)):
            out.add("pnc_infection")
        if (yes("fever") or (temp is not None and temp >= 37.5)) and not (
                {"pnc_high_fever", "pnc_infection"} & out):
            out.add("pnc_fever")
        if yes("convulsions"):
            out.add("pnc_convulsions")
        if yes("blurred_vision") or yes("abnormal_speech"):
            out.add("pnc_neuro")
        if yes("breathless"):
            out.add("pnc_breathless")
    elif t == "newborn":
        temp, w, day = g("temp_c"), g("weight_g"), g("day")
        if g("feeding") == "none":
            out.add("nb_not_feeding")
        if g("feeding") == "poor":
            out.add("nb_poor_feeding")
        if yes("convulsions"):
            out.add("nb_convulsions")
        if g("resp_rate") is not None and g("resp_rate") > 60:
            out.add("nb_fast_breathing")
        if yes("chest_indrawing"):
            out.add("nb_chest_indrawing")
        if yes("lethargy"):
            out.add("nb_lethargy")
        if (temp is not None and temp >= 37.5) or yes("hot_to_touch"):
            out.add("nb_fever")
        if (temp is not None and temp < 35.5) or yes("cold_to_touch"):
            out.add("nb_hypothermia")
        if yes("jaundice_palms_soles"):
            out.add("nb_jaundice_palms")
        if yes("jaundice") and day is not None and day <= 1:
            out.add("nb_jaundice_early")
        if yes("blood_stool"):
            out.add("nb_blood_stool")
        if w is not None and w < 1800:
            out.add("nb_very_low_weight")
        if w is not None and 1800 <= w < 2500:
            out.add("nb_low_weight")
        if yes("cord_pus"):
            out.add("nb_cord_infection")
        if yes("skin_pustules"):
            out.add("nb_skin_pustules")
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
        elif kind == "albumin" and v not in ALBUMIN:
            problems.append(f"{where}: albumin {v!r} not in {sorted(ALBUMIN)}")
        elif kind == "fetal" and v not in FETAL:
            problems.append(f"{where}: fetal_movement {v!r} invalid")
        elif kind == "feeding" and v not in FEEDING:
            problems.append(f"{where}: feeding {v!r} invalid")
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
           "resp_rate": (10, 120)}
    for k, (lo, hi) in rng.items():
        if k in r and is_num(r[k]) and not (lo <= r[k] <= hi):
            problems.append(f"{where}: {k}={r[k]} outside plausible range {lo}-{hi}")
    for k in ("hb", "temp_c"):
        if k in r and is_num(r[k]) and not one_decimal(r[k]):
            problems.append(f"{where}: {k}={r[k]} must have at most one decimal")
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
        prefix = ("h-" if heldout else ("d2-" if "dev2" in Path(path).name else "")) + ID_PREFIX[t]
        if not (it["id"].startswith(prefix) and it["id"][len(prefix):].isdigit()):
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
            if tg not in TAGS:
                problems.append(f"{where}: unknown tag {tg!r}")
        if ("normal-visit" in tags) != (len(want) == 0):
            problems.append(f"{where}: 'normal-visit' tag must be set exactly when there are no flags")
        watch_only = bool(want) and all(SEVERITY[f] == "watch" for f in want)
        if ("watch-only" in tags) != watch_only:
            problems.append(f"{where}: 'watch-only' tag must be set exactly when all flags are watch")
        if ("code-mix" in tags) != (it["lang"] == "mix"):
            problems.append(f"{where}: 'code-mix' tag must be set exactly when lang is mix")
        if ("numbers-digits" in tags) != any(ch.isascii() and ch.isdigit() for ch in it["said"]):
            problems.append(f"{where}: 'numbers-digits' tag must be set exactly when the sentence has digits")
        if ("no-name" in tags) == ("name" in it["record"]):
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


def main(argv):
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
