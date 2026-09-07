import { Controller, Get, Header, Param, StreamableFile } from '@nestjs/common';
import { PickupOrderService } from './pickup-order.service.js';

// Gera o PDF sob demanda, na resposta — nunca grava em disco/storage, nunca
// expõe rota pública (docs/decisoes.md D-034). Link compartilhável fica
// pra quando D-010 construir a segunda camada de autorização; esta rota
// exige o mesmo token de qualquer rota protegida (TenantGuard global).
@Controller('pickup-orders')
export class PickupOrderController {
  constructor(private readonly pickupOrderService: PickupOrderService) {}

  @Get(':id/pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'inline; filename="ordem-de-coleta.pdf"')
  async pdf(@Param('id') id: string): Promise<StreamableFile> {
    const buffer = await this.pickupOrderService.generatePdf(id);
    return new StreamableFile(buffer);
  }
}
