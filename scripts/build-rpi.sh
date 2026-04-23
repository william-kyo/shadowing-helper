#!/bin/bash
# Build script for 树莓派: use schema-sqlite.prisma instead of schema.prisma
# After build, schema.prisma is restored for git cleanliness.

set -e

cd "$(dirname "$0")/.."

BACKUP="prisma/schema.prisma.bak"
SQLITE="prisma/schema-sqlite.prisma"
MAIN="prisma/schema.prisma"

# Backup main schema
cp "$MAIN" "$BACKUP"

# Replace with SQLite schema for build
cp "$SQLITE" "$MAIN"

cleanup() {
  # Restore original schema.prisma
  mv "$BACKUP" "$MAIN"
}

trap cleanup EXIT

# Build: uses schema.prisma (now sqlite) → Prisma Client uses sqlite
npm run build

# Start: use SQLite database
DATABASE_URL="file:./prod.db" NODE_ENV=production npx next start -p 3000
