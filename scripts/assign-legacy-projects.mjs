import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const email = process.argv[2]?.trim().toLowerCase()

  if (!email) {
    throw new Error('Usage: npm run migrate:legacy-projects -- <email>')
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  })

  if (!user) {
    throw new Error(
      `Local user not found for ${email}. Log into the app once with this account, then rerun the command.`,
    )
  }

  const result = await prisma.project.updateMany({
    where: { userId: null },
    data: { userId: user.id },
  })

  console.log(`Assigned ${result.count} legacy project(s) to ${user.email}.`)
}

main()
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
