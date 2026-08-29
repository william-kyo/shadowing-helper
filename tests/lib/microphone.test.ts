// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import {
  hasContinuityRisk,
  isContinuityMicrophone,
  openMicrophoneStream,
  preferredMicrophoneId,
  type AudioInput,
} from '@/lib/microphone'

function input(deviceId: string, label: string): AudioInput {
  return { deviceId, kind: 'audioinput', label }
}

function fakeTrack(label: string) {
  return { label, stop: vi.fn() }
}

function fakeStream(label: string) {
  const track = fakeTrack(label)
  return {
    track,
    stream: {
      getAudioTracks: () => [track],
      getTracks: () => [track],
    } as unknown as MediaStream,
  }
}

// Minimal stand-in for navigator.mediaDevices: `getUserMedia` answers from a
// map keyed by the requested deviceId ('' meaning `audio: true`).
function fakeSource(devices: AudioInput[], streams: Record<string, MediaStream | Error>) {
  const requested: string[] = []
  const source = {
    enumerateDevices: vi.fn(async () => devices as MediaDeviceInfo[]),
    getUserMedia: vi.fn(async (constraints: MediaStreamConstraints) => {
      const audio = constraints.audio
      const id =
        typeof audio === 'object' && audio.deviceId && typeof audio.deviceId === 'object'
          ? ((audio.deviceId as { exact: string }).exact ?? '')
          : ''
      requested.push(id)
      const answer = streams[id]
      if (!answer) throw Object.assign(new Error('no device'), { name: 'NotFoundError' })
      if (answer instanceof Error) throw answer
      return answer
    }),
  }
  return { source, requested }
}

describe('isContinuityMicrophone', () => {
  it('spots iPhone and iPad inputs, including localized labels', () => {
    expect(isContinuityMicrophone('iPhone Microphone')).toBe(true)
    expect(isContinuityMicrophone("Mingwei's iPhone 麦克风")).toBe(true)
    // As macOS actually names it: the owner's name runs straight into "iPhone".
    expect(isContinuityMicrophone('ホイウィリアムのiPhone Microphone')).toBe(true)
    expect(isContinuityMicrophone('Default - iPhone Microphone')).toBe(true)
    expect(isContinuityMicrophone('iPad マイク')).toBe(true)
    expect(isContinuityMicrophone('Continuity Camera Microphone')).toBe(true)
  })

  it('leaves local microphones alone', () => {
    expect(isContinuityMicrophone('MacBook Pro Microphone')).toBe(false)
    expect(isContinuityMicrophone('Default - MacBook Pro マイク')).toBe(false)
    expect(isContinuityMicrophone('AirPods Pro')).toBe(false)
    expect(isContinuityMicrophone('Yeti Stereo Microphone')).toBe(false)
  })
})

describe('hasContinuityRisk', () => {
  it('is true only for desktop macOS', () => {
    expect(hasContinuityRisk({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 })).toBe(
      true,
    )
    // iPadOS reports a Mac user agent; touch points give it away.
    expect(hasContinuityRisk({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 })).toBe(
      false,
    )
    expect(hasContinuityRisk({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' })).toBe(false)
    expect(hasContinuityRisk({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' })).toBe(false)
  })
})

describe('preferredMicrophoneId', () => {
  it('leaves the choice to the browser when no Continuity input is listed', () => {
    expect(
      preferredMicrophoneId([input('default', 'Default - MacBook Pro Microphone'), input('abc', 'AirPods Pro')]),
    ).toBeNull()
  })

  it('leaves the choice to the browser while labels are still hidden', () => {
    expect(preferredMicrophoneId([input('default', ''), input('abc', '')])).toBeNull()
  })

  it('prefers the system default when that is a local mic', () => {
    expect(
      preferredMicrophoneId([
        input('default', 'Default - AirPods Pro'),
        input('abc', 'AirPods Pro'),
        input('phone', 'iPhone Microphone'),
      ]),
    ).toBe('default')
  })

  it('falls back to a real local device when the system default is the phone', () => {
    expect(
      preferredMicrophoneId([
        input('default', 'Default - iPhone Microphone'),
        input('phone', 'iPhone Microphone'),
        input('builtin', 'MacBook Pro Microphone'),
      ]),
    ).toBe('builtin')
  })

  it('keeps the Windows communications alias as a last resort', () => {
    expect(
      preferredMicrophoneId([
        input('communications', 'Communications - Headset'),
        input('phone', 'iPhone Microphone'),
        input('headset', 'Headset Microphone'),
      ]),
    ).toBe('headset')
  })

  it('gives up when every input is a Continuity device', () => {
    expect(
      preferredMicrophoneId([input('default', 'Default - iPhone Microphone'), input('phone', 'iPhone Microphone')]),
    ).toBeNull()
  })

  it('ignores outputs', () => {
    expect(
      preferredMicrophoneId([
        { deviceId: 'spk', kind: 'audiooutput', label: 'iPhone Speaker' },
        input('default', 'Default - MacBook Pro Microphone'),
      ]),
    ).toBeNull()
  })
})

describe('openMicrophoneStream', () => {
  it('asks for the local mic when a Continuity input is listed', async () => {
    const { stream } = fakeStream('MacBook Pro Microphone')
    const { source, requested } = fakeSource(
      [input('default', 'Default - iPhone Microphone'), input('builtin', 'MacBook Pro Microphone')],
      { builtin: stream },
    )

    await expect(openMicrophoneStream(source)).resolves.toBe(stream)
    expect(requested).toEqual(['builtin'])
  })

  it('swaps away from the phone after the first permission grant', async () => {
    // Labels are hidden until access is granted, so the first call gets the
    // browser's pick — the phone — and only then can the list be read.
    const phone = fakeStream('iPhone Microphone')
    const local = fakeStream('MacBook Pro Microphone')
    const { source, requested } = fakeSource(
      [input('default', 'Default - iPhone Microphone'), input('builtin', 'MacBook Pro Microphone')],
      { '': phone.stream, builtin: local.stream },
    )
    source.enumerateDevices.mockImplementationOnce(
      async () => [input('default', ''), input('builtin', '')] as MediaDeviceInfo[],
    )

    await expect(openMicrophoneStream(source)).resolves.toBe(local.stream)
    expect(requested).toEqual(['', 'builtin'])
    expect(phone.track.stop).toHaveBeenCalled()
  })

  it('keeps the browser pick when it is already a local mic', async () => {
    const { stream } = fakeStream('MacBook Pro Microphone')
    const { source, requested } = fakeSource([input('default', ''), input('builtin', '')], { '': stream })

    await expect(openMicrophoneStream(source)).resolves.toBe(stream)
    expect(requested).toEqual([''])
  })

  it('falls back to the browser pick when the chosen device has vanished', async () => {
    const { stream } = fakeStream('AirPods Pro')
    const { source, requested } = fakeSource(
      [input('default', 'Default - iPhone Microphone'), input('builtin', 'MacBook Pro Microphone')],
      { '': stream },
    )

    await expect(openMicrophoneStream(source)).resolves.toBe(stream)
    expect(requested).toEqual(['builtin', ''])
  })

  it('propagates a denied permission instead of retrying', async () => {
    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' })
    const { source, requested } = fakeSource(
      [input('default', 'Default - iPhone Microphone'), input('builtin', 'MacBook Pro Microphone')],
      { builtin: denied },
    )

    await expect(openMicrophoneStream(source)).rejects.toBe(denied)
    expect(requested).toEqual(['builtin'])
  })

  it('keeps the phone rather than nothing when the swap fails', async () => {
    const phone = fakeStream('iPhone Microphone')
    const { source } = fakeSource(
      [input('default', 'Default - iPhone Microphone'), input('builtin', 'MacBook Pro Microphone')],
      { '': phone.stream },
    )
    // Enumeration is only readable after the grant, so the first pick is skipped.
    source.enumerateDevices
      .mockImplementationOnce(async () => [input('default', ''), input('builtin', '')] as MediaDeviceInfo[])

    await expect(openMicrophoneStream(source)).resolves.toBe(phone.stream)
    expect(phone.track.stop).not.toHaveBeenCalled()
  })

  it('makes a single plain request when Continuity cannot apply', async () => {
    const { stream } = fakeStream('iPhone Microphone')
    const { source, requested } = fakeSource([], { '': stream })

    await expect(openMicrophoneStream(source, { avoidContinuity: false })).resolves.toBe(stream)
    expect(requested).toEqual([''])
    expect(source.enumerateDevices).not.toHaveBeenCalled()
  })
})
