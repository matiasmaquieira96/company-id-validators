"""Runs the shared id_vectors.json cases and the site's own known-good / near-miss cases.

Run: python -m unittest discover -s tests   (from packages/company-id-validators-py, with src on the path)
"""
import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import company_id_validators as v  # noqa: E402

with open(os.path.join(HERE, "id_vectors.json"), encoding="utf-8") as f:
    VECTORS = json.load(f)
COUNTRIES = [cc for cc in VECTORS if cc != "_meta"]

RULES = {
    "FI": (v.normalise_fi_ytunnus, v.validate_fi_ytunnus, None),
    "SE": (v.normalise_se_orgnr, v.validate_se_orgnr, None),
    "BE": (v.normalise_be_enterprise, v.validate_be_enterprise, None),
    "HR": (v.normalise_hr_mbs, v.validate_hr_mbs, v.validate_hr_oib),
    "DK": (v.normalise_dk_cvr, v.validate_dk_cvr, None),
    "EE": (v.normalise_ee_registry_code, v.validate_ee_registry_code, None),
    "SK": (v.normalise_sk_ico, v.validate_sk_ico, None),
    "CH": (v.normalise_ch_uid, v.validate_ch_uid, None),
    "US": (v.normalise_us_number, v.validate_us_number, None),
}
GATING = ("FI", "SE", "BE", "EE", "CH")


def bump(s):
    return s[:-1] + str((int(s[-1]) + 1) % 10)


class SharedVectors(unittest.TestCase):
    def test_countries(self):
        self.assertEqual(sorted(COUNTRIES), ["BE", "CH", "DK", "EE", "FI", "HR", "SE", "SK", "US"])

    def test_vectors(self):
        for cc in COUNTRIES:
            normalise, validate, validate_oib = RULES[cc]
            data = VECTORS[cc]
            for item in data["valid"]:
                with self.subTest(cc=cc, input=item["input"]):
                    r = validate(item["input"])
                    self.assertTrue(r["ok"])
                    self.assertEqual(r["check_digit"], "ok")
                    self.assertEqual(r.get("format_only"), True if cc == "US" else None)
                    self.assertEqual(r["display"], item["company_number"])
                    self.assertEqual(normalise(item["input"]), item["company_number"])
                    self.assertEqual(v.raw_id(item["company_number"]), item["raw_id"])
                    if item.get("oib"):
                        o = validate_oib(item["oib"])
                        self.assertTrue(o["ok"])
                        self.assertFalse(validate_oib(bump(item["oib"]))["ok"])
                    if cc == "US":
                        continue
                    near = validate(bump(item["input"]))
                    if cc in GATING:
                        self.assertFalse(near["ok"])
                    else:
                        self.assertTrue(near["ok"])
                        self.assertEqual(near["check_digit"], "advisory_bad")
            for item in data["invalid"]:
                with self.subTest(cc=cc, invalid=item["input"]):
                    fn = validate_oib if item.get("id_type") == "oib" else validate
                    self.assertFalse(fn(item["input"])["ok"])
                    if item["reason"] == "personnummer_shape":
                        self.assertTrue(v.looks_like_personnummer(item["input"]))
            for item in data.get("advisory", []):
                with self.subTest(cc=cc, advisory=item["input"]):
                    fn = validate_oib if item.get("id_type") == "oib" else validate
                    r = fn(item["input"])
                    self.assertTrue(r["ok"])
                    self.assertEqual(r["check_digit"], "advisory_bad")
                    self.assertTrue(r["format_only"])
                    self.assertEqual(r["display"], item["company_number"])
            for item in data["normalization"]:
                with self.subTest(cc=cc, normalise=item["input"]):
                    self.assertEqual(normalise(item["input"]), item["company_number"])
            for item in data["vat"]:
                with self.subTest(cc=cc, vat=item["input"]):
                    self.assertEqual(v.vat_to_company_number(cc, item["input"]), item["expected"])
                    if item["expected"] is not None and cc != "CH":
                        self.assertTrue(v.validate_eu_vat(item["input"])["ok"])


GOOD = [
    (v.validate_es_nif, x) for x in ("A78053147", "A28015865", "A39000013", "A15075062", "12345678Z", "a28015865")
] + [
    (v.validate_fr_siren, "552032534"), (v.validate_fr_siren, "632012100"), (v.validate_fr_siren, "552 032 534"),
    (v.validate_fr_siret, "55203253400646"),
    (v.validate_pl_nip, "7740001454"), (v.validate_pl_nip, "774-000-14-54"), (v.validate_pl_regon, "610188201"),
    (v.validate_no_orgnr, "923609016"), (v.validate_no_orgnr, "984851006"),
    (v.validate_gb_company_number, "00445790"), (v.validate_gb_company_number, "SC095237"),
    (v.validate_ie_cro, "100416"),
    (v.validate_eu_vat, "ESA28015865"), (v.validate_eu_vat, "PL7740001454"),
    (v.validate_eu_vat, "DE123456789"), (v.validate_eu_vat, "NL123456789B01"),
    (v.validate_eu_vat, "FI01120389"), (v.validate_eu_vat, "SE556012579001"), (v.validate_eu_vat, "SE811228987401"),
    (v.validate_eu_vat, "BE0417497106"), (v.validate_eu_vat, "HR27759560625"), (v.validate_eu_vat, "DK24256790"),
    (v.validate_lei, "HWUPKR0MPOU8FGXBT394"), (v.validate_lei, "7LTWFZYICNSX8D621K86"),
    (v.validate_ch_uid, "CHE-242.294.601 MWST"), (v.validate_sk_ico, "151653"),
    (v.validate_ee_registry_code, "14112620"), (v.validate_ee_registry_code, "14364310"),
]
BAD = [
    (v.validate_es_nif, "A28015866"), (v.validate_es_nif, "12345678A"), (v.validate_es_nif, "I28015865"),
    (v.validate_fr_siren, "552032535"), (v.validate_fr_siren, "55203253"), (v.validate_fr_siret, "55203253400647"),
    (v.validate_pl_nip, "7740001455"), (v.validate_pl_regon, "610188202"),
    (v.validate_no_orgnr, "923609017"), (v.validate_no_orgnr, "92360901"),
    (v.validate_gb_company_number, "1234567"),
    (v.validate_eu_vat, "QQ123456789"), (v.validate_eu_vat, "GR123456789"), (v.validate_eu_vat, "ESA28015866"),
    (v.validate_eu_vat, "NL123456789012"), (v.validate_eu_vat, "FI01120388"), (v.validate_eu_vat, "SE556012579101"),
    (v.validate_eu_vat, "SE556012579002"), (v.validate_eu_vat, "BE0417497107"), (v.validate_eu_vat, "BE2417497106"),
    (v.validate_eu_vat, "HR27759560626"), (v.validate_eu_vat, "HR2775956062"), (v.validate_eu_vat, "DK2425679"),
    (v.validate_lei, "HWUPKR0MPOU8FGXBT395"), (v.validate_lei, "HWUPKR0MPOU8FGXBT39"),
    (v.validate_fi_ytunnus, "0112038-9X"), (v.validate_se_orgnr, "556012-5790X"),
    (v.validate_be_enterprise, "0417.497.106X"), (v.validate_hr_oib, "27759560625X"),
    (v.validate_dk_cvr, "24256790A"), (v.validate_dk_cvr, "２４２５６７９０"),
    (v.validate_fi_ytunnus, "011203²-9"), (v.validate_ee_registry_code, "20000002"),
    (v.validate_ch_uid, "CHE000000000"), (v.validate_ch_uid, "242294601"), (v.validate_sk_ico, "12345"),
    (v.validate_sk_ico, "Neuvedené"),
]


class SiteCases(unittest.TestCase):
    def test_good(self):
        for fn, x in GOOD:
            with self.subTest(fn=fn.__name__, input=x):
                self.assertTrue(fn(x)["ok"])

    def test_near_misses(self):
        for fn, x in BAD:
            with self.subTest(fn=fn.__name__, input=x):
                self.assertFalse(fn(x)["ok"])

    def test_format_only_honesty(self):
        self.assertTrue(v.validate_gb_company_number("00445790")["format_only"])
        self.assertTrue(v.validate_ie_cro("100416")["format_only"])
        self.assertTrue(v.validate_gb_company_number("ZZ123456")["unknown_prefix"])
        self.assertNotIn("unknown_prefix", v.validate_gb_company_number("SC095237"))
        self.assertNotIn("format_only", v.validate_es_nif("A28015865"))
        self.assertIn("mod-11", v.validate_eu_vat("DK24256791")["note"])

    def test_helpers(self):
        self.assertEqual(v.vat_to_company_number("BE", "BE0417497106"), "0417.497.106")
        self.assertIsNone(v.vat_to_company_number("SE", "SE811228987401"))
        self.assertIsNone(v.vat_to_company_number("EE", "EE100354546"))
        self.assertEqual(v.vat_to_company_number("HR", "HR27759560625"), "27759560625")
        self.assertEqual(v.raw_id("CHE242294601"), 242294601)
        self.assertEqual(v.normalise_sk_ico("151653"), "00151653")

    def test_auto_detect(self):
        for value, want in [
            ("A28015865", "es-nif"), ("923609016", "no-orgnr"), ("7740001454", "pl-nip"), ("PL7740001454", "eu-vat"),
            ("0112038-9", "fi-ytunnus"), ("556012-5790", "se-orgnr"), ("165560125790", "se-orgnr"),
            ("0417.497.106", "be-enterprise"), ("27759560625", "hr-oib"), ("080000604", "hr-mbs"),
            ("DK24256790", "eu-vat"), ("00445790", "gb-company"),
        ]:
            with self.subTest(value=value):
                self.assertEqual(v.auto_detect(value)["detected_as"], want)
        self.assertFalse(v.auto_detect("hello world")["ok"])
        self.assertFalse(v.auto_detect("080000605")["ok"])

    def test_non_ascii_digits_rejected(self):
        self.assertFalse(v.validate_lei("HWUPKR0MPOU8FGXBT39٤")["ok"])


if __name__ == "__main__":
    unittest.main()
