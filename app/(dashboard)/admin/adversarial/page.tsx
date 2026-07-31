import { notFound } from 'next/navigation'
import { AdversarialClient } from './AdversarialClient'
import { isAdversarialEnabled } from '@/lib/features'

export default function AdversarialPage() {
  if (!isAdversarialEnabled()) notFound()
  return <AdversarialClient />
}
