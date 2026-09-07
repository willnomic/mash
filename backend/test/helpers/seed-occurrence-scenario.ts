import type { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { seedOrderScenario } from './seed-order-scenario.js';

// Cadeia completa até uma Trip, pra não repetir esse setup em todo teste
// de Occurrence — mesmo critério do seed-carrier-hire-scenario.
export async function seedOccurrenceScenario(
  admin: PrismaClient,
  name: string,
  slug: string,
) {
  const base = await seedOrderScenario(admin, name, slug);

  const statusId = (
    await admin.tripStatus.findFirstOrThrow({ where: { code: 'IN_TRANSIT' } })
  ).id;

  const trip = await admin.trip.create({
    data: {
      id: uuidv7(),
      tenantId: base.tenant.id,
      branchId: base.branch.id,
      orderId: base.order.id,
      sequence: 1,
      destinationAddressId: base.address.id,
      driverId: base.driver.id,
      vehicleId: base.tractor.id,
      statusId,
    },
  });

  return { ...base, trip };
}
