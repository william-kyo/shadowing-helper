import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { HomeStreakHero } from '@/components/home/home-streak-hero'

afterEach(() => {
  cleanup()
})

describe('HomeStreakHero', () => {
  it('shows the 21-day challenge card while the habit is not yet achieved', () => {
    render(
      <HomeStreakHero
        currentStreak={5}
        longestStreak={16}
        hasPracticedToday={false}
        habitAchieved={false}
      />,
    )
    expect(screen.getByText('21日チャレンジ')).toBeInTheDocument()
    expect(
      screen.getByRole('progressbar', { name: '5 / 21 日達成' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('日連続')).not.toBeInTheDocument()
  })

  it('shows the streak counter once the challenge is achieved', () => {
    render(
      <HomeStreakHero
        currentStreak={23}
        longestStreak={23}
        hasPracticedToday={true}
        habitAchieved={true}
      />,
    )
    expect(
      screen.getByRole('region', { name: '現在の継続日数' }),
    ).toBeInTheDocument()
    expect(screen.getByText('日連続')).toBeInTheDocument()
    expect(screen.getByText(/最長 23 日/)).toBeInTheDocument()
    expect(screen.queryByText('21日チャレンジ')).not.toBeInTheDocument()
  })

  it('keeps the streak counter after a break — achievement is permanent', () => {
    // The persisted habitAchieved flag wins even when the current streak has
    // reset and the recomputed longest streak fell back under the goal.
    render(
      <HomeStreakHero
        currentStreak={2}
        longestStreak={16}
        hasPracticedToday={false}
        habitAchieved={true}
      />,
    )
    expect(screen.getByText('日連続')).toBeInTheDocument()
    expect(screen.getByText(/最長 16 日/)).toBeInTheDocument()
    expect(screen.queryByText('21日チャレンジ')).not.toBeInTheDocument()
  })
})
