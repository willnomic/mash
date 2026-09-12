import { Controller, Get, Header, Param, StreamableFile } from '@nestjs/common';
import { RequirePermission } from '../auth/permission.decorator.js';
import { PickupOrderService } from './pickup-order.service.js';

// Gera o PDF sob demanda, na resposta — nunca grava em disco/storage, nunca
// expõe rota pública (docs/decisoes.md D-034). Link compartilhável fica
// pra quando D-010 construir a segunda camada de autorização; esta rota
// exige o mesmo token de qualquer rota protegida (TenantGuard global).
@Controller('pickup-orders')
export class PickupOrderController {
  constructor(private readonly pickupOrderService: PickupOrderService) {}

  // Não está na lista explícita da unidade "papéis e permissões" (item
  // 2 cita só cotação/cadastro/configuração) — decisão desta unidade:
  // ordem de coleta é documento operacional que nasce do fluxo
  // comercial já existente ("operador: o fluxo comercial inteiro", item
  // 3), reaproveita quote.view em vez de inventar um módulo novo pra um
  // endpoint só. Relatado, não escondido.
  @RequirePermission('quote.view')
  @Get(':id/pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'inline; filename="ordem-de-coleta.pdf"')
  async pdf(@Param('id') id: string): Promise<StreamableFile> {
    const buffer = await this.pickupOrderService.generatePdf(id);
    return new StreamableFile(buffer);
  }
}
