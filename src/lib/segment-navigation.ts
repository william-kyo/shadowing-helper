import { db } from '@/lib/db'
import { TOTAL_STAGES } from '@/lib/stage-progress'

export type NextIncompleteTarget = {
  projectId: string
  segmentId: string
}

type StatusOnly = { status: string }

// A segment is "done" only when all five stages are marked completed.
function isIncomplete(progress: StatusOnly[]): boolean {
  const completed = progress.filter((p) => p.status === 'completed').length
  return completed < TOTAL_STAGES
}

/**
 * Find the next segment that still needs work, scanning forward from the current
 * position: first any later segment in the current project (by index), then —
 * once the current project is fully done — the first incomplete segment of the
 * next project (by creation order).
 *
 * Returns `null` when nothing ahead is left to complete.
 */
export async function findNextIncompleteSegment(params: {
  userId: string
  projectId: string
  projectCreatedAt: Date
  segmentIndex: number
}): Promise<NextIncompleteTarget | null> {
  const { userId, projectId, projectCreatedAt, segmentIndex } = params

  // 1) Later segments within the current project.
  const laterSegments = await db.segment.findMany({
    where: { projectId, index: { gt: segmentIndex } },
    orderBy: { index: 'asc' },
    select: { id: true, progress: { select: { status: true } } },
  })

  const withinProject = laterSegments.find((segment) => isIncomplete(segment.progress))
  if (withinProject) {
    return { projectId, segmentId: withinProject.id }
  }

  // 2) The current project is fully complete — look at subsequent projects in
  //    creation order and take the first incomplete segment we find.
  const laterProjects = await db.project.findMany({
    where: { userId, createdAt: { gt: projectCreatedAt } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      segments: {
        orderBy: { index: 'asc' },
        select: { id: true, progress: { select: { status: true } } },
      },
    },
  })

  for (const project of laterProjects) {
    const segment = project.segments.find((item) => isIncomplete(item.progress))
    if (segment) {
      return { projectId: project.id, segmentId: segment.id }
    }
  }

  return null
}
