import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SegmentAudioPlayer } from "@/components/segment/segment-audio-player";
import {
  SpeakerCueProvider,
  type SpeakerCue,
} from "@/components/segment/speaker-cue-context";

const CUE: SpeakerCue = {
  windows: [
    { startMs: 0, endMs: 2000, speaker: "A" },
    { startMs: 2200, endMs: 4000, speaker: "B" },
  ],
  activeSpeaker: "A",
};

function renderPlayer(cue: SpeakerCue) {
  render(
    <SpeakerCueProvider value={cue}>
      <SegmentAudioPlayer
        src="blob:segment-audio"
        title="テストセグメント"
        projectId="proj-1"
        segmentId="seg-1"
        segments={[{ id: "seg-1", title: "テストセグメント", index: 0 }]}
      />
    </SpeakerCueProvider>,
  );
  return document.querySelector("audio") as HTMLAudioElement;
}

// Drive playback position the way the browser would, then let the component
// react to it.
function playTo(audio: HTMLAudioElement, seconds: number) {
  Object.defineProperty(audio, "currentTime", {
    value: seconds,
    configurable: true,
    writable: true,
  });
  fireEvent.timeUpdate(audio);
}

describe("SegmentAudioPlayer stage 5 role practice", () => {
  beforeEach(() => {
    // The waveform decode path needs Web Audio, which jsdom lacks; the
    // component already falls back silently, so keep it out of the way.
    vi.stubGlobal("AudioContext", undefined);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("mutes the learner's own turn and unmutes the other role", () => {
    const audio = renderPlayer(CUE);

    playTo(audio, 1); // inside A's window — the learner speaks this
    expect(audio.muted).toBe(true);

    playTo(audio, 3); // inside B's window — the learner listens
    expect(audio.muted).toBe(false);
  });

  it("keeps the silence between turns audible", () => {
    const audio = renderPlayer(CUE);

    playTo(audio, 2.1);
    expect(audio.muted).toBe(false);
  });

  it("never mutes while shadowing both parts", () => {
    const audio = renderPlayer({ ...CUE, activeSpeaker: null });

    playTo(audio, 1);
    expect(audio.muted).toBe(false);

    playTo(audio, 3);
    expect(audio.muted).toBe(false);
  });

  it("announces whose turn it is, and that the learner's turn is silent", () => {
    const audio = renderPlayer(CUE);

    playTo(audio, 1);
    expect(screen.getByRole("status")).toHaveTextContent("Aの番 · 音声オフ");

    playTo(audio, 3);
    expect(screen.getByRole("status")).toHaveTextContent("相手の番");
  });

  it("shows no turn indicator outside role practice", () => {
    renderPlayer({ windows: [], activeSpeaker: null });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
