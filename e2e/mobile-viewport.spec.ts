import { test, expect } from '@playwright/test'

test.describe('mobile viewport — all routes render without overflow', () => {
  test('home page', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('main')).toBeVisible()

    await assertNoHorizontalOverflow(page)
    await assertNoContentClipped(page)
  })

  test('projects list page', async ({ page }) => {
    await page.goto('/projects')
    await expect(page.locator('main')).toBeVisible()

    await assertNoHorizontalOverflow(page)
    await assertNoContentClipped(page)
  })

  test('project detail page', async ({ page }) => {
    const projectId = await getFirstProjectId(page)
    if (!projectId) {
      test.skip(true, 'no projects in database')
      return
    }

    await page.goto(`/projects/${projectId}`)
    await expect(page.locator('main')).toBeVisible()

    await assertNoHorizontalOverflow(page)
    await assertNoContentClipped(page)
  })

  test('segment detail page', async ({ page }) => {
    const ids = await getFirstSegmentIds(page)
    if (!ids) {
      test.skip(true, 'no segments in database')
      return
    }

    await page.goto(`/projects/${ids.projectId}/segments/${ids.segmentId}`)
    await expect(page.locator('main')).toBeVisible()

    await assertNoHorizontalOverflow(page)
    await assertNoContentClipped(page)
  })
})

async function assertNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth
  })
  expect(overflow, 'page should not have horizontal scroll').toBe(false)
}

async function assertNoContentClipped(page: import('@playwright/test').Page) {
  const clipped = await page.evaluate(() => {
    const elements = document.querySelectorAll('main, main > *')
    for (const el of elements) {
      const rect = el.getBoundingClientRect()
      if (rect.right > window.innerWidth + 1) {
        return `Element <${el.tagName.toLowerCase()}> overflows viewport: right=${Math.round(rect.right)}px > viewport=${window.innerWidth}px`
      }
    }
    return null
  })
  expect(clipped, 'no main content should overflow the viewport').toBeNull()
}

async function getFirstProjectId(page: import('@playwright/test').Page): Promise<string | null> {
  const response = await page.goto('/projects')
  if (!response?.ok()) return null

  const link = page.locator('a[href^="/projects/"]').first()
  const exists = await link.count()
  if (exists === 0) return null

  const href = await link.getAttribute('href')
  const match = href?.match(/\/projects\/([^/]+)$/)
  return match?.[1] ?? null
}

async function getFirstSegmentIds(
  page: import('@playwright/test').Page,
): Promise<{ projectId: string; segmentId: string } | null> {
  const projectId = await getFirstProjectId(page)
  if (!projectId) return null

  await page.goto(`/projects/${projectId}`)
  const segLink = page.locator(`a[href^="/projects/${projectId}/segments/"]`).first()
  const exists = await segLink.count()
  if (exists === 0) return null

  const href = await segLink.getAttribute('href')
  const match = href?.match(/\/projects\/([^/]+)\/segments\/([^/]+)/)
  if (!match) return null

  return { projectId: match[1], segmentId: match[2] }
}
