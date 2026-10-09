# company-id-validators

Offline validators for European company identifiers and EU VAT numbers. Check digits and formats for ES, FR, GB, IE, PL, NO, FI, SE, BE, HR, DK, EE, SK, CH, US and LEI. Pure Python, no dependencies. The same API, in camelCase, is on npm as `company-id-validators`.

```sh
pip install company-id-validators
```

```python
from company_id_validators import validate_fr_siren, auto_detect, vat_to_company_number

validate_fr_siren("552 032 534")
# {'ok': True, 'kind': 'SIREN (legal unit)', 'note': '...'}

validate_fr_siren("552032535")
# {'ok': False, 'reason': 'Fails the Luhn check digit.'}

auto_detect("PL7740001454")["detected_as"]   # 'eu-vat'
vat_to_company_number("BE", "BE0417497106")  # '0417.497.106'
```

Every validator takes a string and returns a dict with `ok`. A failure carries `reason`. A success carries `kind` and `note`, and the newer validators add `check_digit` (`'ok'`, `'bad'` or `'advisory_bad'`), `display` (the canonical written form) and `format_only`.

**A well-formed number is not proof that a company exists.** Where a register publishes no check digit, or the check digit is only a guide, the result says so with `format_only: True`.

## Identifiers

| Country | Identifier | Function | Checked |
|---|---|---|---|
| Spain | NIF / CIF / NIE | `validate_es_nif` | check digit or letter |
| France | SIREN | `validate_fr_siren` | Luhn |
| France | SIRET | `validate_fr_siret` | Luhn (La Poste digit-sum rule) |
| United Kingdom | company number | `validate_gb_company_number` | format only (no check digit exists) |
| Ireland | CRO number | `validate_ie_cro` | format only (no check digit exists) |
| Poland | NIP | `validate_pl_nip` | mod 11 |
| Poland | REGON (9 and 14) | `validate_pl_regon` | mod 11 |
| Norway | organisasjonsnummer | `validate_no_orgnr` | mod 11 |
| Finland | Y-tunnus | `validate_fi_ytunnus` | mod 11 |
| Sweden | organisationsnummer | `validate_se_orgnr` | Luhn, third digit 2 or higher |
| Belgium | enterprise number | `validate_be_enterprise` | mod 97 |
| Croatia | OIB | `validate_hr_oib` | ISO 7064 MOD 11,10 |
| Croatia | MBS | `validate_hr_mbs` | ISO 7064 MOD 11,10, advisory |
| Denmark | CVR | `validate_dk_cvr` | mod 11, advisory |
| Estonia | registrikood | `validate_ee_registry_code` | mod 11 |
| Slovakia | IČO | `validate_sk_ico` | mod 11, advisory |
| Switzerland | UID | `validate_ch_uid` | mod 11 |
| United States | state number, CIK, LEI-prefixed | `validate_us_number` | format only |
| Global | LEI (ISO 17442) | `validate_lei` | ISO 7064 MOD 97-10 |
| EU / XI | VAT number | `validate_eu_vat` | structure per country, plus the national check digit for ES, FR, PL, FI, SE, BE, HR, DK |

"Advisory" means the check digit is reported (`check_digit: 'advisory_bad'`, `format_only: True`) but the number is still accepted, because genuine numbers exist that fail it.

## One example per country

```python
import company_id_validators as v

v.validate_es_nif("A28015865")            # Spain
v.validate_fr_siret("55203253400646")     # France
v.validate_gb_company_number("SC095237")   # United Kingdom (format only)
v.validate_ie_cro("100416")               # Ireland (format only)
v.validate_pl_nip("774-000-14-54")        # Poland
v.validate_no_orgnr("923609016")          # Norway
v.validate_fi_ytunnus("0112038-9")        # Finland
v.validate_se_orgnr("556012-5790")        # Sweden
v.validate_be_enterprise("0417.497.106")  # Belgium
v.validate_hr_oib("27759560625")          # Croatia
v.validate_dk_cvr("24256790")             # Denmark
v.validate_ee_registry_code("10060701")    # Estonia
v.validate_sk_ico("151653")               # Slovakia (read as 00151653)
v.validate_ch_uid("CHE-242.294.601")      # Switzerland
v.validate_us_number("NY-4424185")        # United States (format only)
v.validate_lei("HWUPKR0MPOU8FGXBT394")   # LEI
v.validate_eu_vat("DK24256790")           # EU VAT
```

## Helpers

- `auto_detect(value)` guesses the type; the result has `detected_as` (`'fr-siren'`, `'eu-vat'`, ...) or `None`.
- `normalise_fi_ytunnus`, `normalise_se_orgnr`, `normalise_be_enterprise`, `normalise_hr_mbs`, `normalise_dk_cvr`, `normalise_ee_registry_code`, `normalise_sk_ico`, `normalise_ch_uid`, `normalise_us_number` return the canonical number or `None`.
- `vat_to_company_number(country_code, vat)` recovers the register number from a VAT number where that is possible (FI, SE, BE, DK, HR, CH), otherwise `None`.
- `looks_like_personnummer(value)` tells a Swedish personal number from an organisation number.
- `raw_id(company_number)` is the number's digits as an integer.
- `VALIDATORS` lists every validator with an id and a label.

## Need the company behind the number?

This package checks that a number is well-formed. The [Prometiam API](https://www.prometiam.com/risk-api/docs?utm_source=pypi&utm_medium=readme&utm_campaign=company-id-validators) looks it up in the official registers.

## License

MIT
