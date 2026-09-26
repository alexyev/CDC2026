#!/usr/bin/env python3
"""Recover the NCESSCH school IDs that ODIS v3 stores in scientific notation.

data/index_scores_v3_2026.csv holds 19,158 NCESSCH values such as 1.00006E+11:
the 12-digit NCES school ID rounded to 6 significant digits by a spreadsheet.
This script downloads the NCES Common Core of Data (CCD) public school
directory for 2022-23, the vintage ODIS used, and recovers each broken ID by
matching the row's school name and ZIP code against the directory.

The surviving digits are a hard filter: a directory ID is a candidate only if
rounding it to 6 significant digits reproduces the broken value exactly.
A row is recovered only when exactly one candidate is left; otherwise it is
dropped from the fixed file and listed in the report with its candidates.

Outputs (the original CSV is never modified):
  data/index_scores_v3_2026_fixed.csv  the ODIS file with NCESSCH corrected
  data/ncessch_fix_report.csv          per-row audit of how each ID was set

Usage: python3 scripts/fix_ncessch.py
Standard library only.  The download is cached in .cache/nces/ (gitignored).
"""

import collections
import csv
import hashlib
import io
import re
import sys
import urllib.request
import zipfile
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "nces"
SOURCE_CSV = ROOT / "data" / "index_scores_v3_2026.csv"
FIXED_CSV = ROOT / "data" / "index_scores_v3_2026_fixed.csv"
REPORT_CSV = ROOT / "data" / "ncessch_fix_report.csv"

# NCES CCD public school directory, school year 2022-23, listed at
# https://nces.ed.gov/ccd/files.asp.  Pinned by SHA-256 so a republished file
# cannot silently change the result.
DIRECTORY_URL = "https://nces.ed.gov/ccd/Data/zip/ccd_sch_029_2223_w_1a_083023.zip"
DIRECTORY_SHA256 = "db5fa3828c49f7d3b7c104bf43f6bfb2e986c152e10b7239fdf74908e249d08d"

# Excel's General format writes a 12-digit number as a 6-significant-digit
# mantissa, dropping trailing zeros (1.00006E+11, 3.9E+11, 1E+11).
SIGNIFICANT_DIGITS = 6
BROKEN_ID = re.compile(r"\d(\.\d{1,5})?E\+11")
INTACT_ID = re.compile(r"\d{12}")

# Multi-word abbreviations, joined into one token before word expansion.
PHRASES = [("H S", "HS"), ("J H", "JH"), ("JR SR", "JRSR"), ("SR HI", "SENIOR HIGH")]
# Abbreviations NCES uses where ODIS spells the word out.
WORDS = {
    "ACAD": "ACADEMY",
    "ALT": "ALTERNATIVE",
    "CHS": "CENTRAL HIGH SCHOOL",
    "CO": "COUNTY",
    "COMM": "COMMUNITY",
    "CTR": "CENTER",
    "CTY": "COUNTY",
    "EL": "ELEMENTARY",
    "ELEM": "ELEMENTARY",
    "HI": "HIGH",
    "HS": "HIGH SCHOOL",
    "INTL": "INTERNATIONAL",
    "JH": "JUNIOR HIGH",
    "JR": "JUNIOR",
    "JRSR": "JUNIOR SENIOR",
    "JSHS": "JUNIOR SENIOR HIGH SCHOOL",
    "MS": "MIDDLE SCHOOL",
    "MT": "MOUNT",
    "PREP": "PREPARATORY",
    "SCH": "SCHOOL",
    "SCHL": "SCHOOL",
    "SR": "SENIOR",
    "ST": "SAINT",
    "TWP": "TOWNSHIP",
    "VOC": "VOCATIONAL",
}


def normalize(name):
    """Uppercase, strip punctuation, and expand abbreviations in a school name."""
    name = name.upper().replace("&", " AND ").replace("'", "").replace("’", "")
    name = " " + re.sub(r"[^A-Z0-9]+", " ", name) + " "
    for phrase, token in PHRASES:
        while f" {phrase} " in name:
            name = name.replace(f" {phrase} ", f" {token} ")
    return " ".join(WORDS.get(word, word) for word in name.split())


def round_to_significant(ncessch):
    value = Decimal(ncessch)
    quantum = Decimal(1).scaleb(value.adjusted() - SIGNIFICANT_DIGITS + 1)
    return value.quantize(quantum, rounding=ROUND_HALF_UP)


def consistent(ncessch, broken):
    """True when ncessch rounds to exactly the digits that survived in broken."""
    return round_to_significant(ncessch) == Decimal(broken)


def download_directory():
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / DIRECTORY_URL.rsplit("/", 1)[1]
    if not path.exists():
        print(f"downloading {DIRECTORY_URL}", file=sys.stderr)
        with urllib.request.urlopen(DIRECTORY_URL) as response:
            path.write_bytes(response.read())
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != DIRECTORY_SHA256:
        sys.exit(f"{path.name}: SHA-256 {digest} does not match pinned {DIRECTORY_SHA256}")
    return path


def load_directory():
    """Return {NCESSCH: directory record} for the 2022-23 CCD directory."""
    archive = zipfile.ZipFile(download_directory())
    (member,) = [name for name in archive.namelist() if name.endswith(".csv")]
    schools = {}
    with archive.open(member) as raw:
        for rec in csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8", newline="")):
            assert rec["NCESSCH"] not in schools, f"duplicate NCESSCH {rec['NCESSCH']}"
            rec["normalized_name"] = normalize(rec["SCH_NAME"])
            schools[rec["NCESSCH"]] = rec
    return schools


def match(row, broken, schools, by_rounded):
    """Return (status, ncessch, rule, candidate IDs) for one broken row."""
    # Hard filter: only IDs that round to the surviving digits, in the row's
    # state (LSTATE covers Bureau of Indian Education schools, whose ST is BI).
    pool = [
        ncessch
        for ncessch in by_rounded.get(Decimal(broken), ())
        if row["State"] in (schools[ncessch]["ST"], schools[ncessch]["LSTATE"])
    ]
    name = normalize(row["Name"])
    candidates = [
        ncessch
        for ncessch in pool
        if schools[ncessch]["normalized_name"] == name
        and schools[ncessch]["LZIP"] == row["Zip Code"]
    ]
    if len(candidates) == 1:
        return "recovered", candidates[0], "name+zip", candidates
    # ODIS covers open high schools only: every unambiguous match was open in
    # 2022-23 and offered grade 12, so a candidate that fails either is excluded.
    high_schools = [
        ncessch
        for ncessch in candidates
        if schools[ncessch]["SY_STATUS_TEXT"] != "Closed"
        and schools[ncessch]["G_12_OFFERED"] == "Yes"
    ]
    if len(high_schools) == 1:
        return "recovered", high_schools[0], "name+zip+grade12", candidates
    return "dropped", "", "ambiguous" if candidates else "no match", candidates


def main():
    schools = load_directory()
    by_rounded = collections.defaultdict(list)
    for ncessch in schools:
        if INTACT_ID.fullmatch(ncessch):
            by_rounded[round_to_significant(ncessch)].append(ncessch)

    source = SOURCE_CSV.read_bytes()
    header, *lines = source.split(b"\r\n")
    assert not source.endswith(b"\r\n") and all(lines), "unexpected line layout"
    fieldnames = next(csv.reader([header.decode("utf-8")]))
    assert fieldnames[0] == "NCESSCH"

    results = []
    for line in lines:
        row = dict(zip(fieldnames, next(csv.reader([line.decode("utf-8")]))))
        original = row["NCESSCH"]
        if INTACT_ID.fullmatch(original):
            if original not in schools:
                sys.exit(f"intact NCESSCH {original} ({row['Name']}) is not in the directory")
            results.append((row, original, "intact", original, "", []))
        elif BROKEN_ID.fullmatch(original):
            status, ncessch, rule, candidates = match(row, original, schools, by_rounded)
            results.append((row, original, status, ncessch, rule, candidates))
        else:
            sys.exit(f"unrecognized NCESSCH value {original!r}")

    kept = [result for result in results if result[2] != "dropped"]
    ids = [result[3] for result in kept]
    duplicates = {ncessch for ncessch, n in collections.Counter(ids).items() if n > 1}
    assert not duplicates, f"IDs assigned to more than one row: {sorted(duplicates)}"
    for row, original, status, ncessch, _, _ in kept:
        assert INTACT_ID.fullmatch(ncessch)
        assert status == "intact" or consistent(ncessch, original), (original, ncessch)

    # Every byte of each kept row stays the same except the NCESSCH field.
    fixed = [header + b",NCESSCH_original,NCESSCH_status"]
    for line, (row, original, status, ncessch, _, _) in zip(lines, results):
        if status == "dropped":
            continue
        prefix = original.encode("ascii")
        assert line.startswith(prefix + b",")
        fixed.append(ncessch.encode("ascii") + line[len(prefix):] + f",{original},{status}".encode("ascii"))
    FIXED_CSV.write_bytes(b"\r\n".join(fixed))

    dropped = len(results) - len(kept)
    written = FIXED_CSV.read_bytes().split(b"\r\n")
    assert len(written) == len(lines) - dropped + 1
    assert [w.rsplit(b",", 2)[0].split(b",", 1)[1] for w in written[1:]] == [
        line.split(b",", 1)[1] for line, result in zip(lines, results) if result[2] != "dropped"
    ]

    with REPORT_CSV.open("w", encoding="utf-8", newline="") as out:
        writer = csv.writer(out, lineterminator="\n")
        writer.writerow(
            ["row", "NCESSCH_original", "NCESSCH", "status", "rule", "candidates",
             "Name", "School District", "State", "Zip Code"]
        )
        for number, (row, original, status, ncessch, rule, candidates) in enumerate(results, 1):
            writer.writerow(
                [number, original, ncessch, status, rule, " ".join(candidates),
                 row["Name"], row["School District"], row["State"], row["Zip Code"]]
            )

    counts = collections.Counter(result[2] for result in results)
    rules = collections.Counter(result[4] for result in results if result[2] == "recovered")
    print(f"rows: {len(results)}")
    print(f"intact (verified in directory): {counts['intact']}")
    print(f"recovered: {counts['recovered']} ({', '.join(f'{k} {v}' for k, v in sorted(rules.items()))})")
    print(f"dropped: {counts['dropped']}")
    for number, (row, original, status, _, rule, candidates) in enumerate(results, 1):
        if status == "dropped":
            print(f"  row {number}: {row['Name']}, {row['State']} {row['Zip Code']} ({original}): "
                  f"{rule}, candidates {' '.join(candidates) or 'none'}")
    print(f"wrote {FIXED_CSV.relative_to(ROOT)} and {REPORT_CSV.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
