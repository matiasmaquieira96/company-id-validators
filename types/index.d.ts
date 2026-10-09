export type CheckDigitStatus = 'ok' | 'bad' | 'advisory_bad'

export interface ValidationResult {
  ok: boolean
  /** Why the input was rejected (only when ok is false). */
  reason?: string
  /** What the identifier is (only when ok is true). */
  kind?: string
  note?: string | null
  /** Present on the newer validators (FI, SE, BE, HR, DK, EE, SK, CH, US, LEI). */
  checkDigit?: CheckDigitStatus
  /** The canonical written form of the number. */
  display?: string
  /** True when only the format was checked (GB, IE, US, EU VAT) or the check digit is advisory. */
  formatOnly?: boolean
  /** GB only: the two-letter prefix is not one we recognise (accepted, but flagged). */
  unknownPrefix?: boolean
}

export interface AutoDetectResult extends ValidationResult {
  detectedAs: string | null
}

export type Validator = (input: string) => ValidationResult
export type Normaliser = (input: string) => string | null

export const validateEsNif: Validator
export const validateFrSiren: Validator
export const validateFrSiret: Validator
export const validatePlNip: Validator
export const validatePlRegon: Validator
export const validateNoOrgnr: Validator
export const validateGbCompanyNumber: Validator
export const validateIeCro: Validator
export const validateFiYtunnus: Validator
export const validateSeOrgnr: Validator
export const validateBeEnterprise: Validator
export const validateHrOib: Validator
export const validateHrMbs: Validator
export const validateDkCvr: Validator
export const validateEeRegistryCode: Validator
export const validateSkIco: Validator
export const validateChUid: Validator
export const validateUsNumber: Validator
export const validateLei: Validator
export const validateEuVat: Validator

export const normaliseFiYtunnus: Normaliser
export const normaliseSeOrgnr: Normaliser
export const normaliseBeEnterprise: Normaliser
export const normaliseHrMbs: Normaliser
export const normaliseDkCvr: Normaliser
export const normaliseEeRegistryCode: Normaliser
export const normaliseSkIco: Normaliser
export const normaliseChUid: Normaliser
export const normaliseUsNumber: Normaliser

/** True for a valid-looking Swedish personal identity number (which is not a company number). */
export function looksLikePersonnummer(input: string): boolean
/** The register number's digits as an integer, or null when it has none. */
export function rawId(companyNumber: string): number | null
/** The registry company number inside an EU VAT number, or null when none can be derived. */
export function vatToCompanyNumber(countryCode: string, vat: string): string | null
/** Guess the identifier type from the input alone. */
export function autoDetect(input: string): AutoDetectResult

export interface ValidatorEntry {
  id: string
  label: string
  fn?: Validator
}
export const VALIDATORS: ValidatorEntry[]
