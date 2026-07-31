import { redirect } from 'next/navigation'
import { isWizardEnabled } from '@/lib/features'

/** Class 2 destination Wizard replaced by floating chatbot (WIZ-3). */
export default function WizardRedirectPage() {
  if (!isWizardEnabled()) redirect('/overview')
  redirect('/overview?wizard=1')
}
