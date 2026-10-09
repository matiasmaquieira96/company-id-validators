import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  validateEsNif, validateFrSiren, validateFrSiret, validatePlNip, validatePlRegon,
  validateNoOrgnr, validateGbCompanyNumber, validateIeCro, validateEuVat, autoDetect,
  validateFiYtunnus, validateSeOrgnr, validateBeEnterprise, validateHrOib, validateHrMbs, validateDkCvr,
  validateEeRegistryCode, validateSkIco, validateChUid, validateUsNumber,
  normaliseFiYtunnus, normaliseSeOrgnr, normaliseBeEnterprise, normaliseHrMbs, normaliseDkCvr,
  normaliseEeRegistryCode, normaliseSkIco, normaliseChUid, normaliseUsNumber,
  looksLikePersonnummer, rawId, vatToCompanyNumber, VALIDATORS,
  validateLei,
} from '../dist/index.mjs'

let pass = 0
let fail = 0
const failures = []

function expect(label, actual, want) {
  if (actual === want) { pass++; return }
  fail++
  failures.push(`${label}: expected ${want}, got ${actual}`)
}

function equal(label, actual, want) {
  if (actual === want) { pass++; return }
  fail++
  failures.push(`${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(actual)}`)
}

test('site cases and shared vectors', () => {
// ── known-good, real identifiers ──────────────────────────────────────────────
const GOOD = [
  ['ES CIF A78053147 (TELEFONICA SA, verified in corpus)', validateEsNif, 'A78053147'],
  ['ES CIF A28015865 (valid checksum; NOT Telefonica - do not relabel)', validateEsNif, 'A28015865'],
  ['ES CIF Banco Santander A39000013', validateEsNif, 'A39000013'],
  ['ES CIF Inditex A15075062', validateEsNif, 'A15075062'],
  ['ES DNI 12345678Z', validateEsNif, '12345678Z'],
  ['FR SIREN Danone 552032534', validateFrSiren, '552032534'],
  ['FR SIREN L\'Oréal 632012100', validateFrSiren, '632012100'],
  ['FR SIRET Danone 55203253400646', validateFrSiret, '55203253400646'],
  ['PL NIP Orlen 7740001454', validatePlNip, '7740001454'],
  ['PL REGON-9 Orlen 610188201', validatePlRegon, '610188201'],
  ['NO orgnr Equinor 923609016', validateNoOrgnr, '923609016'],
  ['NO orgnr DNB 984851006', validateNoOrgnr, '984851006'],
  ['GB company number 00445790 (Tesco)', validateGbCompanyNumber, '00445790'],
  ['GB Scottish SC095237', validateGbCompanyNumber, 'SC095237'],
  ['IE CRO 100416', validateIeCro, '100416'],
  ['EU VAT ES A28015865', validateEuVat, 'ESA28015865'],
  ['EU VAT PL 7740001454', validateEuVat, 'PL7740001454'],
  ['EU VAT DE 123456789', validateEuVat, 'DE123456789'],
  ['EU VAT NL 123456789B01', validateEuVat, 'NL123456789B01'],
]

// ── near-misses: one digit changed. A broken checksum accepts these. ──────────
const BAD = [
  ['ES CIF wrong control A28015866', validateEsNif, 'A28015866'],
  ['ES DNI wrong letter 12345678A', validateEsNif, '12345678A'],
  ['ES CIF bad legal-form letter I28015865', validateEsNif, 'I28015865'],
  ['FR SIREN off by one 552032535', validateFrSiren, '552032535'],
  ['FR SIREN too short 55203253', validateFrSiren, '55203253'],
  ['FR SIRET off by one 55203253400647', validateFrSiret, '55203253400647'],
  ['PL NIP off by one 7740001455', validatePlNip, '7740001455'],
  ['PL REGON-9 off by one 610188202', validatePlRegon, '610188202'],
  ['NO orgnr off by one 923609017', validateNoOrgnr, '923609017'],
  ['NO orgnr too short 92360901', validateNoOrgnr, '92360901'],
  ['GB bad shape 1234567', validateGbCompanyNumber, '1234567'],
  ['EU VAT unknown country QQ123456789', validateEuVat, 'QQ123456789'],
  ['EU VAT GR instead of EL GR123456789', validateEuVat, 'GR123456789'],
  ['EU VAT ES structurally ok but bad checksum ESA28015866', validateEuVat, 'ESA28015866'],
  ['EU VAT NL missing B block NL123456789012', validateEuVat, 'NL123456789012'],
]

console.log('known-good identifiers (must all pass):')
for (const [label, fn, val] of GOOD) expect(label, fn(val).ok, true)
console.log('near-miss identifiers (must all be rejected):')
for (const [label, fn, val] of BAD) expect(label, fn(val).ok, false)

// ── formatting tolerance: real input has spaces, dots and dashes ──────────────
console.log('formatting tolerance:')
expect('SIREN with spaces', validateFrSiren('552 032 534').ok, true)
expect('NIP with dashes', validatePlNip('774-000-14-54').ok, true)
expect('NO orgnr with spaces', validateNoOrgnr('923 609 016').ok, true)
expect('ES CIF lowercase', validateEsNif('a28015865').ok, true)

// ── format-only claims must be labelled as such, never as "valid" ────────────
console.log('format-only honesty:')
expect('GB flagged formatOnly', validateGbCompanyNumber('00445790').formatOnly === true, true)
expect('IE flagged formatOnly', validateIeCro('100416').formatOnly === true, true)
expect('GB unrecognised prefix is flagged, not rejected', validateGbCompanyNumber('ZZ123456').unknownPrefix === true, true)
expect('GB known prefix not flagged', validateGbCompanyNumber('SC095237').unknownPrefix === undefined, true)
expect('VAT flagged formatOnly', validateEuVat('DE123456789').formatOnly === true, true)
expect('ES NIF NOT formatOnly (real checksum)', validateEsNif('A28015865').formatOnly === undefined, true)
expect('NO NOT formatOnly (real checksum)', validateNoOrgnr('923609016').formatOnly === undefined, true)

// ── auto-detect routes to the right validator ────────────────────────────────
console.log('auto-detect:')
expect('detects ES CIF', autoDetect('A28015865').detectedAs === 'es-nif', true)
expect('detects NO orgnr', autoDetect('923609016').detectedAs === 'no-orgnr', true)
expect('detects PL NIP', autoDetect('7740001454').detectedAs === 'pl-nip', true)
expect('detects EU VAT', autoDetect('PL7740001454').detectedAs === 'eu-vat', true)
expect('rejects nonsense', autoDetect('hello world').ok, false)

// ── golden vectors shared with ids.py: FI, SE, BE, HR, DK, EE, SK, CH, US ─────────────────────
// Real, sourced identifiers. A missing or unreadable file throws and fails the run: this
// section must never be skipped silently.
const VECTORS = JSON.parse(readFileSync(
  new URL('./id_vectors.json', import.meta.url), 'utf8'))
const COUNTRIES = Object.keys(VECTORS).filter((cc) => cc !== '_meta')

// Per country: the shape-only normaliser and the validator. Croatia holds two identifiers, so it
// has a second validator for the OIB; a vector says which one it means with id_type.
const RULES = {
  FI: { normalise: normaliseFiYtunnus, validate: validateFiYtunnus },
  SE: { normalise: normaliseSeOrgnr, validate: validateSeOrgnr },
  BE: { normalise: normaliseBeEnterprise, validate: validateBeEnterprise },
  HR: { normalise: normaliseHrMbs, validate: validateHrMbs, validateOib: validateHrOib },
  DK: { normalise: normaliseDkCvr, validate: validateDkCvr },
  EE: { normalise: normaliseEeRegistryCode, validate: validateEeRegistryCode },
  SK: { normalise: normaliseSkIco, validate: validateSkIco },
  CH: { normalise: normaliseChUid, validate: validateChUid },
  US: { normalise: normaliseUsNumber, validate: validateUsNumber },
}
const pick = (rule, item) => (item.id_type === 'oib' ? rule.validateOib : rule.validate)
// The last digit moved by one: a broken checksum accepts it, so every real number is tried this way.
const bump = (s) => s.slice(0, -1) + String((Number(s.slice(-1)) + 1) % 10)

console.log('golden vectors (shared with the Python port):')
equal('vectors cover FI, SE, BE, HR, DK, EE, SK, CH, US', [...COUNTRIES].sort().join(','), 'BE,CH,DK,EE,FI,HR,SE,SK,US')
for (const cc of COUNTRIES) {
  const rule = RULES[cc]
  const set = VECTORS[cc]
  const gating = ['FI', 'SE', 'BE', 'EE', 'CH'].includes(cc)
  const shapeOnly = cc === 'US'   // no check digit at all: formatOnly, and a changed last digit is another valid number
  expect(`${cc}: at least 10 valid vectors`, set.valid.length >= 10, true)

  for (const item of set.valid) {
    const tag = `${cc} ${item.company} ${item.input}`
    const r = rule.validate(item.input)
    expect(`${tag} is valid`, r.ok, true)
    equal(`${tag} check digit`, r.checkDigit, 'ok')
    equal(`${tag} is not formatOnly`, r.formatOnly, shapeOnly ? true : undefined)
    equal(`${tag} display`, r.display, item.company_number)
    equal(`${tag} normalise`, rule.normalise(item.input), item.company_number)
    equal(`${tag} raw id`, rawId(item.company_number), item.raw_id)
    if (item.oib) {
      const o = rule.validateOib(item.oib)
      expect(`${tag} OIB ${item.oib} is valid`, o.ok, true)
      equal(`${tag} OIB check digit`, o.checkDigit, 'ok')
      expect(`${tag} OIB with the last digit moved is rejected`, rule.validateOib(bump(item.oib)).ok, false)
    }
    // Near-miss: a gating check digit rejects it, an advisory one flags it and still accepts.
    const near = rule.validate(bump(item.input))
    if (shapeOnly) {
      // nothing to break: the input has no checksum
    } else if (gating) {
      expect(`${tag} with the last digit moved is rejected`, near.ok, false)
    } else {
      expect(`${tag} with the last digit moved is still well-formed`, near.ok, true)
      equal(`${tag} with the last digit moved is flagged`, near.checkDigit, 'advisory_bad')
    }
  }

  for (const item of set.invalid) {
    const tag = `${cc} ${item.input} (${item.reason})`
    expect(`${tag} is rejected`, pick(rule, item)(item.input).ok, false)
    if (item.reason === 'personnummer_shape') {
      expect(`${tag} looks like a personnummer`, looksLikePersonnummer(item.input), true)
    }
  }

  // FI, SE, BE, EE and CH check digits are gating: they never answer 'advisory_bad'.
  if (gating) {
    for (const item of [...set.valid, ...set.invalid]) {
      const cd = rule.validate(item.input).checkDigit
      expect(`${cc} ${item.input} is never advisory`, cd === 'ok' || cd === 'bad', true)
    }
  }

  // DK, SK and HR (MBS) check digits are advisory: a mismatch still validates, flagged formatOnly.
  for (const item of set.advisory || []) {
    const tag = `${cc} ${item.input} (advisory)`
    const r = pick(rule, item)(item.input)
    expect(`${tag} still validates`, r.ok, true)
    equal(`${tag} check digit`, r.checkDigit, 'advisory_bad')
    equal(`${tag} is flagged formatOnly`, r.formatOnly, true)
    equal(`${tag} display`, r.display, item.company_number)
  }

  for (const item of set.normalization) {
    equal(`${cc} normalise ${item.input}`, rule.normalise(item.input), item.company_number)
  }
  // An expected of null is a VAT number that must map to no company_number.
  for (const item of set.vat) {
    equal(`${cc} VAT ${item.input} maps to the company number`, vatToCompanyNumber(cc, item.input), item.expected)
    // CH is not an EU member: its VAT number (the UID) is outside validateEuVat's prefix table.
    if (item.expected !== null && cc !== 'CH') {
      expect(`${cc} VAT ${item.input} has a valid structure`, validateEuVat(item.input).ok, true)
    }
  }
}

// ── the new rules beyond the vectors ──────────────────────────────────────────
console.log('new identifiers, beyond the vectors:')
// A letter must fail the shape. The loose digits() helper would drop it and can hand back a
// shorter number that checks out: 011203X9 -> 0112039 is one such string.
expect('FI a stray letter is not dropped', validateFiYtunnus('0112038-9X').ok, false)
expect('SE a stray letter is not dropped', validateSeOrgnr('556012-5790X').ok, false)
expect('BE a stray letter is not dropped', validateBeEnterprise('0417.497.106X').ok, false)
expect('HR OIB a stray letter is not dropped', validateHrOib('27759560625X').ok, false)
expect('HR MBS a stray letter is not dropped', validateHrMbs('080000604X').ok, false)
expect('DK a stray letter is not dropped', validateDkCvr('24256790A').ok, false)
// Fullwidth digits are not digits here; ids.py rejects them for the same reason (the same
// vectors are in id_vectors.json), so a company_number can never be stored in non-ASCII form.
expect('DK fullwidth digits are rejected', validateDkCvr('２４２５６７９０').ok, false)
expect('FI superscript digit is rejected', validateFiYtunnus('011203²-9').ok, false)
// Formatting tolerance and the honest labels.
expect('FI with spaces', validateFiYtunnus('0112038 9').ok, true)
expect('SE with a leading 16', validateSeOrgnr('16 556012-5790').ok, true)
expect('BE with spaces', validateBeEnterprise('0417 497 106').ok, true)
expect('HR OIB with spaces', validateHrOib('277 5956 0625').ok, true)
expect('DK with spaces', validateDkCvr('24 25 67 90').ok, true)
expect('SE personnummer is explained, not just refused', /personnummer/.test(validateSeOrgnr('811228-9874').reason), true)
expect('HR OIB given an MBS says so', /MBS/.test(validateHrOib('080000604').reason), true)
expect('HR MBS given an OIB says so', /OIB/.test(validateHrMbs('27759560625').reason), true)
expect('BE 9 digits (dropped zero) reads as the full number', validateBeEnterprise('417497106').ok, true)
expect('FI remainder 1 is never issued', /never issued/.test(validateFiYtunnus('0000006-0').reason), true)

console.log('EE, SK and CH, beyond the vectors:')
expect('EE first digit 2 is rejected even with a right check digit', validateEeRegistryCode('20000002').ok, false)
expect('EE first digit 0 is rejected', validateEeRegistryCode('00000000').ok, false)
expect('EE a stray letter is not dropped', validateEeRegistryCode('1006070A').ok, false)
expect('EE needing the second weight pass', validateEeRegistryCode('14112620').ok, true)
expect('EE second pass giving 10 means 0', validateEeRegistryCode('14364310').ok, true)
expect('EE with spaces', validateEeRegistryCode('1006 0701').ok, true)
equal('EE VAT is not derived from the registry code', vatToCompanyNumber('EE', 'EE100354546'), null)
equal('SK 6 digits are zero-padded', normaliseSkIco('151653'), '00151653')
equal('SK 7 digits are zero-padded', normaliseSkIco('5757442'), '05757442')
expect('SK 6-digit input validates', validateSkIco('151653').ok === true && validateSkIco('151653').checkDigit === 'ok', true)
expect('SK 5 digits are rejected', validateSkIco('12345').ok, false)
expect('SK 9 digits are rejected', validateSkIco('357634690').ok, false)
expect('SK "Neuvedené" is not an IČO', validateSkIco('Neuvedené').ok, false)
expect('SK a wrong check digit is advisory, not a rejection', validateSkIco('35763460').ok === true && validateSkIco('35763460').checkDigit === 'advisory_bad', true)
equal('SK VAT is not derived from the IČO', vatToCompanyNumber('SK', 'SK35763469'), null)
for (const t of ['CHE-242.294.601', 'che242294601', 'CHE-242.294.601 MWST', 'CHE-242.294.601 TVA', 'CHE-242.294.601 IVA', 'CHE242294601HR', 'CHE-242.294.601 VAT']) {
  equal(`CH ${t} reads as the UID`, normaliseChUid(t), 'CHE242294601')
  expect(`CH ${t} is valid`, validateChUid(t).ok, true)
}
expect('CH all zeros is not a UID', validateChUid('CHE000000000').ok, false)
expect('CH digits without CHE are rejected', validateChUid('242294601').ok, false)
expect('CH a stray letter is rejected', validateChUid('CHE24229460A').ok, false)
equal('rawId of a UID strips the CHE', rawId('CHE242294601'), 242294601)
equal('CH VAT is the UID', vatToCompanyNumber('CH', 'CHE-242.294.601 MWST'), 'CHE242294601')
equal('CH VAT with another prefix', vatToCompanyNumber('CH', 'DE242294601'), null)
// The five earlier countries keep their raw ids.
equal('rawId BE', rawId('0417.497.106'), 417497106)
equal('rawId FI', rawId('0112038-9'), 1120389)
equal('rawId HR', rawId('080000604'), 80000604)

console.log('EU VAT with a national check digit (FI, SE, BE, HR, DK):')
const VAT_GOOD = [
  ['FI Nokia', 'FI01120389'],
  ['SE Volvo', 'SE556012579001'],
  ['SE sole trader on a personnummer', 'SE811228987401'],
  ['BE AB InBev', 'BE0417497106'],
  ['HR INA', 'HR27759560625'],
  ['DK Novo Nordisk', 'DK24256790'],
]
const VAT_BAD = [
  ['FI check digit off by one', 'FI01120388'],
  ['SE Luhn digit off by one', 'SE556012579101'],
  ['SE suffix is not 01', 'SE556012579002'],
  ['BE check digits off by one', 'BE0417497107'],
  ['BE starts with 2', 'BE2417497106'],
  ['HR check digit off by one', 'HR27759560626'],
  ['HR 10 digits', 'HR2775956062'],
  ['DK 7 digits', 'DK2425679'],
]
for (const [label, val] of VAT_GOOD) expect(`VAT ${label} ${val}`, validateEuVat(val).ok, true)
for (const [label, val] of VAT_BAD) expect(`VAT ${label} ${val}`, validateEuVat(val).ok, false)
expect('VAT DK with a failing mod-11 is warned, not rejected', validateEuVat('DK24256791').ok === true && /mod-11/.test(validateEuVat('DK24256791').note), true)
equal('VAT to number: a personnummer-based SE VAT is not a company number', vatToCompanyNumber('SE', 'SE811228987401'), null)
equal('VAT to number: SE without the 01 suffix', vatToCompanyNumber('SE', 'SE556012579002'), null)
equal('VAT to number: another country prefix', vatToCompanyNumber('FI', 'DK24256790'), null)
equal('VAT to number: a country with no registry here', vatToCompanyNumber('PL', 'PL7740001454'), null)
equal('VAT to number: Croatia gives the OIB, never an MBS', vatToCompanyNumber('HR', 'HR27759560625'), '27759560625')

console.log('validator registry:')
const REGISTRY_IDS = { FI: ['fi-ytunnus'], SE: ['se-orgnr'], BE: ['be-enterprise'], HR: ['hr-mbs', 'hr-oib'], DK: ['dk-cvr'] }
for (const [cc, ids] of Object.entries(REGISTRY_IDS)) {
  for (const id of ids) expect(`VALIDATORS lists ${id}`, typeof VALIDATORS.find((v) => v.id === id)?.fn === 'function', true)
  expect(`every ${cc} entry id starts with ${cc.toLowerCase()}-`, ids.every((id) => id.startsWith(`${cc.toLowerCase()}-`)), true)
}
equal('validator ids are unique', new Set(VALIDATORS.map((v) => v.id)).size, VALIDATORS.length)

console.log('auto-detect, new identifiers:')
equal('detects a hyphenated Y-tunnus', autoDetect('0112038-9').detectedAs, 'fi-ytunnus')
equal('detects a legacy 6-digit Y-tunnus', autoDetect('112038-9').detectedAs, 'fi-ytunnus')
equal('detects a hyphenated organisationsnummer', autoDetect('556012-5790').detectedAs, 'se-orgnr')
equal('detects the 12-digit organisationsnummer', autoDetect('165560125790').detectedAs, 'se-orgnr')
equal('detects a dotted Belgian enterprise number', autoDetect('0417.497.106').detectedAs, 'be-enterprise')
equal('detects a plain Belgian enterprise number', autoDetect('0417497106').detectedAs, 'be-enterprise')
equal('detects an OIB', autoDetect('27759560625').detectedAs, 'hr-oib')
equal('detects an MBS', autoDetect('080000604').detectedAs, 'hr-mbs')
equal('detects a Danish VAT number', autoDetect('DK24256790').detectedAs, 'eu-vat')
expect('an MBS with a failing check digit is not guessed', autoDetect('080000605').ok, false)
// A plain 8-digit number stays a UK company number, as before: that rule accepts every 8 digits.
equal('a plain 8-digit number stays a UK company number', autoDetect('00445790').detectedAs, 'gb-company')


  console.log(`${pass} assertions passed, ${fail} failed`)
  if (fail) throw new Error(failures.join('\n'))
})

test('LEI (ISO 17442)', () => {
  // Real LEIs: Apple, Deutsche Bank
  for (const ok of ['HWUPKR0MPOU8FGXBT394', '7LTWFZYICNSX8D621K86', '7ltw fzyi-cnsx8d621k86']) {
    if (!validateLei(ok).ok) throw new Error('expected valid ' + ok)
  }
  for (const no of ['HWUPKR0MPOU8FGXBT395', 'HWUPKR0MPOU8FGXBT39', 'HWUPKR0MPOU8FGXBT3A4', '']) {
    if (validateLei(no).ok) throw new Error('expected invalid ' + no)
  }
})

test('CommonJS build exposes the same API', async () => {
  const { createRequire } = await import('node:module')
  const cjs = createRequire(import.meta.url)('../dist/index.cjs')
  const esm = await import('../dist/index.mjs')
  const a = Object.keys(cjs).sort().join()
  const b = Object.keys(esm).sort().join()
  if (a !== b) throw new Error('export mismatch')
  if (!cjs.validateFrSiren('552032534').ok) throw new Error('cjs validator failed')
})
