import { notFound } from 'next/navigation'
import { AdminUploadClient } from './AdminUploadClient'
import { isDataUploadEnabled } from '@/lib/features'

export default function AdminUploadPage() {
  if (!isDataUploadEnabled()) notFound()
  return <AdminUploadClient />
}
