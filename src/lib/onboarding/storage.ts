// Which hints the learner has acknowledged, kept in localStorage.
//
// Per device rather than per account: the tour is a one-off nudge, not something
// worth a migration, and re-showing it once on a new browser is a far smaller
// cost than getting the storage wrong. Every read tolerates absent, unreadable
// and malformed values, because a broken preference must never take the app down.

const STORAGE_KEY = 'shadowing_onboarding'

export type OnboardingState = {
  dismissed: string[]
  skipped: boolean
}

export const EMPTY_ONBOARDING_STATE: OnboardingState = { dismissed: [], skipped: false }

export function parseOnboardingState(raw: string | null): OnboardingState {
  if (!raw) return EMPTY_ONBOARDING_STATE
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return EMPTY_ONBOARDING_STATE
    const value = parsed as Record<string, unknown>
    return {
      dismissed: Array.isArray(value.dismissed)
        ? value.dismissed.filter((entry): entry is string => typeof entry === 'string')
        : [],
      skipped: value.skipped === true,
    }
  } catch {
    return EMPTY_ONBOARDING_STATE
  }
}

export function readOnboardingState(): OnboardingState {
  if (typeof window === 'undefined') return EMPTY_ONBOARDING_STATE
  try {
    return parseOnboardingState(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    // Private browsing and blocked storage both throw on access.
    return EMPTY_ONBOARDING_STATE
  }
}

export function writeOnboardingState(state: OnboardingState): void {
  snapshot = state
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Out of quota or storage disabled — the tour just reappears next visit.
    }
  }
  for (const listener of listeners) listener()
}

// Exposed as an external store so components read it through
// `useSyncExternalStore` instead of copying it into state from an effect. The
// snapshot is cached because that hook demands a referentially stable value —
// re-parsing on every call would loop forever.
let snapshot: OnboardingState | null = null
const listeners = new Set<() => void>()

export function subscribeToOnboardingState(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getOnboardingSnapshot(): OnboardingState {
  snapshot ??= readOnboardingState()
  return snapshot
}

// The server has no localStorage, so it always renders as though nothing has been
// seen; the client's first paint then reconciles to the real value.
export function getOnboardingServerSnapshot(): OnboardingState {
  return EMPTY_ONBOARDING_STATE
}
