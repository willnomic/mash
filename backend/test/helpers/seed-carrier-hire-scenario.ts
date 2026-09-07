import type { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { seedOrderScenario } from './seed-order-scenario.js';

// Cadeia completa até uma Trip terceirizada, pra não repetir esse setup em
// todo teste de CarrierHire/CarrierPayment. O terceiro é uma Party PF
// (TAC) — reaproveita o cadastro existente, D-018 aplicado a D-019.
export async function seedCarrierHireScenario(
  admin: PrismaClient,
  name: string,
  slug: string,
) {
  const base = await seedOrderScenario(admin, name, slug);

  const thirdParty = await admin.party.create({
    data: {
      id: uuidv7(),
      tenantId: base.tenant.id,
      personType: 'INDIVIDUAL',
      name: `Terceiro ${name}`,
      cpf: '11144477735',
    },
  });

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
      destinationAddressId: base.address.id,
      driverId: base.driver.id,
      vehicleId: base.tractor.id,
      statusId,
    },
  });

  return { ...base, thirdParty, trip };
}
