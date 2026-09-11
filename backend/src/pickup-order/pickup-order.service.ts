import { Injectable } from '@nestjs/common';
import { formatTimeWindow, type TimeWindow } from '@mash/shared';
import { TenantPrisma } from '../tenant/tenant-prisma.service.js';
import { buildPickupOrderPdf, type PickupOrderPdfData } from './pickup-order.pdf.js';

// Resolve o texto da janela de coleta pro PDF: usa @mash/shared quando há
// algo estruturado (horário ou período), cai em pickupTimeNote quando não
// há (D-045) — inclusive quando pickupDate é nulo, já que TimeWindow
// exige data pra existir.
function resolvePickupWindowText(pickupOrder: {
  pickupDate: Date | null;
  pickupStartTime: string | null;
  pickupEndTime: string | null;
  pickupEndsNextDay: boolean;
  pickupDayPeriod: { code: string; name: string } | null;
  pickupTimeNote: string | null;
}): string | null {
  const hasStructured =
    pickupOrder.pickupStartTime !== null ||
    pickupOrder.pickupEndTime !== null ||
    pickupOrder.pickupDayPeriod !== null;

  if (pickupOrder.pickupDate === null || !hasStructured) {
    return pickupOrder.pickupTimeNote;
  }

  const window: TimeWindow = {
    date: pickupOrder.pickupDate.toISOString().slice(0, 10),
    startTime: pickupOrder.pickupStartTime,
    endTime: pickupOrder.pickupEndTime,
    endsNextDay: pickupOrder.pickupEndsNextDay,
    dayPeriodCode: pickupOrder.pickupDayPeriod?.code ?? null,
    note: null,
  };

  return formatTimeWindow(window, pickupOrder.pickupDayPeriod?.name);
}

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
        pickupDayPeriod: true,
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

    // Trip.driverId/vehicleId são nuláveis desde a unidade "caminho CUSTO
    // → Order" (accept() cria a Trip sem os dois — preenchidos na
    // operação, não na cotação). Ordem de coleta existe pra informar o
    // motorista (D-027) — sem os dois atribuídos ainda não há o que
    // imprimir; guarda explícita em vez de estourar acesso a propriedade
    // de null mais abaixo.
    if (pickupOrder.trip.driver === null || pickupOrder.trip.vehicle === null) {
      throw new Error(
        'Trip sem motorista/veículo atribuído ainda não pode gerar ordem de coleta.',
      );
    }

    const data: PickupOrderPdfData = {
      pickupDate: pickupOrder.pickupDate,
      locationLabel: pickupOrder.locationLabel,
      pickupWindow: resolvePickupWindowText(pickupOrder),
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
