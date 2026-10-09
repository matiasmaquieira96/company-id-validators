# company-id-validators

Offline validators for European company identifiers and EU VAT numbers. Check digits and formats for 16 identifier types, no dependencies, no network, ES module and CommonJS, TypeScript types included. A Python port with the same API is published as `company-id-validators` on PyPI.

```sh
npm install company-id-validators
```

```js
import { validateFrSiren, autoDetect, vatToCompanyNumber } from 'company-id-validators'
// const { validateFrSiren } = require('company-id-validators')

validateFrSiren('552 032 534')
// { ok: true, kind: 'SIREN (legal unit)', note: '...' }

validateFrSiren('552032535')
// { ok: false, reason: 'Fails the Luhn check digit.' }

autoDetect('PL7740001454').detectedAs   // 'eu-vat'
vatToCompanyNumber('BE', 'BE0417497106') // '0417.497.106'
```

Every validator takes a string and returns `{ ok, ... }`. A failure carries a `reason`. A success carries `kind` and `note`, and the newer validators add `checkDigit` (`'ok' | 'bad' | 'advisory_bad'`), `display` (the canonical written form) and `formatOnly`.

**A well-formed number is not proof that a company exists.** Where a register publishes no check digit, or the check digit is only a guide, the result says so with `formatOnly: true`.

## Identifiers

| Country | Identifier | Function | Checked |
|---|---|---|---|
| Spain | NIF / CIF / NIE | `validateEsNif` | check digit or letter |
| France | SIREN | `validateFrSiren` | Luhn |
| France | SIRET | `validateFrSiret` | Luhn (La Poste digit-sum rule) |
| United Kingdom | company number | `validateGbCompanyNumber` | format only (no check digit exists) |
| Ireland | CRO number | `validateIeCro` | format only (no check digit exists) |
| Poland | NIP | `validatePlNip` | mod 11 |
| Poland | REGON (9 and 14) | `validatePlRegon` | mod 11 |
| Norway | organisasjonsnummer | `validateNoOrgnr` | mod 11 |
| Finland | Y-tunnus | `validateFiYtunnus` | mod 11 |
| Sweden | organisationsnummer | `validateSeOrgnr` | Luhn, third digit 2 or higher |
| Belgium | enterprise number | `validateBeEnterprise` | mod 97 |
| Croatia | OIB | `validateHrOib` | ISO 7064 MOD 11,10 |
| Croatia | MBS | `validateHrMbs` | ISO 7064 MOD 11,10, advisory |
| Denmark | CVR | `validateDkCvr` | mod 11, advisory |
| Estonia | registrikood | `validateEeRegistryCode` | mod 11 |
| Slovakia | IČO | `validateSkIco` | mod 11, advisory |
| Switzerland | UID | `validateChUid` | mod 11 |
| United States | state number, CIK, LEI-prefixed | `validateUsNumber` | format only |
| Global | LEI (ISO 17442) | `validateLei` | ISO 7064 MOD 97-10 |
| EU / XI | VAT number | `validateEuVat` | structure per country, plus the national check digit for ES, FR, PL, FI, SE, BE, HR, DK |

"Advisory" means the check digit is reported (`checkDigit: 'advisory_bad'`, `formatOnly: true`) but the number is still accepted, because genuine numbers exist that fail it.

## One example per country

```js
import * as v from 'company-id-validators'

v.validateEsNif('A28015865')            // Spain
v.validateFrSiret('55203253400646')     // France
v.validateGbCompanyNumber('SC095237')   // United Kingdom (format only)
v.validateIeCro('100416')               // Ireland (format only)
v.validatePlNip('774-000-14-54')        // Poland
v.validateNoOrgnr('923609016')          // Norway
v.validateFiYtunnus('0112038-9')        // Finland
v.validateSeOrgnr('556012-5790')        // Sweden
v.validateBeEnterprise('0417.497.106')  // Belgium
v.validateHrOib('27759560625')          // Croatia
v.validateDkCvr('24256790')             // Denmark
v.validateEeRegistryCode('10060701')    // Estonia
v.validateSkIco('151653')               // Slovakia (read as 00151653)
v.validateChUid('CHE-242.294.601')      // Switzerland
v.validateUsNumber('NY-4424185')        // United States (format only)
v.validateLei('HWUPKR0MPOU8FGXBT394')   // LEI
v.validateEuVat('DK24256790')           // EU VAT
```

## Helpers

- `autoDetect(input)` guesses the type; the result has `detectedAs` (`'fr-siren'`, `'eu-vat'`, ...) or `null`.
- `normaliseFiYtunnus`, `normaliseSeOrgnr`, `normaliseBeEnterprise`, `normaliseHrMbs`, `normaliseDkCvr`, `normaliseEeRegistryCode`, `normaliseSkIco`, `normaliseChUid`, `normaliseUsNumber` return the canonical number or `null`.
- `vatToCompanyNumber(countryCode, vat)` recovers the register number from a VAT number where that is possible (FI, SE, BE, DK, HR, CH), otherwise `null`.
- `looksLikePersonnummer(input)` tells a Swedish personal number from an organisation number.
- `rawId(companyNumber)` is the number's digits as an integer.
- `VALIDATORS` lists every validator with an id and a label.

## Need the company behind the number?

This package checks that a number is well-formed. The [Prometiam API](https://www.prometiam.com/risk-api/docs?utm_source=npm&utm_medium=readme&utm_campaign=company-id-validators) looks it up in the official registers.

## License

MIT
