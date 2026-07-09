import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Stage4Panel } from '@/components/segment/stage-4-panel'

type MediaRecorderEvent = { data?: Blob; error?: Error }
type MediaRecorderListener = (event: MediaRecorderEvent) => void

// The hook drives the recorder through addEventListener (not the onX callback
// props), so the stub mirrors that contract.
class FakeMediaRecorder {
  static isTypeSupported = vi.fn().mockReturnValue(true)
  state: 'inactive' | 'recording' = 'inactive'
  mimeType = 'audio/webm'
  private listeners = new Map<string, Set<MediaRecorderListener>>()

  constructor(public stream: MediaStream) {}

  addEventListener(type: string, handler: MediaRecorderListener) {
    const set = this.listeners.get(type) ?? new Set<MediaRecorderListener>()
    set.add(handler)
    this.listeners.set(type, set)
  }

  removeEventListener(type: string, handler: MediaRecorderListener) {
    this.listeners.get(type)?.delete(handler)
  }

  private emit(type: string, event: MediaRecorderEvent) {
    this.listeners.get(type)?.forEach((handler) => handler(event))
  }

  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.emit('dataavailable', { data: new Blob(['fake-bytes'], { type: 'audio/webm' }) })
    this.emit('stop', {})
  }
}

function installMediaRecorderStub() {
  ;(globalThis as { MediaRecorder?: unknown }).MediaRecorder = FakeMediaRecorder
  if (!navigator.mediaDevices) {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn() },
      configurable: true,
    })
  }
  const getUserMedia = vi.fn().mockResolvedValue({
    getTracks: () => [{ stop: vi.fn() }],
  } as unknown as MediaStream)
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  })
  return getUserMedia
}

function removeMediaRecorderStub() {
  delete (globalThis as { MediaRecorder?: unknown }).MediaRecorder
}

const SENTENCES = [
  { index: 0, text: 'こんにちは', startMs: 0, endMs: 1500, refAudioUrl: '/api/segments/seg-1/stage4/sentences/0/audio', userRecordingUrl: null },
  { index: 1, text: 'さようなら', startMs: 1500, endMs: 3000, refAudioUrl: '/api/segments/seg-1/stage4/sentences/1/audio', userRecordingUrl: null },
]

beforeEach(() => {
  installMediaRecorderStub()
  // Audio elements in jsdom don't actually play; override .play to resolve.
  window.HTMLMediaElement.prototype.play = function play() {
    return Promise.resolve()
  } as typeof HTMLMediaElement.prototype.play
})

// Fire the `ended` event on the panel's <audio> element. In real browsers
// this happens after the clip finishes; in jsdom we have to drive it.
function fireRefAudioEnded() {
  const audio = document.querySelector('audio')
  if (audio) {
    fireEvent.ended(audio)
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  removeMediaRecorderStub()
})

describe('Stage4Panel', () => {
  it('renders the first sentence and progress dot count', () => {
    render(
      <Stage4Panel
        segmentId="seg-1"
        sentences={SENTENCES}
        initialMetadata={null}
        isStatusUpdating={false}
        onComplete={vi.fn()}
      />,
    )
    expect(screen.getByText('こんにちは')).toBeInTheDocument()
    expect(screen.getByText('文 1 / 2')).toBeInTheDocument()
  })

  it('shows a helpful empty state when no sentences are available', () => {
    render(
      <Stage4Panel
        segmentId="seg-1"
        sentences={[]}
        initialMetadata={null}
        isStatusUpdating={false}
        onComplete={vi.fn()}
      />,
    )
    expect(screen.getByText(/このセグメントには文が見つかりませんでした/)).toBeInTheDocument()
  })

  it('shows decoupled お手本 / 録音開始 buttons for a sentence with no take', () => {
    render(
      <Stage4Panel
        segmentId="seg-1"
        sentences={SENTENCES}
        initialMetadata={null}
        isStatusUpdating={false}
        onComplete={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: '🔊 お手本' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '🎤 録音開始' })).toBeInTheDocument()
  })

  it('plays the reference on お手本 without chaining into recording', () => {
    const playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play')
    render(
      <Stage4Panel
        segmentId="seg-1"
        sentences={SENTENCES}
        initialMetadata={null}
        isStatusUpdating={false}
        onComplete={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '🔊 お手本' }))
    expect(playSpy).toHaveBeenCalledTimes(1)

    // Even when the clip finishes, listening never auto-starts the recorder.
    fireRefAudioEnded()
    expect(screen.queryByRole('button', { name: /^⏹ 停止/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '🎤 録音開始' })).toBeInTheDocument()
  })

  it('starts recording immediately on 録音開始, without playing the reference', async () => {
    const playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play')
    const getUserMedia = installMediaRecorderStub()
    render(
      <Stage4Panel
        segmentId="seg-1"
        sentences={SENTENCES}
        initialMetadata={null}
        isStatusUpdating={false}
        onComplete={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '🎤 録音開始' }))

    // Mic permission is requested inside the tap, then recording starts as
    // soon as the stream is live — no reference playback in between.
    await waitFor(() => screen.getByRole('button', { name: /^⏹ 停止/ }))
    expect(getUserMedia).toHaveBeenCalled()
    expect(playSpy).not.toHaveBeenCalled()
  })

  it('uploads a recording and shows the score on a perfect transcript', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          recordingId: 'rec-1',
          score: 1,
          pass: true,
          transcript: 'こんにちは',
          expected: 'こんにちは',
          distance: 0,
          expectedLength: 5,
          actualLength: 5,
          threshold: 0.8,
          stageComplete: false,
          passingSentences: 1,
          totalSentences: 2,
        }),
      } as Response)

    render(
      <Stage4Panel
        segmentId="seg-1"
        sentences={SENTENCES}
        initialMetadata={null}
        isStatusUpdating={false}
        onComplete={vi.fn()}
      />,
    )

    // No take yet, so recording starts directly from 録音開始 (permission is
    // granted inside the tap; the recorder starts once the stream is live).
    fireEvent.click(screen.getByRole('button', { name: '🎤 録音開始' }))
    await waitFor(() => screen.getByRole('button', { name: /^⏹ 停止/ }))

    fireEvent.click(screen.getByRole('button', { name: /^⏹ 停止/ }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/segments/seg-1/stage4/recordings',
        expect.objectContaining({ method: 'POST' }),
      )
    })

    // The result badge ("✓ 合格 100%") is distinct from the per-sentence
    // summary ("✓ 合格済み"); match the full badge text to stay unambiguous.
    expect(await screen.findByText(/✓ 合格 100%/)).toBeInTheDocument()
    expect(await screen.findByText(/次の文へ/)).toBeInTheDocument()
  })

  it('stays on the result after a pass and only advances when the learner taps 次の文へ', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        recordingId: 'rec-1',
        score: 1,
        pass: true,
        transcript: 'こんにちは',
        expected: 'こんにちは',
        distance: 0,
        expectedLength: 5,
        actualLength: 5,
        threshold: 0.8,
        stageComplete: false,
        passingSentences: 1,
        totalSentences: 2,
      }),
    } as Response)

    render(
      <Stage4Panel
        segmentId="seg-1"
        sentences={SENTENCES}
        initialMetadata={null}
        isStatusUpdating={false}
        onComplete={vi.fn()}
      />,
    )

    // Sentence 1: tap 録音開始 (grants mic), record, stop, score.
    fireEvent.click(screen.getByRole('button', { name: '🎤 録音開始' }))
    await waitFor(() => screen.getByRole('button', { name: /^⏹ 停止/ }))
    fireEvent.click(screen.getByRole('button', { name: /^⏹ 停止/ }))
    await screen.findByText(/✓ 合格 100%/)

    // No auto-jump: the panel stays on sentence 1's result so the learner can
    // review the take (e.g. the waveform compare) before moving on. The counter
    // proves we're still on sentence 1, and sentence 2's text is absent.
    expect(screen.getByText('文 1 / 2')).toBeInTheDocument()
    expect(screen.queryByText('さようなら')).not.toBeInTheDocument()

    // Tapping 次の文へ advances and auto-plays sentence 2's reference clip,
    // but recording stays manual: the panel rests on お手本 / 録音開始.
    // The arrow distinguishes the result CTA ("次の文へ →") from the header
    // navigation chevron (aria-label "次の文へ").
    const playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play')
    fireEvent.click(screen.getByRole('button', { name: /次の文へ →/ }))
    expect(await screen.findByText('さようなら')).toBeInTheDocument()
    expect(playSpy).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '🎤 録音開始' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^⏹ 停止/ })).not.toBeInTheDocument()
  })

  it('marks stage 4 complete via onComplete when the last sentence passes', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        recordingId: 'rec-x',
        score: 1,
        pass: true,
        transcript: 'さようなら',
        expected: 'さようなら',
        distance: 0,
        expectedLength: 5,
        actualLength: 5,
        threshold: 0.8,
        stageComplete: true,
        passingSentences: 2,
        totalSentences: 2,
      }),
    } as Response)

    const onComplete = vi.fn()
    render(
      <Stage4Panel
        segmentId="seg-1"
        sentences={SENTENCES}
        initialMetadata={{
          sentences: [
            { index: 0, score: 0.95, transcript: 'こんにちは', attempts: 1, passedAt: '2026-06-01T00:00:00.000Z' },
          ],
        }}
        isStatusUpdating={false}
        onComplete={onComplete}
      />,
    )

    expect(screen.getByText('さようなら')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '🎤 録音開始' }))
    await waitFor(() => screen.getByRole('button', { name: /^⏹ 停止/ }))
    fireEvent.click(screen.getByRole('button', { name: /^⏹ 停止/ }))

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1)
    })
    expect(await screen.findByText(/ステージ4完了/)).toBeInTheDocument()
  })

  it('offers a self-playback compare control when a prior recording exists', () => {
    render(
      <Stage4Panel
        segmentId="seg-1"
        sentences={[
          { ...SENTENCES[0], userRecordingUrl: '/api/segments/seg-1/stage4/recordings/0/audio?v=rec-9' },
          SENTENCES[1],
        ]}
        initialMetadata={null}
        isStatusUpdating={false}
        onComplete={vi.fn()}
      />,
    )
    expect(screen.getByText('聴き比べ')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '🎙 自分の声' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '🔊 お手本' })).toBeInTheDocument()
  })

  it('plays the saved recording when 自分の声 is tapped', () => {
    const playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play')
    render(
      <Stage4Panel
        segmentId="seg-1"
        sentences={[
          { ...SENTENCES[0], userRecordingUrl: '/api/segments/seg-1/stage4/recordings/0/audio?v=rec-9' },
          SENTENCES[1],
        ]}
        initialMetadata={null}
        isStatusUpdating={false}
        onComplete={vi.fn()}
      />,
    )
    // The self element loads its source from the userRecordingUrl.
    const selfAudio = document.querySelectorAll('audio')[1] as HTMLAudioElement
    expect(selfAudio.getAttribute('src')).toBe(
      '/api/segments/seg-1/stage4/recordings/0/audio?v=rec-9',
    )
    fireEvent.click(screen.getByRole('button', { name: '🎙 自分の声' }))
    expect(playSpy).toHaveBeenCalled()
  })

  it('plays the reference when 🔊 お手本 in the compare bar is tapped', () => {
    const playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play')
    render(
      <Stage4Panel
        segmentId="seg-1"
        sentences={[
          { ...SENTENCES[0], userRecordingUrl: '/api/segments/seg-1/stage4/recordings/0/audio?v=rec-9' },
          SENTENCES[1],
        ]}
        initialMetadata={null}
        isStatusUpdating={false}
        onComplete={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '🔊 お手本' }))
    expect(playSpy).toHaveBeenCalled()
  })

  it('plays お手本 on "1" and 自分の声 on "2" while the compare bar is visible', () => {
    const playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play')
    render(
      <Stage4Panel
        segmentId="seg-1"
        sentences={[
          { ...SENTENCES[0], userRecordingUrl: '/api/segments/seg-1/stage4/recordings/0/audio?v=rec-9' },
          SENTENCES[1],
        ]}
        initialMetadata={null}
        isStatusUpdating={false}
        onComplete={vi.fn()}
      />,
    )
    // Compare bar is visible at rest because a prior recording exists.
    expect(screen.getByText('聴き比べ')).toBeInTheDocument()
    const [refAudio, selfAudio] = Array.from(
      document.querySelectorAll('audio'),
    ) as HTMLAudioElement[]

    // "1" plays the reference element only.
    playSpy.mockClear()
    fireEvent.keyDown(window, { key: '1' })
    expect(playSpy).toHaveBeenCalledTimes(1)
    expect(playSpy.mock.instances[0]).toBe(refAudio)

    // "2" plays the recording element only.
    playSpy.mockClear()
    fireEvent.keyDown(window, { key: '2' })
    expect(playSpy).toHaveBeenCalledTimes(1)
    expect(playSpy.mock.instances[0]).toBe(selfAudio)
  })

  it('ignores the 1 / 2 compare shortcuts when no recording exists', () => {
    const playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play')
    render(
      <Stage4Panel
        segmentId="seg-1"
        sentences={SENTENCES}
        initialMetadata={null}
        isStatusUpdating={false}
        onComplete={vi.fn()}
      />,
    )
    // No prior recording -> no compare bar, so the shortcuts are inert.
    expect(screen.queryByText('聴き比べ')).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: '1' })
    fireEvent.keyDown(window, { key: '2' })
    expect(playSpy).not.toHaveBeenCalled()
  })

  it('hides the compare bar while recording', async () => {
    render(
      <Stage4Panel
        segmentId="seg-1"
        sentences={[
          { ...SENTENCES[0], userRecordingUrl: '/api/segments/seg-1/stage4/recordings/0/audio?v=rec-9' },
          SENTENCES[1],
        ]}
        initialMetadata={null}
        isStatusUpdating={false}
        onComplete={vi.fn()}
      />,
    )
    // Visible at rest because a recording already exists; listening via the
    // bar's お手本 button doesn't change phase, so it stays visible.
    expect(screen.getByText('聴き比べ')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '🔊 お手本' }))
    expect(screen.getByText('聴き比べ')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '🎤 録音開始' }))
    await waitFor(() => screen.getByRole('button', { name: /^⏹ 停止/ }))
    expect(screen.queryByText('聴き比べ')).not.toBeInTheDocument()
  })

  it('exposes the compare control after a take is scored', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        recordingId: 'rec-1',
        score: 0.5,
        pass: false,
        transcript: 'こんちは',
        expected: 'こんにちは',
        distance: 1,
        expectedLength: 5,
        actualLength: 4,
        threshold: 0.8,
        stageComplete: false,
        passingSentences: 0,
        totalSentences: 2,
      }),
    } as Response)

    render(
      <Stage4Panel
        segmentId="seg-1"
        sentences={SENTENCES}
        initialMetadata={null}
        isStatusUpdating={false}
        onComplete={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '🎤 録音開始' }))
    await waitFor(() => screen.getByRole('button', { name: /^⏹ 停止/ }))
    fireEvent.click(screen.getByRole('button', { name: /^⏹ 停止/ }))

    // Once scored, the learner can replay their own take to compare.
    expect(await screen.findByRole('button', { name: '🎙 自分の声' })).toBeInTheDocument()
    // The self element points at the just-scored take, cache-busted by id.
    const selfAudio = document.querySelectorAll('audio')[1] as HTMLAudioElement
    expect(selfAudio.getAttribute('src')).toBe(
      '/api/segments/seg-1/stage4/recordings/0/audio?v=rec-1',
    )
  })

  it('calls the skip endpoint and triggers onComplete', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, json: async () => ({}) } as Response)
    const onComplete = vi.fn()

    render(
      <Stage4Panel
        segmentId="seg-1"
        sentences={SENTENCES}
        initialMetadata={null}
        isStatusUpdating={false}
        onComplete={onComplete}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'このステージをスキップ' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/segments/seg-1/stage4/complete', { method: 'POST' })
    })
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled()
    })
  })
})
