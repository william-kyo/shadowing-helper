// Which microphone stage 4 records from.
//
// `getUserMedia({ audio: true })` accepts whatever input the browser considers
// default, and on macOS that is routinely the learner's iPhone: Continuity
// publishes the phone as an audio input, macOS often makes it the system
// default, and Chrome then pins that choice per origin — so the first take of
// every session wakes the phone instead of using the mic sitting in front of
// the learner (installed PWA included, since it shares the browser profile).
//
// The rule here is deliberately narrow: only when a Continuity input shows up
// on a Mac do we name a device ourselves, preferring the 'default' entry when
// that is a local mic (it keeps following headsets as they are plugged in) and
// otherwise the first local device. Phones, Windows, Linux, and Macs with no
// iPhone nearby keep the browser's own pick and the original single-call
// getUserMedia path.

type MicrophoneSource = Pick<MediaDevices, 'getUserMedia' | 'enumerateDevices'>

export type AudioInput = Pick<MediaDeviceInfo, 'deviceId' | 'kind' | 'label'>

const CONTINUITY_LABEL = /\b(iphone|ipad|ipod)\b|continuity/i

export function isContinuityMicrophone(label: string): boolean {
  return CONTINUITY_LABEL.test(label)
}

// Continuity is a macOS feature, so nothing below applies anywhere else.
// iPadOS reports a Mac user agent and iOS says "like Mac OS X", hence the
// explicit device tokens and the touch-point check.
export function hasContinuityRisk(nav: { userAgent: string; maxTouchPoints?: number }): boolean {
  if (/iPhone|iPad|iPod/.test(nav.userAgent)) return false
  if (!/Mac/.test(nav.userAgent)) return false
  return (nav.maxTouchPoints ?? 0) <= 1
}

function rank(device: AudioInput): number {
  if (device.deviceId === 'default') return 0
  // Windows-only alias, kept as a last resort behind the real device ids.
  if (device.deviceId === 'communications') return 2
  return 1
}

// The deviceId to request explicitly, or null to leave the choice to the
// browser. Labels stay empty until the origin has been granted mic access
// once, and an unlabelled list says nothing about which device is which.
export function preferredMicrophoneId(devices: readonly AudioInput[]): string | null {
  const inputs = devices.filter((device) => device.kind === 'audioinput' && device.label !== '')
  if (!inputs.some((device) => isContinuityMicrophone(device.label))) return null
  const local = inputs.filter((device) => !isContinuityMicrophone(device.label))
  return [...local].sort((a, b) => rank(a) - rank(b))[0]?.deviceId ?? null
}

async function listDevices(source: MicrophoneSource): Promise<AudioInput[]> {
  if (typeof source.enumerateDevices !== 'function') return []
  try {
    return await source.enumerateDevices()
  } catch {
    return []
  }
}

function isDeviceGone(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const name = (err as { name?: string }).name
  return name === 'OverconstrainedError' || name === 'NotFoundError'
}

// Opens a mic stream, steering around Continuity inputs. `avoidContinuity`
// false keeps the historical behaviour exactly: one getUserMedia call with no
// awaits in front of it, which is what iOS Safari's user-activation rules need.
export async function openMicrophoneStream(
  source: MicrophoneSource,
  { avoidContinuity = true }: { avoidContinuity?: boolean } = {},
): Promise<MediaStream> {
  if (!avoidContinuity) return source.getUserMedia({ audio: true })

  const preferredId = preferredMicrophoneId(await listDevices(source))
  if (preferredId) {
    try {
      return await source.getUserMedia({ audio: { deviceId: { exact: preferredId } } })
    } catch (err) {
      // Unplugged between enumerating and opening; let the browser choose.
      if (!isDeviceGone(err)) throw err
    }
  }

  const stream = await source.getUserMedia({ audio: true })
  // On the first-ever grant the labels above were still hidden, so this is the
  // first chance to notice the browser handed us the phone.
  const track = stream.getAudioTracks()[0]
  if (!track || !isContinuityMicrophone(track.label)) return stream
  const replacementId = preferredMicrophoneId(await listDevices(source))
  if (!replacementId) return stream
  try {
    const replacement = await source.getUserMedia({ audio: { deviceId: { exact: replacementId } } })
    stream.getTracks().forEach((existing) => existing.stop())
    return replacement
  } catch {
    // Better the phone than no microphone at all.
    return stream
  }
}
