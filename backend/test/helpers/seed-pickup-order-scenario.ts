import type { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { seedOrderScenario } from './seed-order-scenario.js';

// Cadeia completa até uma Trip, pra não repetir esse setup em todo teste
// de PickupOrder — mesmo padrão de seedCarrierHireScenario. itemCount
// parametrizável: o teste de paginação do PDF precisa gerar a mesma ordem
// com 1 item e com 40.
export async function seedPickupOrderScenario(
  admin: PrismaClient,
  name: string,
  slug: string,
  itemCount = 1,
) {
  const base = await seedOrderScenario(admin, name, slug);

  const statusId = (
    await admin.tripStatus.findFirstOrThrow({
      where: { code: 'PENDING_RISK_CLEARANCE' },
    })
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
      trailer1Id: base.trailer1.id,
      statusId,
    },
  });

  const pickupOrder = await admin.pickupOrder.create({
    data: {
      id: uuidv7(),
      tenantId: base.tenant.id,
      branchId: base.branch.id,
      tripId: trip.id,
      addressId: base.address.id,
      locationLabel: 'Doca 3',
      pickupDate: new Date('2026-09-10'),
      pickupWindow: '14h às 16h',
      businessHours: 'seg a sex, 8h às 18h',
      totalWeightKg: '1250.500',
      totalVolumeCount: itemCount,
      totalCubicMeters: '8.200',
      laborNote: 'Precisa de ajudante para descarregar',
      nfeReference: 'NF-e 12345',
      romaneioReference: 'ROM-0099',
      items: {
        create: Array.from({ length: itemCount }, (_, i) => ({
          id: uuidv7(),
          tenantId: base.tenant.id,
          description: `Item ${i + 1} — caixa de peças automotivas`,
          quantity: 1,
          weightKg: '50.000',
        })),
      },
    },
    include: { items: true },
  });

  return { ...base, trip, pickupOrder };
}
