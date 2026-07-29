'use client'

// Carries the stage 5 "whose turn is it" cue from the stage workspace down to
// the fixed bottom audio player.
//
// The player is built on the server and handed to the workspace as a ReactNode,
// so it can't take the cue as a prop — but it *renders* inside the workspace's
// tree, so context reaches it. Consumers outside a provider get an inert cue and
// behave exactly as they did before speaker labeling existed.

import { createContext, useContext, type ReactNode } from 'react'

import type { Speaker } from '@/lib/sentence-split'

// A stretch of the segment audio spoken by one labeled voice. Times are
// relative to the start of the segment clip, the same base the player's
// currentTime uses.
export type SpeakerWindow = {
  startMs: number
  endMs: number
  speaker: Speaker
}

export type SpeakerCue = {
  windows: SpeakerWindow[]
  // The role the learner is shadowing right now, or null when they're
  // practicing both parts (or aren't on stage 5 at all).
  activeSpeaker: Speaker | null
}

const INERT_CUE: SpeakerCue = { windows: [], activeSpeaker: null }

const SpeakerCueContext = createContext<SpeakerCue>(INERT_CUE)

export function SpeakerCueProvider({ value, children }: { value: SpeakerCue; children: ReactNode }) {
  return <SpeakerCueContext.Provider value={value}>{children}</SpeakerCueContext.Provider>
}

export function useSpeakerCue(): SpeakerCue {
  return useContext(SpeakerCueContext)
}

// Which labeled voice covers `timeMs`, or null in a gap / unlabeled stretch.
export function findSpeakerAt(windows: SpeakerWindow[], timeMs: number): Speaker | null {
  const match = windows.find((w) => timeMs >= w.startMs && timeMs < w.endMs)
  return match?.speaker ?? null
}

// Collapse labeled chunks into windows, merging neighbours that share a speaker
// so the player draws one continuous run per turn instead of one per chunk.
export function buildSpeakerWindows(
  chunks: readonly { startMs: number; endMs: number }[],
  labels: readonly (Speaker | null)[],
): SpeakerWindow[] {
  const windows: SpeakerWindow[] = []
  chunks.forEach((chunk, index) => {
    const speaker = labels[index]
    if (!speaker) return
    const previous = windows[windows.length - 1]
    if (previous && previous.speaker === speaker && previous.endMs >= chunk.startMs) {
      previous.endMs = Math.max(previous.endMs, chunk.endMs)
      return
    }
    windows.push({ startMs: chunk.startMs, endMs: chunk.endMs, speaker })
  })
  return windows
}
