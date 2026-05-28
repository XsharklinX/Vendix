import { prisma } from './prisma'

export async function verifyBusiness(businessId: string, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, staffOf: true },
  })
  if (user?.role === 'CASHIER') {
    return user.staffOf === businessId
      ? prisma.business.findUnique({ where: { id: businessId } })
      : null
  }
  return prisma.business.findFirst({ where: { id: businessId, userId } })
}
