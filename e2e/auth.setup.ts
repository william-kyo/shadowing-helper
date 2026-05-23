import { test as setup, expect } from '@playwright/test'

const authFile = 'playwright/.auth/user.json'

setup('authenticate', async ({ page }) => {
  await page.goto('/login')

  await page.getByLabel('Email').fill(process.env.TEST_EMAIL ?? 'REDACTED_TEST_EMAIL')
  await page.getByLabel('Password').fill(process.env.TEST_PASSWORD ?? 'REDACTED_TEST_PASSWORD')
  await page.getByRole('button', { name: 'ログイン' }).click()

  await page.waitForURL('/')
  await expect(page.locator('main')).toBeVisible()

  await page.context().storageState({ path: authFile })
})
