import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ProjectAudioWorkspace } from '@/components/project/project-audio-workspace'

afterEach(() => {
  cleanup()
})

describe('ProjectAudioWorkspace', () => {
  it('reads the audio element currentTime and passes it to the manual segment form buttons', () => {
    render(
      <ProjectAudioWorkspace
        audioMimeType="audio/wav"
        audioOriginalName="lesson.wav"
        audioSrc="/api/projects/project-1/audio"
      />,
    )

    const audio = screen.getByLabelText('元音声プレイヤー') as HTMLAudioElement
    Object.defineProperty(audio, 'currentTime', {
      configurable: true,
      value: 8.76,
    })

    fireEvent.click(screen.getByRole('button', { name: '現在位置を開始にセット' }))
    fireEvent.click(screen.getByRole('button', { name: '現在位置を終了にセット' }))

    expect(screen.getByLabelText('開始秒')).toHaveValue(8.76)
    expect(screen.getByLabelText('終了秒')).toHaveValue(8.76)
  })
})
