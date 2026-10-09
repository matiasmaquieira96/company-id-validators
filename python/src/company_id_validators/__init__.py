"""Offline validators for European company identifiers and EU VAT numbers.

Pure arithmetic: no network, no dependencies. Every validator takes a string and returns a dict
with ``ok`` and either ``reason`` (rejected) or ``kind`` and ``note`` (accepted). The newer
validators also return ``check_digit`` ('ok', 'bad' or 'advisory_bad'), ``display`` (the canonical
written form) and ``format_only``. A well-formed number is not proof that a company exists.
"""

import re

__version__ = "0.1.0"

_SEP = re.compile(r"[\s.\-/]")
_NON_DIGIT = re.compile(r"[^0-9]")


def _digits(s):
    return _NON_DIGIT.sub("", str(s) if s else "")


def _clean(s):
    return _SEP.sub("", (str(s) if s else "").upper())


def _strict_digits(s):
    """Separators removed, then ASCII digits only; None when anything else is left."""
    c = _SEP.sub("", "" if s is None else str(s))
    return c if re.fullmatch(r"[0-9]+", c) else None


def _bad(reason):
    return {"ok": False, "check_digit": "bad", "reason": reason}


def _fail(reason):
    return {"ok": False, "reason": reason}


# -- Spain: NIF / NIE / CIF -----------------------------------------------------------------
_DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE"
_CIF_CONTROL_LETTERS = "JABCDEFGHI"
_CIF_FORMS = {
    "A": "Sociedad Anónima (SA)", "B": "Sociedad Limitada (SL/SRL)", "C": "Sociedad Colectiva",
    "D": "Sociedad Comanditaria", "E": "Comunidad de bienes", "F": "Sociedad Cooperativa",
    "G": "Asociación / fundación", "H": "Comunidad de propietarios", "J": "Sociedad Civil",
    "N": "Entidad extranjera", "P": "Corporación local", "Q": "Organismo público",
    "R": "Congregación religiosa", "S": "Órgano de la Administración", "U": "Unión Temporal de Empresas",
    "V": "Otro tipo", "W": "Establecimiento permanente de entidad no residente",
}


def validate_es_nif(value):
    v = _clean(value)
    if not re.fullmatch(r"[A-Z0-9]{9}", v):
        return _fail("A Spanish NIF/CIF is 9 characters.")
    if re.fullmatch(r"[0-9]{8}[A-Z]", v):
        expected = _DNI_LETTERS[int(v[:8]) % 23]
        if v[8] == expected:
            return {"ok": True, "kind": "DNI (individual)", "note": "This is a personal DNI, not a company identifier."}
        return _fail(f"Check letter should be {expected}, not {v[8]}.")
    if re.fullmatch(r"[XYZ][0-9]{7}[A-Z]", v):
        prefix = {"X": "0", "Y": "1", "Z": "2"}[v[0]]
        expected = _DNI_LETTERS[int(prefix + v[1:8]) % 23]
        if v[8] == expected:
            return {"ok": True, "kind": "NIE (foreign individual)", "note": "This is a personal NIE, not a company identifier."}
        return _fail(f"Check letter should be {expected}, not {v[8]}.")
    if re.fullmatch(r"[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]", v):
        even = odd = 0
        for i, ch in enumerate(v[1:8]):
            n = int(ch)
            if i % 2 == 0:
                d = n * 2
                odd += d - 9 if d > 9 else d
            else:
                even += n
        control_digit = (10 - ((even + odd) % 10)) % 10
        control_letter = _CIF_CONTROL_LETTERS[control_digit]
        if v[8] in (str(control_digit), control_letter):
            return {"ok": True, "kind": f"CIF — {_CIF_FORMS.get(v[0], 'company')}", "note": None}
        return _fail(f"Control character should be {control_digit} or {control_letter}, not {v[8]}.")
    return _fail("Not a recognised NIF, NIE or CIF pattern.")


# -- France: SIREN / SIRET (Luhn) -----------------------------------------------------------
def _luhn_ok(num):
    total = 0
    for i, ch in enumerate(reversed(num)):
        d = int(ch)
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


def validate_fr_siren(value):
    v = _digits(value)
    if len(v) != 9:
        return _fail("A SIREN is exactly 9 digits.")
    if _luhn_ok(v):
        return {"ok": True, "kind": "SIREN (legal unit)",
                "note": "Identifies the legal entity. The SIRET adds a 5-digit establishment suffix."}
    return _fail("Fails the Luhn check digit.")


def validate_fr_siret(value):
    v = _digits(value)
    if len(v) != 14:
        return _fail("A SIRET is exactly 14 digits (9-digit SIREN + 5-digit NIC).")
    if v.startswith("356000000"):
        if sum(int(c) for c in v) % 5 == 0:
            return {"ok": True, "kind": "SIRET (La Poste)", "note": "La Poste SIRETs use the special digit-sum rule, not Luhn."}
        return _fail("La Poste SIRET must have digits summing to a multiple of 5.")
    if _luhn_ok(v):
        return {"ok": True, "kind": "SIRET (establishment)", "note": f"SIREN {v[:9]} · NIC {v[9:]}"}
    return _fail("Fails the Luhn check digit.")


# -- Poland: NIP / REGON --------------------------------------------------------------------
def validate_pl_nip(value):
    v = _digits(value)
    if len(v) != 10:
        return _fail("A NIP is exactly 10 digits.")
    check = sum(w * int(v[i]) for i, w in enumerate([6, 5, 7, 2, 3, 4, 5, 6, 7])) % 11
    if check == 10:
        return _fail("Invalid: the weighted sum gives 10, which is never a valid NIP check digit.")
    if check == int(v[9]):
        return {"ok": True, "kind": "NIP (tax number)",
                "note": "Every Polish business has one, including sole traders. Prefix with PL for the EU VAT number."}
    return _fail(f"Check digit should be {check}, not {v[9]}.")


def _regon_ok(weights, body, expected):
    s = sum(w * int(body[i]) for i, w in enumerate(weights)) % 11
    return (0 if s == 10 else s) == int(expected)


def validate_pl_regon(value):
    v = _digits(value)
    w9 = [8, 9, 2, 3, 4, 5, 6, 7]
    if len(v) == 9:
        if _regon_ok(w9, v, v[8]):
            return {"ok": True, "kind": "REGON-9 (entity)", "note": "Statistical number issued by GUS."}
        return _fail("Fails the REGON-9 check digit.")
    if len(v) == 14:
        if _regon_ok(w9, v, v[8]) and _regon_ok([2, 4, 8, 5, 0, 9, 7, 3, 6, 1, 2, 4, 8], v, v[13]):
            return {"ok": True, "kind": "REGON-14 (local unit)", "note": f"Parent entity REGON-9: {v[:9]}"}
        return _fail("Fails the REGON-14 check digit.")
    return _fail("A REGON is 9 digits (entity) or 14 digits (local unit).")


# -- Norway: organisasjonsnummer ------------------------------------------------------------
def validate_no_orgnr(value):
    v = _digits(value)
    if len(v) != 9:
        return _fail("A Norwegian organisation number is exactly 9 digits.")
    rem = sum(w * int(v[i]) for i, w in enumerate([3, 2, 7, 6, 5, 4, 3, 2])) % 11
    check = 0 if rem == 0 else 11 - rem
    if check == 10:
        return _fail("Invalid: the mod-11 remainder gives 10, which is never issued.")
    if check != int(v[8]):
        return _fail(f"Check digit should be {check}, not {v[8]}.")
    low = int(v) < 800000000
    return {
        "ok": True, "kind": "Organisasjonsnummer",
        "note": ("Check digit passes, but numbers in issue start around 810 000 000 — verify this is an "
                 "organisation number and not another 9-digit identifier.") if low
        else "Registered in Enhetsregisteret at Brønnøysundregistrene.",
    }


# -- UK and Ireland: format only ------------------------------------------------------------
_GB_KNOWN = {
    "SC": "Scotland", "NI": "Northern Ireland", "OC": "LLP (England & Wales)", "SO": "LLP (Scotland)",
    "NC": "LLP (Northern Ireland)", "FC": "Overseas company", "GE": "European Economic Interest Grouping",
    "IP": "Industrial & Provident society", "RC": "Royal Charter", "SP": "Scottish limited partnership",
    "LP": "Limited partnership", "ZC": "Unregistered company",
}


def validate_gb_company_number(value):
    v = _clean(value)
    if not re.fullmatch(r"[0-9]{8}|[A-Z]{2}[0-9]{6}", v):
        return _fail("A UK company number is 8 digits, or 2 letters followed by 6 digits (e.g. SC123456, NI123456).")
    prefix = v[:2] if re.match(r"[A-Z]{2}", v) else None
    jurisdiction = _GB_KNOWN.get(prefix) if prefix else None
    unknown = bool(prefix and not jurisdiction)
    out = {
        "ok": True, "kind": "UK company number (well-formed)",
        "note": (jurisdiction + ". " if jurisdiction else "")
        + (f'"{prefix}" is not a prefix we recognise — double-check it. ' if unknown else "")
        + "Companies House numbers carry NO check digit, so this confirms the format only — it does not confirm the company exists.",
        "format_only": True,
    }
    if unknown:
        out["unknown_prefix"] = True
    return out


def validate_ie_cro(value):
    v = _digits(value)
    if len(v) < 4 or len(v) > 7:
        return _fail("A CRO number is a plain integer, typically 5 to 7 digits.")
    return {
        "ok": True, "kind": "CRO number (well-formed)",
        "note": "Irish CRO numbers carry NO check digit and no letter prefix, so this confirms the format only — it does not confirm the company exists.",
        "format_only": True,
    }


# -- Finland: Y-tunnus ----------------------------------------------------------------------
_FI_WEIGHTS = [7, 9, 10, 5, 8, 4, 2]


def _fi_parts(value):
    d = _strict_digits(value)
    if d is None:
        return None
    if len(d) == 7:
        return "0" + d[:6], int(d[6])
    if len(d) == 8:
        return d[:7], int(d[7])
    return None


def _fi_check_digit(body):
    r = sum(w * int(body[i]) for i, w in enumerate(_FI_WEIGHTS)) % 11
    return None if r == 1 else 0 if r == 0 else 11 - r


def normalise_fi_ytunnus(value):
    p = _fi_parts(value)
    return f"{p[0]}-{p[1]}" if p else None


def validate_fi_ytunnus(value):
    p = _fi_parts(value)
    if not p:
        return _bad("A Y-tunnus is digits only: 7 digits, a hyphen and a check digit."
                    if _strict_digits(value) is None
                    else "A Y-tunnus is 7 digits, a hyphen and a check digit (8 digits in all).")
    body, check = p
    expected = _fi_check_digit(body)
    if expected is None:
        return _bad("Invalid: the mod-11 remainder is 1, so no check digit exists for this number and it is never issued.")
    if expected != check:
        return _bad(f"Check digit should be {expected}, not {check}.")
    return {
        "ok": True, "check_digit": "ok", "display": f"{body}-{check}", "kind": "Y-tunnus (business ID)",
        "note": "Issued by the Patent and Registration Office (PRH) with the Tax Administration to every registered Finnish business and organisation, sole traders included. Drop the hyphen and prefix FI for the VAT number.",
    }


# -- Sweden: organisationsnummer ------------------------------------------------------------
def _luhn_check_digit(body):
    total = 0
    for i, ch in enumerate(reversed(body)):
        d = int(ch)
        if i % 2 == 0:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return (10 - (total % 10)) % 10


def _se_core(value):
    d = _strict_digits(value)
    if d is None:
        return None
    if len(d) == 12 and d.startswith("16"):
        return d[2:]
    return d if len(d) == 10 else None


def normalise_se_orgnr(value):
    c = _se_core(value)
    return f"{c[:6]}-{c[6:]}" if c and c[2] >= "2" else None


def looks_like_personnummer(value):
    d = _strict_digits(value)
    if d is None:
        return False
    if len(d) == 12:
        if d[:2] not in ("18", "19", "20"):
            return False
        core = d[2:]
    elif len(d) == 10:
        core = d
    else:
        return False
    if core[2] not in "01":
        return False
    if _luhn_check_digit(core[:9]) != int(core[9]):
        return False
    month, day = int(core[2:4]), int(core[4:6])
    if month < 1 or month > 12:
        return False
    limit = 29 if month == 2 else 30 if month in (4, 6, 9, 11) else 31
    return 1 <= day <= limit or 61 <= day <= 60 + limit


def validate_se_orgnr(value):
    c = _se_core(value)
    if not c:
        return _bad("A Swedish organisation number is digits only: 10 digits, written NNNNNN-NNNN."
                    if _strict_digits(value) is None
                    else "A Swedish organisation number is exactly 10 digits, written NNNNNN-NNNN (12 digits with a leading 16).")
    if c[2] < "2":
        return _bad("This has the shape of a personal identity number (personnummer), which is not a company identifier. The third digit of an organisation number is 2 or higher."
                    if looks_like_personnummer(value)
                    else "The third digit of an organisation number is 2 or higher. A lower one is the shape of a personal identity number, not a company.")
    expected = _luhn_check_digit(c[:9])
    if expected != int(c[9]):
        return _bad(f"Check digit should be {expected}, not {c[9]}.")
    return {
        "ok": True, "check_digit": "ok", "display": f"{c[:6]}-{c[6:]}", "kind": "Organisationsnummer",
        "note": "Identifies a legal entity registered in Sweden. A sole trader is identified by their personal identity number instead, which this validator does not accept. The VAT number is SE, these 10 digits and 01.",
    }


# -- Belgium: enterprise number -------------------------------------------------------------
def _be_core(value):
    d = _strict_digits(value)
    if d is None:
        return None
    if len(d) == 9:
        d = "0" + d
    return d if len(d) == 10 and d[0] in "01" else None


def normalise_be_enterprise(value):
    d = _be_core(value)
    return f"{d[0]}{d[1:4]}.{d[4:7]}.{d[7:]}" if d else None


def validate_be_enterprise(value):
    d = _be_core(value)
    if not d:
        s = _strict_digits(value)
        if s is None:
            return _bad("A Belgian enterprise number is digits only: 10 digits, written 0NNN.NNN.NNN.")
        if len(s) == 10:
            return _bad("A Belgian enterprise number starts with 0 or 1.")
        return _bad("A Belgian enterprise number is exactly 10 digits, written 0NNN.NNN.NNN.")
    expected = 97 - (int(d[:8]) % 97)
    if expected != int(d[8:]):
        return _bad(f"Check digits should be {expected:02d}, not {d[8:]}.")
    return {
        "ok": True, "check_digit": "ok", "display": normalise_be_enterprise(d), "kind": "Enterprise number (KBO/BCE)",
        "note": "Registered in the Crossroads Bank for Enterprises. The Belgian VAT number is BE plus these 10 digits, for an entity that is VAT-registered.",
    }


# -- Croatia: OIB and MBS -------------------------------------------------------------------
def _iso7064_mod1110(body):
    t = 10
    for ch in body:
        t = (int(ch) + t) % 10
        if t == 0:
            t = 10
        t = (t * 2) % 11
    return (11 - t) % 10


def validate_hr_oib(value):
    d = _strict_digits(value)
    if d is None:
        return _bad("An OIB is digits only: exactly 11.")
    if len(d) != 11:
        return _bad("An OIB is exactly 11 digits. Nine digits is the length of an MBS, the court-register number, which is a different identifier."
                    if len(d) == 9 else "An OIB is exactly 11 digits.")
    expected = _iso7064_mod1110(d[:10])
    if expected != int(d[10]):
        return _bad(f"Check digit should be {expected}, not {d[10]}.")
    return {
        "ok": True, "check_digit": "ok", "display": d, "kind": "OIB (personal identification number)",
        "note": "Issued to companies and to individuals alike, so a valid OIB does not say which. It is not the court-register number (MBS). The Croatian VAT number is HR plus the OIB.",
    }


def normalise_hr_mbs(value):
    d = _strict_digits(value)
    if d is None:
        return None
    m = "0" + d if len(d) == 8 else d
    return m if len(m) == 9 else None


def validate_hr_mbs(value):
    m = normalise_hr_mbs(value)
    if not m:
        s = _strict_digits(value)
        if s is None:
            return _bad("An MBS is digits only: 9 digits.")
        return _bad("An MBS is 9 digits. Eleven digits is the length of an OIB, the tax identifier, which is a different number."
                    if len(s) == 11 else "An MBS is exactly 9 digits.")
    expected = _iso7064_mod1110(m[:8])
    if expected == int(m[8]):
        return {
            "ok": True, "check_digit": "ok", "display": m, "kind": "MBS (court register number)",
            "note": "The number a legal entity holds in the Croatian court register (matični broj subjekta). The OIB is a different number, the tax identifier.",
        }
    return {
        "ok": True, "format_only": True, "check_digit": "advisory_bad", "display": m, "kind": "MBS (well-formed)",
        "note": f"The length is right, but the check digit should be {expected}, not {m[8]}. The court register itself documents a few legacy numbers with an incorrectly computed check digit, so this is a warning and not a rejection: it does not confirm the company exists.",
    }


# -- Denmark: CVR ---------------------------------------------------------------------------
_DK_WEIGHTS = [2, 7, 6, 5, 4, 3, 2, 1]


def normalise_dk_cvr(value):
    d = _strict_digits(value)
    return d if d and len(d) == 8 else None


def validate_dk_cvr(value):
    d = normalise_dk_cvr(value)
    if not d:
        return _bad("A CVR number is digits only: exactly 8." if _strict_digits(value) is None
                    else "A CVR number is exactly 8 digits.")
    if sum(w * int(d[i]) for i, w in enumerate(_DK_WEIGHTS)) % 11 == 0:
        return {
            "ok": True, "check_digit": "ok", "display": d, "kind": "CVR number",
            "note": "Issued by the Danish Business Authority (Erhvervsstyrelsen) in the Central Business Register. The Danish VAT number is DK plus these 8 digits.",
        }
    return {
        "ok": True, "format_only": True, "check_digit": "advisory_bad", "display": d, "kind": "CVR number (well-formed)",
        "note": "The length is right, but the mod-11 check does not pass. It is a guide, not a rule: some genuine CVR numbers fail it, so this is a warning and not a rejection, and it does not confirm the company exists.",
    }


# -- Estonia: registrikood ------------------------------------------------------------------
def _ee_check_digit(body):
    def s(weights):
        return sum(w * int(body[i]) for i, w in enumerate(weights)) % 11
    r = s([1, 2, 3, 4, 5, 6, 7])
    if r == 10:
        r = s([3, 4, 5, 6, 7, 8, 9])
        if r == 10:
            r = 0
    return r


def normalise_ee_registry_code(value):
    d = _strict_digits(value)
    return d if d and len(d) == 8 and d[0] in "1789" else None


def validate_ee_registry_code(value):
    d = normalise_ee_registry_code(value)
    if not d:
        s = _strict_digits(value)
        if s is None:
            return _bad("An Estonian registry code is digits only: exactly 8.")
        if len(s) == 8:
            return _bad("An Estonian registry code starts with 1, 7, 8 or 9.")
        return _bad("An Estonian registry code is exactly 8 digits.")
    expected = _ee_check_digit(d[:7])
    if expected != int(d[7]):
        return _bad(f"Check digit should be {expected}, not {d[7]}.")
    return {
        "ok": True, "check_digit": "ok", "display": d, "kind": "Registry code (registrikood)",
        "note": "The number a company, non-profit, foundation or public body holds in the Estonian e-Business Register. The VAT number (KMKR, EE plus 9 digits) is a separate number and cannot be derived from it.",
    }


# -- Slovakia: IČO --------------------------------------------------------------------------
_SK_WEIGHTS = [8, 7, 6, 5, 4, 3, 2]


def normalise_sk_ico(value):
    d = _strict_digits(value)
    return d.zfill(8) if d and 6 <= len(d) <= 8 else None


def validate_sk_ico(value):
    d = normalise_sk_ico(value)
    if not d:
        return _bad('An IČO is digits only: 8 digits. Text such as "Neuvedené" (not stated) is not an IČO.'
                    if _strict_digits(value) is None
                    else "An IČO is 8 digits (6 or 7 digits are read with leading zeros restored).")
    r = 11 - (sum(w * int(d[i]) for i, w in enumerate(_SK_WEIGHTS)) % 11)
    expected = 0 if r == 10 else 1 if r == 11 else r
    if expected == int(d[7]):
        return {
            "ok": True, "check_digit": "ok", "display": d, "kind": "IČO (identifikačné číslo organizácie)",
            "note": "Registered in the Slovak Register of Legal Entities (RPO). The VAT number (DIČ / IČ DPH) is a separate number and cannot be derived from it.",
        }
    return {
        "ok": True, "format_only": True, "check_digit": "advisory_bad", "display": d, "kind": "IČO (well-formed)",
        "note": f"The length is right, but the check digit should be {expected}, not {d[7]}. It is a guide, not a rule: some genuine IČO fail it, so this is a warning and not a rejection, and it does not confirm the entity exists.",
    }


# -- Switzerland: UID -----------------------------------------------------------------------
_CH_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4]
_CH_SUFFIX = re.compile(r"[\s.\-]*(?:MWST|TVA|IVA|HR|VAT)\Z")


def _ch_core(value):
    t = _CH_SUFFIX.sub("", ("" if value is None else str(value)).strip().upper())
    if not t.startswith("CHE"):
        return None
    rest = _SEP.sub("", t[3:])
    return rest if re.fullmatch(r"[0-9]{9}", rest) and rest != "000000000" else None


def normalise_ch_uid(value):
    c = _ch_core(value)
    return f"CHE{c}" if c else None


def validate_ch_uid(value):
    c = _ch_core(value)
    if not c:
        t = ("" if value is None else str(value)).strip().upper()
        if not t.startswith("CHE"):
            return _bad("A Swiss UID starts with CHE, followed by 9 digits (CHE-123.456.789).")
        if re.fullmatch(r"CHE[\s.\-]*0[0\s.\-]*", _CH_SUFFIX.sub("", t)):
            return _bad("An all-zero number is not a UID.")
        return _bad("A Swiss UID is CHE followed by exactly 9 digits (CHE-123.456.789).")
    k = 11 - (sum(w * int(c[i]) for i, w in enumerate(_CH_WEIGHTS)) % 11)
    if k == 11:
        k = 0
    if k == 10:
        return _bad("Invalid: the mod-11 check gives 10, so no valid UID has these first eight digits.")
    if k != int(c[8]):
        return _bad(f"Check digit should be {k}, not {c[8]}.")
    return {
        "ok": True, "check_digit": "ok", "display": f"CHE{c}", "kind": "UID (Unternehmens-Identifikationsnummer)",
        "note": "Issued by the Federal Statistical Office to every enterprise in Switzerland. The Swiss VAT number is the UID followed by MWST, TVA or IVA.",
    }


# -- United States: shape only --------------------------------------------------------------
_US_STATE = re.compile(r"([A-Za-z]{2})[\s\-.:]*([0-9A-Za-z][0-9A-Za-z\-./]{0,39})")
_US_CIK = re.compile(r"CIK[\s\-.:]*([0-9]{1,10})", re.I)
_US_LEI = re.compile(r"LEI[\s\-.:]*([0-9A-Za-z]{20})", re.I)


def normalise_us_number(value):
    t = ("" if value is None else str(value)).strip()
    m = _US_CIK.fullmatch(t)
    if m:
        return f"CIK-{m.group(1).zfill(10)}"
    m = _US_LEI.fullmatch(t)
    if m:
        return f"LEI-{m.group(1).upper()}"
    m = _US_STATE.fullmatch(t)
    if m and m.group(1).upper() not in ("CI", "LE"):
        return f"{m.group(1).upper()}-{m.group(2)}"
    return None


def validate_us_number(value):
    display = normalise_us_number(value)
    if not display:
        return _bad("A US company number is the state and the register number (NY-4424185), CIK- and up to 10 digits, or LEI- and 20 characters.")
    return {
        "ok": True, "check_digit": "ok", "format_only": True, "display": display,
        "kind": "US company number (well-formed)",
        "note": "US registers publish no check digit, so this confirms the shape only. There is no US VAT number.",
    }


# -- LEI (ISO 17442) ------------------------------------------------------------------------
def validate_lei(value):
    v = re.sub(r"[\s-]", "", ("" if value is None else str(value)).upper())
    if not re.fullmatch(r"[0-9A-Z]{18}[0-9]{2}", v):
        return _bad("A LEI is 20 characters: 18 letters or digits and 2 check digits.")
    if int("".join(str(int(ch, 36)) for ch in v)) % 97 != 1:
        return _bad("Fails the ISO 7064 MOD 97-10 check.")
    return {
        "ok": True, "check_digit": "ok", "display": v, "kind": "LEI (ISO 17442)",
        "note": "Legal Entity Identifier. The check digits are valid; whether the LEI is issued and active is recorded by GLEIF.",
    }


def raw_id(company_number):
    """The register number's digits as an integer, or None when it has none."""
    d = _digits("" if company_number is None else str(company_number))
    return int(d) if d else None


# -- EU VAT ---------------------------------------------------------------------------------
_VAT_PATTERNS = {
    "AT": r"U[0-9]{8}", "BE": r"[01][0-9]{9}", "BG": r"[0-9]{9,10}", "CY": r"[0-9]{8}[A-Z]",
    "CZ": r"[0-9]{8,10}", "DE": r"[0-9]{9}", "DK": r"[0-9]{8}", "EE": r"[0-9]{9}",
    "EL": r"[0-9]{9}", "ES": r"[A-Z0-9][0-9]{7}[A-Z0-9]", "FI": r"[0-9]{8}", "FR": r"[A-Z0-9]{2}[0-9]{9}",
    "HR": r"[0-9]{11}", "HU": r"[0-9]{8}", "IE": r"([0-9]{7}[A-Z]{1,2}|[0-9][A-Z][0-9]{5}[A-Z])",
    "IT": r"[0-9]{11}", "LT": r"([0-9]{9}|[0-9]{12})", "LU": r"[0-9]{8}", "LV": r"[0-9]{11}",
    "MT": r"[0-9]{8}", "NL": r"[0-9]{9}B[0-9]{2}", "PL": r"[0-9]{10}", "PT": r"[0-9]{9}",
    "RO": r"[0-9]{2,10}", "SE": r"[0-9]{10}01", "SI": r"[0-9]{8}", "SK": r"[0-9]{10}",
    "XI": r"([0-9]{9}|[0-9]{12}|(GD|HA)[0-9]{3})",
}


def validate_eu_vat(value):
    v = _clean(value)
    cc, rest = v[:2], v[2:]
    if cc not in _VAT_PATTERNS:
        return _fail(f'"{cc}" is not an EU VAT country prefix. Use the 2-letter code (Greece is EL, not GR; Northern Ireland is XI).')
    if not re.fullmatch(_VAT_PATTERNS[cc], rest):
        return _fail(f"Does not match the {cc} VAT number structure.")
    deeper = None
    if cc == "ES":
        deeper = validate_es_nif(rest)
    elif cc == "PL":
        deeper = validate_pl_nip(rest)
    elif cc == "FR" and re.fullmatch(r"[0-9]{9}", rest[2:]):
        deeper = validate_fr_siren(rest[2:])
    elif cc == "FI":
        deeper = validate_fi_ytunnus(rest)
    elif cc == "SE":
        deeper = {"ok": True} if _luhn_ok(rest[:10]) else _fail("Fails the Luhn check digit.")
    elif cc == "BE":
        deeper = validate_be_enterprise(rest)
    elif cc == "HR":
        deeper = validate_hr_oib(rest)
    elif cc == "DK":
        deeper = validate_dk_cvr(rest)
    if deeper and not deeper["ok"]:
        return _fail(f"Structure is right for {cc}, but the national check digit fails: {deeper['reason']}")
    advisory = deeper is not None and deeper.get("check_digit") == "advisory_bad"
    return {
        "ok": True, "kind": f"EU VAT number ({cc}, well-formed)",
        "note": "Structure is valid. Whether it is REGISTERED and active can only be confirmed against VIES, which requires a server-side call."
        + (" The Danish mod-11 check digit does not match; some genuine numbers fail it, so treat that as a warning." if advisory else ""),
        "format_only": True,
    }


def vat_to_company_number(country_code, vat):
    """The register company number recovered from a VAT number, or None."""
    code = str(country_code).upper()
    if code == "CH":
        return normalise_ch_uid(vat)
    if code in ("EE", "SK", "US"):
        return None
    v = _clean(vat)
    if not v.startswith(code):
        return None
    rest = v[len(code):]
    if not re.fullmatch(r"[0-9]+", rest):
        return None
    if code == "FI":
        return normalise_fi_ytunnus(rest) if len(rest) == 8 else None
    if code == "SE":
        return normalise_se_orgnr(rest[:10]) if len(rest) == 12 and rest.endswith("01") else None
    if code == "BE":
        return normalise_be_enterprise(rest) if len(rest) == 10 else None
    if code == "DK":
        return normalise_dk_cvr(rest) if len(rest) == 8 else None
    if code == "HR":
        return rest if len(rest) == 11 else None
    return None


VALIDATORS = [
    {"id": "auto", "label": "Detect automatically"},
    {"id": "es-nif", "label": "Spain — NIF / CIF / NIE", "fn": validate_es_nif},
    {"id": "fr-siren", "label": "France — SIREN", "fn": validate_fr_siren},
    {"id": "fr-siret", "label": "France — SIRET", "fn": validate_fr_siret},
    {"id": "gb-company", "label": "United Kingdom — company number", "fn": validate_gb_company_number},
    {"id": "ie-cro", "label": "Ireland — CRO number", "fn": validate_ie_cro},
    {"id": "pl-nip", "label": "Poland — NIP", "fn": validate_pl_nip},
    {"id": "pl-regon", "label": "Poland — REGON", "fn": validate_pl_regon},
    {"id": "no-orgnr", "label": "Norway — organisasjonsnummer", "fn": validate_no_orgnr},
    {"id": "fi-ytunnus", "label": "Finland — Y-tunnus", "fn": validate_fi_ytunnus},
    {"id": "se-orgnr", "label": "Sweden — organisationsnummer", "fn": validate_se_orgnr},
    {"id": "be-enterprise", "label": "Belgium — enterprise number", "fn": validate_be_enterprise},
    {"id": "hr-mbs", "label": "Croatia — MBS (court register)", "fn": validate_hr_mbs},
    {"id": "hr-oib", "label": "Croatia — OIB", "fn": validate_hr_oib},
    {"id": "dk-cvr", "label": "Denmark — CVR", "fn": validate_dk_cvr},
    {"id": "ee-registry-code", "label": "Estonia — registry code (registrikood)", "fn": validate_ee_registry_code},
    {"id": "sk-ico", "label": "Slovakia — IČO", "fn": validate_sk_ico},
    {"id": "eu-vat", "label": "EU VAT number", "fn": validate_eu_vat},
]


def auto_detect(value):
    """Best-effort guess of the identifier type; the result carries ``detected_as``."""
    v = _clean(value)
    d = _digits(value)
    raw = ("" if value is None else str(value)).strip()
    tries = []
    if re.fullmatch(r"[0-9]{6,7}-[0-9]", raw):
        tries.append(("fi-ytunnus", validate_fi_ytunnus))
    if re.fullmatch(r"[0-9]{6}-[0-9]{4}", raw):
        tries.append(("se-orgnr", validate_se_orgnr))
    if re.fullmatch(r"[01][0-9]{3}[. ][0-9]{3}[. ][0-9]{3}", raw):
        tries.append(("be-enterprise", validate_be_enterprise))
    if re.match(r"[A-Z]{2}", v) and v[:2] in _VAT_PATTERNS:
        tries.append(("eu-vat", validate_eu_vat))
    if re.fullmatch(r"[A-Z0-9]{9}", v) and re.search(r"[A-Z]", v):
        tries.append(("es-nif", validate_es_nif))
    if len(d) == 14:
        tries += [("fr-siret", validate_fr_siret), ("pl-regon", validate_pl_regon)]
    if len(d) == 9:
        tries += [("no-orgnr", validate_no_orgnr), ("fr-siren", validate_fr_siren),
                  ("pl-regon", validate_pl_regon), ("hr-mbs", validate_hr_mbs)]
    if len(d) == 10:
        tries += [("pl-nip", validate_pl_nip), ("se-orgnr", validate_se_orgnr), ("be-enterprise", validate_be_enterprise)]
    if len(d) == 11:
        tries.append(("hr-oib", validate_hr_oib))
    if len(d) == 12 and d.startswith("16"):
        tries.append(("se-orgnr", validate_se_orgnr))
    # A plain 8-digit number stays a UK company number: that rule accepts every 8 digits.
    if re.fullmatch(r"[0-9]{8}|[A-Z]{2}[0-9]{6}", v):
        tries.append(("gb-company", validate_gb_company_number))
    if 4 <= len(d) <= 7:
        tries.append(("ie-cro", validate_ie_cro))
    for type_id, fn in tries:
        r = fn(value)
        if r["ok"] and r.get("check_digit") != "advisory_bad":
            return {**r, "detected_as": type_id}
    return {"ok": False, "reason": "No European identifier format matched. Pick a type above to see why.", "detected_as": None}
