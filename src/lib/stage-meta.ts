import type { Dictionary } from '@/lib/i18n/dictionaries'

export type StageMeta = {
  label: string
  description: string
}

export const STAGE_COUNT = 5

// The five stages' copy now lives in the dictionaries, so callers derive it from
// the active locale rather than importing a fixed Japanese table.
export function getStageMeta(t: Dictionary): Record<number, StageMeta> {
  return {
    1: { label: t.stages.s1Label, description: t.stages.s1Description },
    2: { label: t.stages.s2Label, description: t.stages.s2Description },
    3: { label: t.stages.s3Label, description: t.stages.s3Description },
    4: { label: t.stages.s4Label, description: t.stages.s4Description },
    5: { label: t.stages.s5Label, description: t.stages.s5Description },
  }
}
