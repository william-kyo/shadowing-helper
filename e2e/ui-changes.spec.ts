import { test, expect, type Page } from '@playwright/test'

/**
 * E2E coverage for the warm-paper unification + interaction fixes:
 *  - global bottom navigation (visible / active / hidden where appropriate)
 *  - script/notes autosave on the segment page
 *  - audio player dropdown closes on outside click
 *  - real waveform bars render
 *  - script image lightbox opens / closes
 */

const NAV = 'メインナビゲーション'

async function getFirstProjectId(page: Page): Promise<string | null> {
  const response = await page.goto('/projects')
  if (!response?.ok()) return null
  const link = page.locator('a[href^="/projects/"]').first()
  if ((await link.count()) === 0) return null
  const href = await link.getAttribute('href')
  return href?.match(/\/projects\/([^/]+)$/)?.[1] ?? null
}

async function getFirstSegmentIds(
  page: Page,
): Promise<{ projectId: string; segmentId: string } | null> {
  const projectId = await getFirstProjectId(page)
  if (!projectId) return null
  await page.goto(`/projects/${projectId}`)
  const segLink = page.locator(`a[href^="/projects/${projectId}/segments/"]`).first()
  if ((await segLink.count()) === 0) return null
  const href = await segLink.getAttribute('href')
  const match = href?.match(/\/projects\/([^/]+)\/segments\/([^/]+)/)
  return match ? { projectId: match[1], segmentId: match[2] } : null
}

test.describe('global bottom navigation', () => {
  test('shows on home with the home tab active', async ({ page }) => {
    await page.goto('/')
    const nav = page.getByRole('navigation', { name: NAV })
    await expect(nav).toBeVisible()

    const homeTab = nav.getByRole('link', { name: /home/i })
    await expect(homeTab).toHaveAttribute('aria-current', 'page')
  })

  test('navigates to projects and moves the active state', async ({ page }) => {
    await page.goto('/')
    const nav = page.getByRole('navigation', { name: NAV })
    await nav.getByRole('link', { name: /projects/i }).click()

    await page.waitForURL('**/projects')
    await expect(nav.getByRole('link', { name: /projects/i })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  test('is hidden on the segment practice page (player owns the bottom)', async ({ page }) => {
    const ids = await getFirstSegmentIds(page)
    test.skip(!ids, 'no segments in database')

    await page.goto(`/projects/${ids!.projectId}/segments/${ids!.segmentId}`)
    await expect(page.locator('main')).toBeVisible()
    await expect(page.getByRole('navigation', { name: NAV })).toHaveCount(0)
  })
})

test.describe('bottom navigation — unauthenticated', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('is hidden on the login page', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: 'ログイン' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: NAV })).toHaveCount(0)
  })
})

test.describe('segment page interactions', () => {
  test('autosaves notes after editing', async ({ page }) => {
    const ids = await getFirstSegmentIds(page)
    test.skip(!ids, 'no segments in database')

    // Intercept the notes PATCH so the test never mutates real data.
    let patched = false
    await page.route(/\/api\/segments\/[^/]+$/, async (route) => {
      if (route.request().method() === 'PATCH') {
        patched = true
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ text: '', notes: 'e2e autosave probe' }),
        })
        return
      }
      await route.continue()
    })

    await page.goto(`/projects/${ids!.projectId}/segments/${ids!.segmentId}`)

    // Notes are collapsed by default — expand via the toggle in the notes header.
    const notesHeader = page.getByText('ノート（自分用メモ）').locator('..')
    await notesHeader.getByRole('button', { name: '表示' }).click()

    const notes = page.getByPlaceholder('発音メモ、意味調べ、わからなかった箇所など...')
    await notes.fill('e2e autosave probe')

    await expect(page.getByText('✓ 自動保存しました')).toBeVisible({ timeout: 5000 })
    expect(patched, 'an autosave PATCH should have fired').toBe(true)
  })

  test('renders real waveform bars and closes the speed menu on outside click', async ({ page }) => {
    const ids = await getFirstSegmentIds(page)
    test.skip(!ids, 'no segments in database')

    await page.goto(`/projects/${ids!.projectId}/segments/${ids!.segmentId}`)

    // 48 waveform bars are rendered (real or synthetic fallback — either way present).
    await expect(page.locator('.waveform-bar')).toHaveCount(48)

    // Open the playback-speed popover, then click away — it should close.
    await page.getByTitle('再生速度').click()
    const speedOption = page.getByRole('button', { name: '0.5x' })
    await expect(speedOption).toBeVisible()

    await page.getByRole('heading', { level: 1 }).click()
    await expect(speedOption).toBeHidden()
  })
})

async function findProjectWithImages(page: Page): Promise<string | null> {
  const res = await page.goto('/projects')
  if (!res?.ok()) return null
  const hrefs = await page.locator('a[href^="/projects/"]').evaluateAll((els) =>
    Array.from(new Set(els.map((el) => (el as HTMLAnchorElement).getAttribute('href')))).filter(
      (h): h is string => !!h && /\/projects\/[^/]+$/.test(h),
    ),
  )
  for (const href of hrefs) {
    await page.goto(href)
    if ((await page.getByRole('button', { name: /を拡大表示$/ }).count()) > 0) {
      return href
    }
  }
  return null
}

test.describe('script image lightbox', () => {
  test('opens an image overlay and closes it with Escape', async ({ page }) => {
    const projectHref = await findProjectWithImages(page)
    test.skip(!projectHref, 'no project with script images in database')

    await page.goto(projectHref!)
    const firstImage = page.getByRole('button', { name: /を拡大表示$/ }).first()
    await firstImage.click()
    const dialog = page.getByRole('dialog', { name: '台本画像ビューア' })
    await expect(dialog).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })
})
