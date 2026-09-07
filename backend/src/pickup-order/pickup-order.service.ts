import { Injectable } from '@nestjs/common';
import { TenantPrisma } from '../tenant/tenant-prisma.service.js';
import { buildPickupOrderPdf, type PickupOrderPdfData } from './pickup-order.pdf.js';

@Injectable()
export class PickupOrderService {
  constructor(private readonly tenantPrisma: TenantPrisma) {}

  // Único motivo desta unidade ter service: gerar o PDF é lógica, não dá
  // pra testar batendo direto no banco como o resto do modelo (CLAUDE.md,
  // "mantenha mínimo" do D-027). Criação do PickupOrder continua via
  // Prisma direto, sem service — não tem regra de negócio equivalente ao
  // congelamento de preço do OrderService.
  async generatePdf(pickupOrderId: string): Promise<Buffer> {
    const db = this.tenantPrisma.db;
    const pickupOrder = await db.pickupOrder.findUniqueOrThrow({
      where: { id: pickupOrderId },
      include: {
        address: true,
        items: { orderBy: { createdAt: 'asc' } },
        trip: {
          include: {
            driver: true,
            vehicle: true,
            trailer1: true,
            trailer2: true,
            order: {
              include: {
                sender: true,
                recipient: true,
                tomador: true,
              },
            },
          },
        },
      },
    });

    const data: PickupOrderPdfData = {
      pickupDate: pickupOrder.pickupDate,
      locationLabel: pickupOrder.locationLabel,
      pickupWindow: pickupOrder.pickupWindow,
      businessHours: pickupOrder.businessHours,
      totalWeightKg: pickupOrder.totalWeightKg.toString(),
      totalVolumeCount: pickupOrder.totalVolumeCount,
      totalCubicMeters: pickupOrder.totalCubicMeters.toString(),
      laborNote: pickupOrder.laborNote,
      nfeReference: pickupOrder.nfeReference,
      romaneioReference: pickupOrder.romaneioReference,
      address: {
        logradouro: pickupOrder.address.logradouro,
        numero: pickupOrder.address.numero,
        complemento: pickupOrder.address.complemento,
        bairro: pickupOrder.address.bairro,
        municipio: pickupOrder.address.municipio,
        uf: pickupOrder.address.uf,
        cep: pickupOrder.address.cep,
      },
      sender: { name: pickupOrder.trip.order.sender.name },
      recipient: { name: pickupOrder.trip.order.recipient.name },
      tomador: { name: pickupOrder.trip.order.tomador.name },
      driver: {
        name: pickupOrder.trip.driver.name,
        cpf: pickupOrder.trip.driver.cpf,
        cnhNumber: pickupOrder.trip.driver.cnhNumber,
        cnhCategory: pickupOrder.trip.driver.cnhCategory,
      },
      vehicle: { plate: pickupOrder.trip.vehicle.plate },
      trailer1: pickupOrder.trip.trailer1 ? { plate: pickupOrder.trip.trailer1.plate } : null,
      trailer2: pickupOrder.trip.trailer2 ? { plate: pickupOrder.trip.trailer2.plate } : null,
      items: pickupOrder.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        weightKg: item.weightKg?.toString() ?? null,
      })),
    };

    return buildPickupOrderPdf(data);
  }
}
