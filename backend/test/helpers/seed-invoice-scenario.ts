import type { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { seedOrderScenario } from './seed-order-scenario.js';

// Cadeia completa até uma Trip e uma Invoice já fechando o Order nela
// (D-042), pra não repetir esse setup em todo teste de
// Invoice/Boleto/ReceivableEvent/Attachment — mesmo critério de
// seed-occurrence-scenario/seed-carrier-hire-scenario. Caller precisa ter
// chamado ensureTripStatusesSeeded(admin) antes (mesma convenção dos
// outros seeds de Trip).
export async function seedInvoiceScenario(
  admin: PrismaClient,
  name: string,
  slug: string,
) {
  const base = await seedOrderScenario(admin, name, slug);

  const tripStatusId = (
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
      statusId: tripStatusId,
    },
  });

  const invoice = await admin.invoice.create({
    data: {
      id: uuidv7(),
      tenantId: base.tenant.id,
      branchId: base.branch.id,
      partyId: base.party.id,
      // Cenário cria um tenant novo a cada chamada — número 1 é sempre
      // válido no escopo tenant+branch, mesmo critério de
      // seedOrderScenario pro number do Order.
      number: 1,
    },
  });
  const order = await admin.order.update({
    where: { id: base.order.id },
    data: { invoiceId: invoice.id },
  });

  return { ...base, order, trip, invoice };
}
