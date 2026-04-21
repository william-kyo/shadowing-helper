import '@testing-library/jest-dom/vitest'

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'file:./test.db'
process.env.STORAGE_ROOT = process.env.STORAGE_ROOT ?? 'storage/projects'
