/**
 * Student showcase freeze — open read-only analytics for cohort participants.
 * Set NEXT_PUBLIC_STUDENT_SHOWCASE=false (and STUDENT_SHOWCASE=false) to restore
 * full Class 5 tooling (auth, Wizard, adversarial, upload).
 */

function envFlag(name: string): string | undefined {
  return process.env[name]
}

/** Default ON so the deployed student build needs no extra env. */
export function isStudentShowcase(): boolean {
  const publicFlag = envFlag('NEXT_PUBLIC_STUDENT_SHOWCASE')
  const serverFlag = envFlag('STUDENT_SHOWCASE')
  const raw = publicFlag ?? serverFlag
  if (raw === undefined || raw === '') return true
  return raw !== 'false' && raw !== '0'
}

export function isWizardEnabled(): boolean {
  return !isStudentShowcase()
}

export function isWizardEvalEnabled(): boolean {
  return !isStudentShowcase()
}

export function isAdversarialEnabled(): boolean {
  return !isStudentShowcase()
}

export function isDataUploadEnabled(): boolean {
  return !isStudentShowcase()
}

export function isAuthRequired(): boolean {
  return !isStudentShowcase()
}

/** Guest identity for open showcase (executive = company-wide analytics, not admin). */
export const SHOWCASE_GUEST = {
  workEmail: 'sarah.lin@meridiananalytics.com',
  fallback: {
    employeeId: 'E10002',
    workEmail: 'sarah.lin@meridiananalytics.com',
    fullName: 'Sarah Lin',
    appRole: 'executive' as const,
  },
}

export function featureDisabledResponse(feature: string) {
  return {
    error: `${feature} is disabled in the student showcase build.`,
    code: 'feature_disabled',
  }
}
