import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { createCostBasedQuoteSchema } from '@mash/shared';
import { QuoteService } from './quote.service.js';

// Endpoint por ação, não CRUD (D-048) — nasce só com o que a tela de
// "cotação por custo, parte 1" consome: criar o rascunho. Fechar,
// aceitar e recusar (D-046/D-047) continuam só no service, sem rota —
// são a parte 2, fora do escopo desta unidade.
@Controller('quotes')
export class QuoteController {
  constructor(private readonly quoteService: QuoteService) {}

  // Nasce OPEN, guardando só as ENTRADAS (linhas de custo, margem, UF) —
  // NUNCA preço. Preço e alíquotas só existem depois de close() (D-041/
  // D-046, parte 2): o corpo desta requisição nem tem campo pra preço,
  // então "o backend nunca confia no valor calculado pelo cliente"
  // (D-048) vale de graça aqui — não tem valor de cliente pra confiar
  // ou desconfiar.
  @Post('cost-based')
  async createCostBased(@Body() body: unknown) {
    const parsed = createCostBasedQuoteSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const quote = await this.quoteService.createCostBased(parsed.data);
    return { id: quote.id, createdAt: quote.createdAt };
  }
}
