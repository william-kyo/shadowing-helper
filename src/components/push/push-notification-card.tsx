'use client'

import { useCallback, useEffect, useState } from 'react'

import { useT } from '@/lib/i18n/client'

// Decode a base64url VAPID public key into the byte array PushManager expects.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

type PushState =
  | 'loading'
  // Push API unavailable, but this looks like iOS Safari outside a home-screen
  // install — show install guidance instead of hiding the card.
  | 'ios-needs-install'
  | 'unsupported'
  | 'denied'
  | 'subscribed'
  | 'unsubscribed'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

// Detect push support, register the service worker, and resolve the initial
// card state. Kept outside the component so the mount effect only mirrors the
// async result into state.
async function detectPushState(): Promise<PushState> {
  if (!VAPID_PUBLIC_KEY) return 'unsupported'
  const supported =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (!supported) {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    return isIOS && !isStandalone ? 'ios-needs-install' : 'unsupported'
  }
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    })
    const sub = await registration.pushManager.getSubscription()
    if (sub) return 'subscribed'
    return Notification.permission === 'denied' ? 'denied' : 'unsubscribed'
  } catch {
    return 'unsupported'
  }
}

export function PushNotificationCard() {
  const t = useT()
  const [state, setState] = useState<PushState>('loading')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    detectPushState().then((next) => {
      if (!cancelled) setState(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const subscribe = useCallback(async () => {
    if (!VAPID_PUBLIC_KEY || pending) return
    setPending(true)
    setError(null)
    try {
      const registration = await navigator.serviceWorker.ready
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      })
      const body = sub.toJSON()
      const res = await fetch('/api/push/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: body.endpoint, keys: body.keys }),
      })
      if (!res.ok) {
        await sub.unsubscribe().catch(() => {})
        throw new Error(t.push.subscribeFailed)
      }
      setState('subscribed')
    } catch (err) {
      if (Notification.permission === 'denied') {
        setState('denied')
      } else {
        setError(err instanceof Error ? err.message : t.push.subscribeFailed)
      }
    } finally {
      setPending(false)
    }
  }, [pending, t])

  const unsubscribe = useCallback(async () => {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      const registration = await navigator.serviceWorker.ready
      const sub = await registration.pushManager.getSubscription()
      if (sub) {
        const endpoint = sub.endpoint
        await sub.unsubscribe()
        await fetch('/api/push/subscription', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        }).catch(() => {})
      }
      setState('unsubscribed')
    } catch {
      setError(t.push.unsubscribeFailed)
    } finally {
      setPending(false)
    }
  }, [pending, t])

  // Hide entirely where push can never work (old browsers, missing config).
  if (state === 'loading' || state === 'unsupported') return null

  return (
    <section
      aria-label={t.push.ariaLabel}
      className="grid gap-3 rounded-card border border-ink-line bg-paper p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted">
          {t.push.title}
        </h2>
        {state === 'subscribed' ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">ON</span>
        ) : null}
      </div>

      {state === 'ios-needs-install' ? (
        <p className="text-sm leading-relaxed text-ink-muted">
          {t.push.iosHint}
        </p>
      ) : state === 'denied' ? (
        <p className="text-sm leading-relaxed text-ink-muted">
          {t.push.blocked}
        </p>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm leading-relaxed text-ink-muted">
            {state === 'subscribed'
              ? t.push.subscribedBody
              : t.push.unsubscribedBody}
          </p>
          <button
            type="button"
            onClick={state === 'subscribed' ? unsubscribe : subscribe}
            disabled={pending}
            className="shrink-0 rounded-chip border border-ink-line bg-paper px-4 py-2 text-sm font-medium text-ink transition hover:border-ink hover:bg-ink hover:text-paper disabled:opacity-50"
          >
            {pending
              ? t.common.processing
              : state === 'subscribed'
                ? t.push.unsubscribe
                : t.push.subscribe}
          </button>
        </div>
      )}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </section>
  )
}
