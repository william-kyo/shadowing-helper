import { test as setup, expect } from '@playwright/test'

const authFile = 'playwright/.auth/user.json'

setup('authenticate', async ({ page }) => {
  const email = process.env.TEST_EMAIL
  const password = process.env.TEST_PASSWORD

  if (!email || !password) {
    throw new Error(
      'TEST_EMAIL and TEST_PASSWORD must be set before running e2e tests. ' +
        'Add them to a gitignored .env.local (see .env.example). Never hard-code credentials.',
    )
  }

  await page.goto('/login')

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'ログイン' }).click()

  await page.waitForURL('/')
  await expect(page.locator('main')).toBeVisible()

  await page.context().storageState({ path: authFile })
})
