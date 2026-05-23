import { test, expect } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('login page — mobile display', () => {
  test('renders all elements without overflow', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'ログイン' })).toBeVisible()

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflow, 'no horizontal scroll on login page').toBe(false)
  })

  test('form is fully visible without scrolling on tall phones', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/login')

    const button = page.getByRole('button', { name: 'ログイン' })
    await expect(button).toBeVisible()

    const isInView = await button.evaluate((el) => {
      const rect = el.getBoundingClientRect()
      return rect.bottom <= window.innerHeight
    })
    expect(isInView, 'login button should be visible without scrolling on iPhone-sized viewport').toBe(true)
  })

  test('form is usable on small phones (iPhone SE)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto('/login')

    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByRole('button', { name: 'ログイン' })).toBeVisible()

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflow, 'no horizontal scroll on iPhone SE').toBe(false)
  })

  test('unauthenticated user is redirected to login from protected routes', async ({ page }) => {
    await page.goto('/')
    await page.waitForURL('**/login**')
    expect(page.url()).toContain('/login')
  })
})
