import type { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';

// Cadeia completa até Order, pra não repetir esse setup em todo teste de
// Trip/RiskClearance. Cada chamada cria um tenant novo e independente.
export async function seedOrderScenario(
  admin: PrismaClient,
  name: string,
  slug: string,
) {
  const tenant = await admin.tenant.create({
    data: { id: uuidv7(), name, slug },
  });
  const branch = await admin.branch.create({
    data: { id: uuidv7(), tenantId: tenant.id, name: 'Matriz' },
  });
  const party = await admin.party.create({
    data: {
      id: uuidv7(),
      tenantId: tenant.id,
      personType: 'COMPANY',
      name: `Cliente ${name}`,
      cnpj: '11444777000161',
    },
  });
  const address = await admin.address.create({
    data: {
      id: uuidv7(),
      tenantId: tenant.id,
      partyId: party.id,
      logradouro: 'Rua A',
      bairro: 'Centro',
      municipio: 'Curitiba',
      uf: 'PR',
      cep: '80010000',
    },
  });
  const lane = await admin.lane.create({
    data: {
      id: uuidv7(),
      tenantId: tenant.id,
      originCity: 'São Paulo',
      originState: 'SP',
      destinationCity: 'Curitiba',
      destinationState: 'PR',
    },
  });
  const freightRate = await admin.freightRate.create({
    data: {
      id: uuidv7(),
      tenantId: tenant.id,
      partyId: party.id,
      laneId: lane.id,
      validFrom: new Date('2026-01-01'),
      validTo: new Date('9999-12-31'),
      rate: '150.5',
      minimumFreight: '500',
      additionalPercentage: '2.5',
    },
  });
  const order = await admin.order.create({
    data: {
      id: uuidv7(),
      tenantId: tenant.id,
      branchId: branch.id,
      freightRateId: freightRate.id,
      senderId: party.id,
      recipientId: party.id,
      tomadorId: party.id,
      rate: '150.5',
      minimumFreight: '500',
      additionalPercentage: '2.5',
      total: '500',
    },
  });
  const driver = await admin.driver.create({
    data: {
      id: uuidv7(),
      tenantId: tenant.id,
      name: `Motorista ${name}`,
      cpf: '52998224725',
      cnhNumber: '12345678900',
      cnhCategory: 'E',
      cnhValidUntil: new Date('2030-01-01'),
      employmentType: 'EMPLOYEE',
    },
  });
  const tractor = await admin.vehicle.create({
    data: {
      id: uuidv7(),
      tenantId: tenant.id,
      plate: 'ABC1D23',
      renavam: '12345678900',
      type: 'CAVALO_MECANICO',
      ownership: 'OWNED',
      capacityKg: '25000',
      tareKg: '8000',
    },
  });
  const trailer1 = await admin.vehicle.create({
    data: {
      id: uuidv7(),
      tenantId: tenant.id,
      plate: 'ABC1D24',
      renavam: '12345678901',
      type: 'CARRETA',
      ownership: 'OWNED',
      capacityKg: '30000',
      tareKg: '7000',
    },
  });
  const trailer2 = await admin.vehicle.create({
    data: {
      id: uuidv7(),
      tenantId: tenant.id,
      plate: 'ABC1D25',
      renavam: '12345678902',
      type: 'CARRETA',
      ownership: 'THIRD_PARTY',
      capacityKg: '30000',
      tareKg: '7000',
    },
  });

  return {
    tenant,
    branch,
    party,
    address,
    lane,
    freightRate,
    order,
    driver,
    tractor,
    trailer1,
    trailer2,
  };
}
