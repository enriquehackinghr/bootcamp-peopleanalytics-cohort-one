import { notFound } from 'next/navigation'
import { WizardEvalClient } from '@/components/shell/WizardEvalClient'
import { isWizardEvalEnabled } from '@/lib/features'

export default function WizardEvalPage() {
  if (!isWizardEvalEnabled()) notFound()
  return <WizardEvalClient />
}
