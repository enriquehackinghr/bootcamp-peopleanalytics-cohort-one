import { redirect } from 'next/navigation'

/** Class 2 destination Wizard replaced by floating chatbot (WIZ-3). */
export default function WizardRedirectPage() {
  redirect('/overview?wizard=1')
}
