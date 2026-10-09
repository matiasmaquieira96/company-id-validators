// Offline validators for European company identifiers.
//
// Every function here is PURE ARITHMETIC — no network, no API key, nothing leaves the process.
// A malformed identifier can be rejected before it costs a lookup.
//
// Where a registry publishes no check digit (Ireland's CRO, UK company numbers) we say so
// explicitly rather than pretending a format check is a validity check. That distinction is the
// whole point: "well-formed" and "exists" are different claims, and conflating them is how
// verification flows end up trusting numbers nobody ever looked up.
//
// Tested against known-good and known-bad values, including the deliberate near-misses (last digit incremented) that a broken checksum accepts.

const digits = (s) => (s || '').replace(/[^0-9]/g, '')
const clean = (s) => (s || '').toUpperCase().replace(/[\s.\-/]/g, '')
// Separators removed, then digits only. digits() above drops a stray letter, which would turn a
// typo into a shorter number that can still check out; here a letter fails the shape instead.
const strictDigits = (s) => {
  const c = String(s ?? '').replace(/[\s.\-/]/g, '')
  return /^[0-9]+$/.test(c) ? c : null
}
const bad = (reason) => ({ ok: false, checkDigit: 'bad', reason })

// ── Spain: NIF / NIE / CIF ────────────────────────────────────────────────────
const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE'
const CIF_CONTROL_LETTERS = 'JABCDEFGHI'
// Legal-form letter -> what it means. A/B are the overwhelming majority.
const CIF_FORMS = {
  A: 'Sociedad Anónima (SA)', B: 'Sociedad Limitada (SL/SRL)', C: 'Sociedad Colectiva',
  D: 'Sociedad Comanditaria', E: 'Comunidad de bienes', F: 'Sociedad Cooperativa',
  G: 'Asociación / fundación', H: 'Comunidad de propietarios', J: 'Sociedad Civil',
  N: 'Entidad extranjera', P: 'Corporación local', Q: 'Organismo público',
  R: 'Congregación religiosa', S: 'Órgano de la Administración', U: 'Unión Temporal de Empresas',
  V: 'Otro tipo', W: 'Establecimiento permanente de entidad no residente',
}

export function validateEsNif(input) {
  const v = clean(input)
  if (!/^[A-Z0-9]{9}$/.test(v)) {
    return { ok: false, reason: 'A Spanish NIF/CIF is 9 characters.' }
  }
  // Personal DNI: 8 digits + letter
  if (/^[0-9]{8}[A-Z]$/.test(v)) {
    const expected = DNI_LETTERS[parseInt(v.slice(0, 8), 10) % 23]
    return v[8] === expected
      ? { ok: true, kind: 'DNI (individual)', note: 'This is a personal DNI, not a company identifier.' }
      : { ok: false, reason: `Check letter should be ${expected}, not ${v[8]}.` }
  }
  // Foreigner NIE: X/Y/Z + 7 digits + letter
  if (/^[XYZ][0-9]{7}[A-Z]$/.test(v)) {
    const prefix = { X: '0', Y: '1', Z: '2' }[v[0]]
    const expected = DNI_LETTERS[parseInt(prefix + v.slice(1, 8), 10) % 23]
    return v[8] === expected
      ? { ok: true, kind: 'NIE (foreign individual)', note: 'This is a personal NIE, not a company identifier.' }
      : { ok: false, reason: `Check letter should be ${expected}, not ${v[8]}.` }
  }
  // Company CIF: letter + 7 digits + control (digit or letter)
  if (/^[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]$/.test(v)) {
    const body = v.slice(1, 8)
    let even = 0
    let odd = 0
    for (let i = 0; i < 7; i++) {
      const n = Number(body[i])
      if (i % 2 === 0) {
        const d = n * 2
        odd += d > 9 ? d - 9 : d      // positions 1,3,5,7 (1-indexed) are doubled
      } else {
        even += n
      }
    }
    const sum = even + odd
    const controlDigit = (10 - (sum % 10)) % 10
    const controlLetter = CIF_CONTROL_LETTERS[controlDigit]
    const given = v[8]
    // Some legal forms take a digit, some a letter, several accept either.
    if (given === String(controlDigit) || given === controlLetter) {
      return { ok: true, kind: `CIF — ${CIF_FORMS[v[0]] || 'company'}`, note: null }
    }
    return { ok: false, reason: `Control character should be ${controlDigit} or ${controlLetter}, not ${given}.` }
  }
  return { ok: false, reason: 'Not a recognised NIF, NIE or CIF pattern.' }
}

// ── France: SIREN (9) and SIRET (14), both Luhn ───────────────────────────────
function luhnOk(num) {
  let sum = 0
  for (let i = 0; i < num.length; i++) {
    // Double every second digit counting from the RIGHT.
    let d = Number(num[num.length - 1 - i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

export function validateFrSiren(input) {
  const v = digits(input)
  if (v.length !== 9) return { ok: false, reason: 'A SIREN is exactly 9 digits.' }
  return luhnOk(v)
    ? { ok: true, kind: 'SIREN (legal unit)', note: 'Identifies the legal entity. The SIRET adds a 5-digit establishment suffix.' }
    : { ok: false, reason: 'Fails the Luhn check digit.' }
}

export function validateFrSiret(input) {
  const v = digits(input)
  if (v.length !== 14) return { ok: false, reason: 'A SIRET is exactly 14 digits (9-digit SIREN + 5-digit NIC).' }
  // La Poste is the documented exception: its SIRETs do not satisfy Luhn, and the rule is
  // instead that the digits sum to a multiple of 5.
  if (v.startsWith('356000000')) {
    const sum = v.split('').reduce((a, d) => a + Number(d), 0)
    return sum % 5 === 0
      ? { ok: true, kind: 'SIRET (La Poste)', note: 'La Poste SIRETs use the special digit-sum rule, not Luhn.' }
      : { ok: false, reason: 'La Poste SIRET must have digits summing to a multiple of 5.' }
  }
  return luhnOk(v)
    ? { ok: true, kind: 'SIRET (establishment)', note: `SIREN ${v.slice(0, 9)} · NIC ${v.slice(9)}` }
    : { ok: false, reason: 'Fails the Luhn check digit.' }
}

// ── Poland: NIP (10) and REGON (9 or 14) ──────────────────────────────────────
export function validatePlNip(input) {
  const v = digits(input)
  if (v.length !== 10) return { ok: false, reason: 'A NIP is exactly 10 digits.' }
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7]
  const sum = w.reduce((a, wi, i) => a + wi * Number(v[i]), 0)
  const check = sum % 11
  if (check === 10) return { ok: false, reason: 'Invalid: the weighted sum gives 10, which is never a valid NIP check digit.' }
  return check === Number(v[9])
    ? { ok: true, kind: 'NIP (tax number)', note: 'Every Polish business has one, including sole traders. Prefix with PL for the EU VAT number.' }
    : { ok: false, reason: `Check digit should be ${check}, not ${v[9]}.` }
}

export function validatePlRegon(input) {
  const v = digits(input)
  const run = (weights, body, expected) => {
    const sum = weights.reduce((a, wi, i) => a + wi * Number(body[i]), 0)
    const c = sum % 11 === 10 ? 0 : sum % 11
    return c === Number(expected)
  }
  if (v.length === 9) {
    return run([8, 9, 2, 3, 4, 5, 6, 7], v, v[8])
      ? { ok: true, kind: 'REGON-9 (entity)', note: 'Statistical number issued by GUS.' }
      : { ok: false, reason: 'Fails the REGON-9 check digit.' }
  }
  if (v.length === 14) {
    const nine = run([8, 9, 2, 3, 4, 5, 6, 7], v, v[8])
    const full = run([2, 4, 8, 5, 0, 9, 7, 3, 6, 1, 2, 4, 8], v, v[13])
    return nine && full
      ? { ok: true, kind: 'REGON-14 (local unit)', note: `Parent entity REGON-9: ${v.slice(0, 9)}` }
      : { ok: false, reason: 'Fails the REGON-14 check digit.' }
  }
  return { ok: false, reason: 'A REGON is 9 digits (entity) or 14 digits (local unit).' }
}

// ── Norway: organisasjonsnummer (9, mod 11) ───────────────────────────────────
export function validateNoOrgnr(input) {
  const v = digits(input)
  if (v.length !== 9) return { ok: false, reason: 'A Norwegian organisation number is exactly 9 digits.' }
  const w = [3, 2, 7, 6, 5, 4, 3, 2]
  const sum = w.reduce((a, wi, i) => a + wi * Number(v[i]), 0)
  const rem = sum % 11
  const check = rem === 0 ? 0 : 11 - rem
  if (check === 10) return { ok: false, reason: 'Invalid: the mod-11 remainder gives 10, which is never issued.' }
  if (check !== Number(v[8])) return { ok: false, reason: `Check digit should be ${check}, not ${v[8]}.` }
  // Numbers currently in issue start at roughly 810 million — a low leading digit is a
  // strong hint that this is some other 9-digit Norwegian number (a personnummer, say).
  const low = Number(v) < 800000000
  return {
    ok: true,
    kind: 'Organisasjonsnummer',
    note: low
      ? 'Check digit passes, but numbers in issue start around 810 000 000 — verify this is an organisation number and not another 9-digit identifier.'
      : 'Registered in Enhetsregisteret at Brønnøysundregistrene.',
  }
}

// ── UK and Ireland: format only, no check digit exists ────────────────────────
export function validateGbCompanyNumber(input) {
  const v = clean(input)
  if (!/^([0-9]{8}|[A-Z]{2}[0-9]{6})$/.test(v)) {
    return { ok: false, reason: 'A UK company number is 8 digits, or 2 letters followed by 6 digits (e.g. SC123456, NI123456).' }
  }
  const prefix = /^[A-Z]{2}/.test(v) ? v.slice(0, 2) : null
  // Companies House issues many prefixes; these are the ones worth naming. An unrecognised
  // prefix is reported as unrecognised rather than rejected — for a format-only check a false
  // negative (telling someone their real company number is invalid) is the worse error.
  const KNOWN = {
    SC: 'Scotland', NI: 'Northern Ireland', OC: 'LLP (England & Wales)', SO: 'LLP (Scotland)',
    NC: 'LLP (Northern Ireland)', FC: 'Overseas company', GE: 'European Economic Interest Grouping',
    IP: 'Industrial & Provident society', RC: 'Royal Charter', SP: 'Scottish limited partnership',
    LP: 'Limited partnership', ZC: 'Unregistered company',
  }
  const jurisdiction = prefix ? KNOWN[prefix] : null
  const unknownPrefix = prefix && !jurisdiction
  return {
    ok: true,
    kind: 'UK company number (well-formed)',
    note: (jurisdiction ? jurisdiction + '. ' : '')
      + (unknownPrefix ? `"${prefix}" is not a prefix we recognise — double-check it. ` : '')
      + 'Companies House numbers carry NO check digit, so this confirms the format only — it does not confirm the company exists.',
    formatOnly: true,
    unknownPrefix: unknownPrefix || undefined,
  }
}

export function validateIeCro(input) {
  const v = digits(input)
  if (v.length < 4 || v.length > 7) {
    return { ok: false, reason: 'A CRO number is a plain integer, typically 5 to 7 digits.' }
  }
  return {
    ok: true,
    kind: 'CRO number (well-formed)',
    note: 'Irish CRO numbers carry NO check digit and no letter prefix, so this confirms the format only — it does not confirm the company exists.',
    formatOnly: true,
  }
}

// ── Finland, Sweden, Belgium, Croatia, Denmark ────────────────────────────────
// Every rule below is pinned to real registered numbers in test/id_vectors.json, which the
// Python port reads as well.
//
// Two of the five are ADVISORY rather than gating: a Croatian MBS and a Danish CVR are
// well-formed when they have the right length, and a check digit that does not match is reported
// (checkDigit 'advisory_bad', formatOnly true) instead of rejected, because genuine numbers
// exist that fail it. Every result carries checkDigit ('ok' | 'bad' | 'advisory_bad') and, when
// the shape is right, display: the number as the registry stores it.

// Finland: Y-tunnus, 7 digits + hyphen + 1 check digit, mod 11.
const FI_WEIGHTS = [7, 9, 10, 5, 8, 4, 2]

// A 6-digit body is the pre-2001 trade-register number carried into the Y-tunnus with its
// leading zero dropped, so 112038-9 is read as 0112038-9.
function fiParts(input) {
  const d = strictDigits(input)
  if (d === null) return null
  if (d.length === 7) return { body: '0' + d.slice(0, 6), check: Number(d[6]) }
  if (d.length === 8) return { body: d.slice(0, 7), check: Number(d[7]) }
  return null
}

// null when the mod-11 remainder is 1: no check digit exists for that body, so it is never issued.
function fiCheckDigit(body) {
  const r = FI_WEIGHTS.reduce((a, w, i) => a + w * Number(body[i]), 0) % 11
  return r === 1 ? null : r === 0 ? 0 : 11 - r
}

export function normaliseFiYtunnus(input) {
  const p = fiParts(input)
  return p ? `${p.body}-${p.check}` : null
}

export function validateFiYtunnus(input) {
  const p = fiParts(input)
  if (!p) {
    return bad(strictDigits(input) === null
      ? 'A Y-tunnus is digits only: 7 digits, a hyphen and a check digit.'
      : 'A Y-tunnus is 7 digits, a hyphen and a check digit (8 digits in all).')
  }
  const expected = fiCheckDigit(p.body)
  if (expected === null) return bad('Invalid: the mod-11 remainder is 1, so no check digit exists for this number and it is never issued.')
  if (expected !== p.check) return bad(`Check digit should be ${expected}, not ${p.check}.`)
  return {
    ok: true,
    checkDigit: 'ok',
    display: `${p.body}-${p.check}`,
    kind: 'Y-tunnus (business ID)',
    note: 'Issued by the Patent and Registration Office (PRH) with the Tax Administration to every registered Finnish business and organisation, sole traders included. Drop the hyphen and prefix FI for the VAT number.',
  }
}

// Sweden: organisationsnummer, 10 digits, Luhn, third digit 2 or higher.
function luhnCheckDigit(body) {
  let sum = 0
  for (let i = 0; i < body.length; i++) {
    // Double every second digit counting from the RIGHT of the body (the check digit goes after it).
    let d = Number(body[body.length - 1 - i])
    if (i % 2 === 0) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return (10 - (sum % 10)) % 10
}

// The 10 digits, after dropping the leading 16 of the 12-digit interchange form (a placeholder
// century, never a real one).
function seCore(input) {
  const d = strictDigits(input)
  if (d === null) return null
  if (d.length === 12 && d.startsWith('16')) return d.slice(2)
  return d.length === 10 ? d : null
}

export function normaliseSeOrgnr(input) {
  const c = seCore(input)
  return c && c[2] >= '2' ? `${c.slice(0, 6)}-${c.slice(6)}` : null
}

// True only for a Luhn-valid, plausibly dated personnummer: 10 digits, or 12 with a real
// 18/19/20 century, third digit 0 or 1 (the tens digit of a birth month). A samordningsnummer
// adds 60 to the day. It exists so a caller can say what a person's number is instead of
// calling it a bad company number.
export function looksLikePersonnummer(input) {
  const d = strictDigits(input)
  if (d === null) return false
  let core
  if (d.length === 12) {
    if (!['18', '19', '20'].includes(d.slice(0, 2))) return false
    core = d.slice(2)
  } else if (d.length === 10) {
    core = d
  } else {
    return false
  }
  if (core[2] !== '0' && core[2] !== '1') return false
  if (luhnCheckDigit(core.slice(0, 9)) !== Number(core[9])) return false
  const month = Number(core.slice(2, 4))
  const day = Number(core.slice(4, 6))
  if (month < 1 || month > 12) return false
  const limit = month === 2 ? 29 : [4, 6, 9, 11].includes(month) ? 30 : 31
  return (day >= 1 && day <= limit) || (day >= 61 && day <= 60 + limit)
}

export function validateSeOrgnr(input) {
  const c = seCore(input)
  if (!c) {
    return bad(strictDigits(input) === null
      ? 'A Swedish organisation number is digits only: 10 digits, written NNNNNN-NNNN.'
      : 'A Swedish organisation number is exactly 10 digits, written NNNNNN-NNNN (12 digits with a leading 16).')
  }
  if (c[2] < '2') {
    return bad(looksLikePersonnummer(input)
      ? 'This has the shape of a personal identity number (personnummer), which is not a company identifier. The third digit of an organisation number is 2 or higher.'
      : 'The third digit of an organisation number is 2 or higher. A lower one is the shape of a personal identity number, not a company.')
  }
  const expected = luhnCheckDigit(c.slice(0, 9))
  if (expected !== Number(c[9])) return bad(`Check digit should be ${expected}, not ${c[9]}.`)
  return {
    ok: true,
    checkDigit: 'ok',
    display: `${c.slice(0, 6)}-${c.slice(6)}`,
    kind: 'Organisationsnummer',
    note: 'Identifies a legal entity registered in Sweden. A sole trader is identified by their personal identity number instead, which this validator does not accept. The VAT number is SE, these 10 digits and 01.',
  }
}

// Belgium: enterprise number, 10 digits starting 0 or 1, last two = 97 - (first eight mod 97).
function beCore(input) {
  let d = strictDigits(input)
  if (d === null) return null
  if (d.length === 9) d = '0' + d    // a leading zero dropped, for instance by a spreadsheet
  return d.length === 10 && (d[0] === '0' || d[0] === '1') ? d : null
}

export function normaliseBeEnterprise(input) {
  const d = beCore(input)
  return d ? `${d[0]}${d.slice(1, 4)}.${d.slice(4, 7)}.${d.slice(7)}` : null
}

export function validateBeEnterprise(input) {
  const d = beCore(input)
  if (!d) {
    const s = strictDigits(input)
    if (s === null) return bad('A Belgian enterprise number is digits only: 10 digits, written 0NNN.NNN.NNN.')
    if (s.length === 10) return bad('A Belgian enterprise number starts with 0 or 1.')
    return bad('A Belgian enterprise number is exactly 10 digits, written 0NNN.NNN.NNN.')
  }
  const expected = 97 - (Number(d.slice(0, 8)) % 97)
  if (expected !== Number(d.slice(8))) {
    return bad(`Check digits should be ${String(expected).padStart(2, '0')}, not ${d.slice(8)}.`)
  }
  return {
    ok: true,
    checkDigit: 'ok',
    display: normaliseBeEnterprise(d),
    kind: 'Enterprise number (KBO/BCE)',
    note: 'Registered in the Crossroads Bank for Enterprises. The Belgian VAT number is BE plus these 10 digits, for an entity that is VAT-registered.',
  }
}

// Croatia: OIB (11 digits) and MBS (9 digits) both use ISO/IEC 7064 MOD 11,10, over the first 10
// and the first 8 digits. The OIB check is gating. The MBS check is advisory: the court register
// itself documents a few legacy numbers whose check digit was computed wrongly.
function iso7064Mod1110(body) {
  let t = 10
  for (const ch of body) {
    t = (Number(ch) + t) % 10
    if (t === 0) t = 10
    t = (t * 2) % 11
  }
  return (11 - t) % 10
}

export function validateHrOib(input) {
  const d = strictDigits(input)
  if (d === null) return bad('An OIB is digits only: exactly 11.')
  if (d.length !== 11) {
    return bad(d.length === 9
      ? 'An OIB is exactly 11 digits. Nine digits is the length of an MBS, the court-register number, which is a different identifier.'
      : 'An OIB is exactly 11 digits.')
  }
  const expected = iso7064Mod1110(d.slice(0, 10))
  if (expected !== Number(d[10])) return bad(`Check digit should be ${expected}, not ${d[10]}.`)
  return {
    ok: true,
    checkDigit: 'ok',
    display: d,
    kind: 'OIB (personal identification number)',
    note: 'Issued to companies and to individuals alike, so a valid OIB does not say which. It is not the court-register number (MBS). The Croatian VAT number is HR plus the OIB.',
  }
}

export function normaliseHrMbs(input) {
  const d = strictDigits(input)
  if (d === null) return null
  const m = d.length === 8 ? '0' + d : d    // a leading zero dropped
  return m.length === 9 ? m : null
}

export function validateHrMbs(input) {
  const m = normaliseHrMbs(input)
  if (!m) {
    const s = strictDigits(input)
    if (s === null) return bad('An MBS is digits only: 9 digits.')
    return bad(s.length === 11
      ? 'An MBS is 9 digits. Eleven digits is the length of an OIB, the tax identifier, which is a different number.'
      : 'An MBS is exactly 9 digits.')
  }
  const expected = iso7064Mod1110(m.slice(0, 8))
  if (expected === Number(m[8])) {
    return {
      ok: true,
      checkDigit: 'ok',
      display: m,
      kind: 'MBS (court register number)',
      note: 'The number a legal entity holds in the Croatian court register (matični broj subjekta). The OIB is a different number, the tax identifier.',
    }
  }
  return {
    ok: true,
    formatOnly: true,
    checkDigit: 'advisory_bad',
    display: m,
    kind: 'MBS (well-formed)',
    note: `The length is right, but the check digit should be ${expected}, not ${m[8]}. The court register itself documents a few legacy numbers with an incorrectly computed check digit, so this is a warning and not a rejection: it does not confirm the company exists.`,
  }
}

// Denmark: CVR, 8 digits, mod 11 with weights 2,7,6,5,4,3,2,1 over all eight (sum divisible by 11).
const DK_WEIGHTS = [2, 7, 6, 5, 4, 3, 2, 1]

export function normaliseDkCvr(input) {
  const d = strictDigits(input)
  return d && d.length === 8 ? d : null
}

export function validateDkCvr(input) {
  const d = normaliseDkCvr(input)
  if (!d) {
    return bad(strictDigits(input) === null
      ? 'A CVR number is digits only: exactly 8.'
      : 'A CVR number is exactly 8 digits.')
  }
  const sum = DK_WEIGHTS.reduce((a, w, i) => a + w * Number(d[i]), 0)
  if (sum % 11 === 0) {
    return {
      ok: true,
      checkDigit: 'ok',
      display: d,
      kind: 'CVR number',
      note: 'Issued by the Danish Business Authority (Erhvervsstyrelsen) in the Central Business Register. The Danish VAT number is DK plus these 8 digits.',
    }
  }
  return {
    ok: true,
    formatOnly: true,
    checkDigit: 'advisory_bad',
    display: d,
    kind: 'CVR number (well-formed)',
    note: 'The length is right, but the mod-11 check does not pass. It is a guide, not a rule: some genuine CVR numbers fail it, so this is a warning and not a rejection, and it does not confirm the company exists.',
  }
}

// Estonia: registrikood (e-Business Register), 8 digits, first digit 1, 7, 8 or 9. Check digit as in
// the Estonian personal code: s = (1*d1 + ... + 7*d7) mod 11; when s is 10 the weights 3..9 are used,
// and when that is 10 as well s is 0; the eighth digit must equal s. Gating: every code in the
// register of 2026-10-05 passes. The VAT number (KMKR) is a different number, never derived from it.
const EE_WEIGHTS_1 = [1, 2, 3, 4, 5, 6, 7]
const EE_WEIGHTS_2 = [3, 4, 5, 6, 7, 8, 9]

function eeCheckDigit(body) {
  const sum = (w) => w.reduce((a, wi, i) => a + wi * Number(body[i]), 0) % 11
  let s = sum(EE_WEIGHTS_1)
  if (s === 10) {
    s = sum(EE_WEIGHTS_2)
    if (s === 10) s = 0
  }
  return s
}

export function normaliseEeRegistryCode(input) {
  const d = strictDigits(input)
  return d && d.length === 8 && '1789'.includes(d[0]) ? d : null
}

export function validateEeRegistryCode(input) {
  const d = normaliseEeRegistryCode(input)
  if (!d) {
    const s = strictDigits(input)
    if (s === null) return bad('An Estonian registry code is digits only: exactly 8.')
    if (s.length === 8) return bad('An Estonian registry code starts with 1, 7, 8 or 9.')
    return bad('An Estonian registry code is exactly 8 digits.')
  }
  const expected = eeCheckDigit(d.slice(0, 7))
  if (expected !== Number(d[7])) return bad(`Check digit should be ${expected}, not ${d[7]}.`)
  return {
    ok: true,
    checkDigit: 'ok',
    display: d,
    kind: 'Registry code (registrikood)',
    note: 'The number a company, non-profit, foundation or public body holds in the Estonian e-Business Register. The VAT number (KMKR, EE plus 9 digits) is a separate number and cannot be derived from it.',
  }
}

// Slovakia: IČO, 8 digits with leading zeros (a 6 or 7 digit input is read with its zeros restored).
// Weights 8,7,6,5,4,3,2 over the first seven digits, r = 11 - (sum mod 11), 10 becomes 0 and 11
// becomes 1. ADVISORY: 99.97% of commercial IČO pass but about 1% of the other legal forms do not,
// so the shape is the gate and a mismatch is reported as 'advisory_bad', like the Danish CVR.
const SK_WEIGHTS = [8, 7, 6, 5, 4, 3, 2]

export function normaliseSkIco(input) {
  const d = strictDigits(input)
  return d && d.length >= 6 && d.length <= 8 ? d.padStart(8, '0') : null
}

export function validateSkIco(input) {
  const d = normaliseSkIco(input)
  if (!d) {
    return bad(strictDigits(input) === null
      ? 'An IČO is digits only: 8 digits. Text such as "Neuvedené" (not stated) is not an IČO.'
      : 'An IČO is 8 digits (6 or 7 digits are read with leading zeros restored).')
  }
  const r = 11 - (SK_WEIGHTS.reduce((a, w, i) => a + w * Number(d[i]), 0) % 11)
  const expected = r === 10 ? 0 : r === 11 ? 1 : r
  if (expected === Number(d[7])) {
    return {
      ok: true,
      checkDigit: 'ok',
      display: d,
      kind: 'IČO (identifikačné číslo organizácie)',
      note: 'Registered in the Slovak Register of Legal Entities (RPO). The VAT number (DIČ / IČ DPH) is a separate number and cannot be derived from it.',
    }
  }
  return {
    ok: true,
    formatOnly: true,
    checkDigit: 'advisory_bad',
    display: d,
    kind: 'IČO (well-formed)',
    note: `The length is right, but the check digit should be ${expected}, not ${d[7]}. It is a guide, not a rule: some genuine IČO fail it, so this is a warning and not a rejection, and it does not confirm the entity exists.`,
  }
}

// Switzerland: UID, written CHE + 9 digits (CHE-242.294.601 with separators, optionally followed by
// MWST, TVA, IVA, HR or VAT). Weights 5,4,3,2,7,6,5,4 over the first eight digits,
// k = 11 - (sum mod 11); 11 becomes 0 and 10 means no valid UID; the ninth digit must equal k.
// All zeros passes the arithmetic and is not a UID.
const CH_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4]

function chCore(input) {
  const t = String(input ?? '').trim().toUpperCase().replace(/[\s.\-]*(?:MWST|TVA|IVA|HR|VAT)$/, '')
  if (!t.startsWith('CHE')) return null
  const rest = t.slice(3).replace(/[\s.\-/]/g, '')
  return /^[0-9]{9}$/.test(rest) && rest !== '000000000' ? rest : null
}

export function normaliseChUid(input) {
  const c = chCore(input)
  return c ? `CHE${c}` : null
}

export function validateChUid(input) {
  const c = chCore(input)
  if (!c) {
    const t = String(input ?? '').trim().toUpperCase()
    if (!t.startsWith('CHE')) return bad('A Swiss UID starts with CHE, followed by 9 digits (CHE-123.456.789).')
    if (/^CHE[\s.\-]*0[0\s.\-]*$/.test(t.replace(/[\s.\-]*(?:MWST|TVA|IVA|HR|VAT)$/, ''))) return bad('An all-zero number is not a UID.')
    return bad('A Swiss UID is CHE followed by exactly 9 digits (CHE-123.456.789).')
  }
  let k = 11 - (CH_WEIGHTS.reduce((a, w, i) => a + w * Number(c[i]), 0) % 11)
  if (k === 11) k = 0
  if (k === 10) return bad('Invalid: the mod-11 check gives 10, so no valid UID has these first eight digits.')
  if (k !== Number(c[8])) return bad(`Check digit should be ${k}, not ${c[8]}.`)
  return {
    ok: true,
    checkDigit: 'ok',
    display: `CHE${c}`,
    kind: 'UID (Unternehmens-Identifikationsnummer)',
    note: 'Issued by the Federal Statistical Office to every enterprise in Switzerland. The Swiss VAT number is the UID followed by MWST, TVA or IVA.',
  }
}

// United States: '<state>-<register number>' (NY-4424185, CO-20091096973, CT-0292920, PA-0007065008, DE-10684990),
// 'CIK-<10 digits>' (an SEC filer known only to the SEC) or 'LEI-<20 characters>'. No check digit anywhere: the
// shape is the gate. A space, dot, colon or nothing may stand for the
// dash, case is free, and a CIK may lack its leading zeros.
const US_STATE_RE = /^([A-Za-z]{2})[\s\-.:]*([0-9A-Za-z][0-9A-Za-z\-./]{0,39})$/
const US_CIK_RE = /^CIK[\s\-.:]*(\d{1,10})$/i
const US_LEI_RE = /^LEI[\s\-.:]*([0-9A-Za-z]{20})$/i

export function normaliseUsNumber(input) {
  const t = String(input ?? '').trim()
  let m = US_CIK_RE.exec(t)
  if (m) return `CIK-${m[1].padStart(10, '0')}`
  m = US_LEI_RE.exec(t)
  if (m) return `LEI-${m[1].toUpperCase()}`
  m = US_STATE_RE.exec(t)
  if (m && !['CI', 'LE'].includes(m[1].toUpperCase())) return `${m[1].toUpperCase()}-${m[2]}`
  return null
}

export function validateUsNumber(input) {
  const display = normaliseUsNumber(input)
  if (!display) {
    return bad('A US company number is the state and the register number (NY-4424185), CIK- and up to 10 digits, or LEI- and 20 characters.')
  }
  return {
    ok: true,
    checkDigit: 'ok',
    formatOnly: true,
    display,
    kind: 'US company number (well-formed)',
    note: 'US registers publish no check digit, so this confirms the shape only. There is no US VAT number.',
  }
}

// The surface-id base is the register number's digits as an integer, the same rule for every
// country: 0417.497.106 -> 417497106, 0112038-9 -> 1120389, CHE242294601 -> 242294601. Every
// non-digit character is stripped (the Python port does the same); null when no digit is left.
export function rawId(companyNumber) {
  const d = String(companyNumber ?? '').replace(/[^0-9]/g, '')
  return d === '' ? null : Number(d)
}

// ── EU VAT: per-country structural rules ──────────────────────────────────────
// Format only. A structurally valid VAT number still has to be checked against VIES to know
// whether it is registered and active — VIES has no CORS header, so that check cannot run in
// a browser and belongs server-side.
const VAT_PATTERNS = {
  AT: /^U[0-9]{8}$/, BE: /^[01][0-9]{9}$/, BG: /^[0-9]{9,10}$/, CY: /^[0-9]{8}[A-Z]$/,
  CZ: /^[0-9]{8,10}$/, DE: /^[0-9]{9}$/, DK: /^[0-9]{8}$/, EE: /^[0-9]{9}$/,
  EL: /^[0-9]{9}$/, ES: /^[A-Z0-9][0-9]{7}[A-Z0-9]$/, FI: /^[0-9]{8}$/, FR: /^[A-Z0-9]{2}[0-9]{9}$/,
  HR: /^[0-9]{11}$/, HU: /^[0-9]{8}$/, IE: /^([0-9]{7}[A-Z]{1,2}|[0-9][A-Z][0-9]{5}[A-Z])$/,
  IT: /^[0-9]{11}$/, LT: /^([0-9]{9}|[0-9]{12})$/, LU: /^[0-9]{8}$/, LV: /^[0-9]{11}$/,
  MT: /^[0-9]{8}$/, NL: /^[0-9]{9}B[0-9]{2}$/, PL: /^[0-9]{10}$/, PT: /^[0-9]{9}$/,
  RO: /^[0-9]{2,10}$/, SE: /^[0-9]{10}01$/, SI: /^[0-9]{8}$/, SK: /^[0-9]{10}$/,
  XI: /^([0-9]{9}|[0-9]{12}|(GD|HA)[0-9]{3})$/,
}

export function validateEuVat(input) {
  const v = clean(input)
  const cc = v.slice(0, 2)
  const rest = v.slice(2)
  if (!VAT_PATTERNS[cc]) {
    return { ok: false, reason: `"${cc}" is not an EU VAT country prefix. Use the 2-letter code (Greece is EL, not GR; Northern Ireland is XI).` }
  }
  if (!VAT_PATTERNS[cc].test(rest)) {
    return { ok: false, reason: `Does not match the ${cc} VAT number structure.` }
  }
  // Where the national number is also a checksummed identifier, run that too.
  let deeper = null
  if (cc === 'ES') deeper = validateEsNif(rest)
  if (cc === 'PL') deeper = validatePlNip(rest)
  if (cc === 'FR' && /^[0-9]{9}$/.test(rest.slice(2))) deeper = validateFrSiren(rest.slice(2))
  if (cc === 'FI') deeper = validateFiYtunnus(rest)
  // A Swedish sole trader's VAT number is built on their personnummer, whose third digit is
  // below 2, so only the Luhn digit is checked here and never the organisation-number rule.
  if (cc === 'SE') deeper = luhnOk(rest.slice(0, 10)) ? { ok: true } : { ok: false, reason: 'Fails the Luhn check digit.' }
  if (cc === 'BE') deeper = validateBeEnterprise(rest)
  if (cc === 'HR') deeper = validateHrOib(rest)
  if (cc === 'DK') deeper = validateDkCvr(rest)
  if (deeper && !deeper.ok) {
    return { ok: false, reason: `Structure is right for ${cc}, but the national check digit fails: ${deeper.reason}` }
  }
  return {
    ok: true,
    kind: `EU VAT number (${cc}, well-formed)`,
    note: 'Structure is valid. Whether it is REGISTERED and active can only be confirmed against VIES, which requires a server-side call.'
      // The Danish mod-11 check is advisory: say so instead of failing a number that may be genuine.
      + (deeper?.checkDigit === 'advisory_bad' ? ' The Danish mod-11 check digit does not match; some genuine numbers fail it, so treat that as a warning.' : ''),
    formatOnly: true,
  }
}

// The registry's company_number recovered from an EU VAT number, or null. Croatia returns the
// OIB, not the MBS: the VAT number is built on the OIB, and an OIB cannot be turned into an MBS
// by arithmetic (different authorities assign them), so a caller that needs the MBS looks it up.
// Sweden accepts only the organisation-number form (10 digits + 01, third digit 2 or higher).
export function vatToCompanyNumber(cc, vat) {
  const code = String(cc).toUpperCase()
  // The Swiss VAT number is the UID itself (CHE-123.456.789 MWST). Estonia's KMKR, Slovakia and the United States's DIČ
  // are separate numbers, never derived from the registry code, so they fall through to null.
  if (code === 'CH') return normaliseChUid(vat)
  if (code === 'EE' || code === 'SK' || code === 'US') return null
  const v = clean(vat)
  if (!v.startsWith(code)) return null
  const rest = v.slice(code.length)
  if (!/^[0-9]+$/.test(rest)) return null
  if (code === 'FI') return rest.length === 8 ? normaliseFiYtunnus(rest) : null
  if (code === 'SE') return rest.length === 12 && rest.endsWith('01') ? normaliseSeOrgnr(rest.slice(0, 10)) : null
  if (code === 'BE') return rest.length === 10 ? normaliseBeEnterprise(rest) : null
  if (code === 'DK') return rest.length === 8 ? normaliseDkCvr(rest) : null
  if (code === 'HR') return rest.length === 11 ? rest : null
  return null
}

export const VALIDATORS = [
  { id: 'auto', label: 'Detect automatically' },
  { id: 'es-nif', label: 'Spain — NIF / CIF / NIE', fn: validateEsNif },
  { id: 'fr-siren', label: 'France — SIREN', fn: validateFrSiren },
  { id: 'fr-siret', label: 'France — SIRET', fn: validateFrSiret },
  { id: 'gb-company', label: 'United Kingdom — company number', fn: validateGbCompanyNumber },
  { id: 'ie-cro', label: 'Ireland — CRO number', fn: validateIeCro },
  { id: 'pl-nip', label: 'Poland — NIP', fn: validatePlNip },
  { id: 'pl-regon', label: 'Poland — REGON', fn: validatePlRegon },
  { id: 'no-orgnr', label: 'Norway — organisasjonsnummer', fn: validateNoOrgnr },
  { id: 'fi-ytunnus', label: 'Finland — Y-tunnus', fn: validateFiYtunnus },
  { id: 'se-orgnr', label: 'Sweden — organisationsnummer', fn: validateSeOrgnr },
  { id: 'be-enterprise', label: 'Belgium — enterprise number', fn: validateBeEnterprise },
  { id: 'hr-mbs', label: 'Croatia — MBS (court register)', fn: validateHrMbs },
  { id: 'hr-oib', label: 'Croatia — OIB', fn: validateHrOib },
  { id: 'dk-cvr', label: 'Denmark — CVR', fn: validateDkCvr },
  { id: 'ee-registry-code', label: 'Estonia — registry code (registrikood)', fn: validateEeRegistryCode },
  { id: 'sk-ico', label: 'Slovakia — IČO', fn: validateSkIco },
  { id: 'eu-vat', label: 'EU VAT number', fn: validateEuVat },
]

// Best-effort guess when the user does not pick a type. Ordered most- to least-specific so a
// value that can only be one thing is not mislabelled as something looser.
export function autoDetect(input) {
  const v = clean(input)
  const d = digits(input)
  const raw = String(input ?? '').trim()
  const tries = []
  // Three formats have a written shape of their own: a hyphen before the last digit (Y-tunnus),
  // six digits, a hyphen, four digits (organisationsnummer), and dotted triplets (Belgium). Try
  // that reading first, or a Y-tunnus is taken for a UK company number and 556012-5790 for a NIP.
  if (/^[0-9]{6,7}-[0-9]$/.test(raw)) tries.push(['fi-ytunnus', validateFiYtunnus])
  if (/^[0-9]{6}-[0-9]{4}$/.test(raw)) tries.push(['se-orgnr', validateSeOrgnr])
  if (/^[01][0-9]{3}[. ][0-9]{3}[. ][0-9]{3}$/.test(raw)) tries.push(['be-enterprise', validateBeEnterprise])
  if (/^[A-Z]{2}/.test(v) && VAT_PATTERNS[v.slice(0, 2)]) tries.push(['eu-vat', validateEuVat])
  if (/^[A-Z0-9]{9}$/.test(v) && /[A-Z]/.test(v)) tries.push(['es-nif', validateEsNif])
  if (d.length === 14) tries.push(['fr-siret', validateFrSiret], ['pl-regon', validatePlRegon])
  if (d.length === 9) tries.push(['no-orgnr', validateNoOrgnr], ['fr-siren', validateFrSiren], ['pl-regon', validatePlRegon], ['hr-mbs', validateHrMbs])
  if (d.length === 10) tries.push(['pl-nip', validatePlNip], ['se-orgnr', validateSeOrgnr], ['be-enterprise', validateBeEnterprise])
  if (d.length === 11) tries.push(['hr-oib', validateHrOib])
  if (d.length === 12 && d.startsWith('16')) tries.push(['se-orgnr', validateSeOrgnr])
  // A plain 8-digit number stays a UK company number: that rule accepts every 8 digits, so
  // ranking a checksummed Danish or Finnish rule above it would relabel about one in ten UK
  // numbers. Use the type list, a DK or FI prefix, or the hyphenated Y-tunnus for those.
  if (/^([0-9]{8}|[A-Z]{2}[0-9]{6})$/.test(v)) tries.push(['gb-company', validateGbCompanyNumber])
  if (d.length >= 4 && d.length <= 7) tries.push(['ie-cro', validateIeCro])
  for (const [id, fn] of tries) {
    const r = fn(input)
    // An advisory mismatch (HR MBS) is not evidence of a type: guessing needs a check digit that passed.
    if (r.ok && r.checkDigit !== 'advisory_bad') return { ...r, detectedAs: id }
  }
  return { ok: false, reason: 'No European identifier format matched. Pick a type above to see why.', detectedAs: null }
}

// ── LEI (ISO 17442): 20 characters, the last two are ISO 7064 MOD 97-10 check digits ──
export function validateLei(input) {
  const v = String(input ?? '').toUpperCase().replace(/[\s-]/g, '')
  if (!/^[0-9A-Z]{18}[0-9]{2}$/.test(v)) {
    return bad('A LEI is 20 characters: 18 letters or digits and 2 check digits.')
  }
  let n = ''
  for (const ch of v) n += parseInt(ch, 36)
  let r = 0
  for (const d of n) r = (r * 10 + Number(d)) % 97
  if (r !== 1) return bad('Fails the ISO 7064 MOD 97-10 check.')
  return {
    ok: true,
    checkDigit: 'ok',
    display: v,
    kind: 'LEI (ISO 17442)',
    note: 'Legal Entity Identifier. The check digits are valid; whether the LEI is issued and active is recorded by GLEIF.',
  }
}
