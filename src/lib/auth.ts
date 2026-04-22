import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'

import { db } from '@/lib/db'
import { createSupabaseServerClient } from '@/lib/supabase/server'

async function getAuthenticatedSupabaseUser() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user?.email) {
    return null
  }

  return user
}

export async function getCurrentAppUser() {
  const supabaseUser = await getAuthenticatedSupabaseUser()
  if (!supabaseUser?.email) {
    return null
  }

  const appUser = await db.user.upsert({
    where: { supabaseUserId: supabaseUser.id },
    update: { email: supabaseUser.email },
    create: {
      supabaseUserId: supabaseUser.id,
      email: supabaseUser.email,
    },
    select: {
      id: true,
      supabaseUserId: true,
      email: true,
    },
  })

  return appUser
}

export async function requireAppUser() {
  const user = await getCurrentAppUser()
  if (!user) {
    redirect('/login')
  }

  return user
}

export async function requireAppUserForApi() {
  const user = await getCurrentAppUser()
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: 'ログインしてください。' }, { status: 401 }),
    }
  }

  return {
    user,
    response: null,
  }
}
