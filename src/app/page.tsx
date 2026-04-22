export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'

import { getCurrentAppUser } from '@/lib/auth'

export default async function HomePage() {
  const currentUser = await getCurrentAppUser()

  redirect(currentUser ? '/projects' : '/login')
}
