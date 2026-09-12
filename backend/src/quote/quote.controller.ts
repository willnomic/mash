import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  createCostBasedQuoteSchema,
  closeQuoteSchema,
  acceptQuoteSchema,
  listQuotesQuerySchema,
  isQuoteValidityExpired,
} from '@mash/shared';
import { QuoteService } from './quote.service.js';
import { TenantPrisma } from '../tenant/tenant-prisma.service.js';

// Endpoint por ação, não CRUD (D-048) — cada rota nasce só com o que a
// tela de "cotação por custo" consome. Parte 1: criar rascunho (D-050).
// Parte 2 (esta unidade): ler uma cotação por id, fechar com prazo,
// aceitar criando o pedido, recusar.
@Controller('quotes')
export class QuoteController {
  constructor(
    private readonly quoteService: QuoteService,
    private readonly tenantPrisma: TenantPrisma,
  ) {}

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

  // Lista de cotações (unidade "lista de cotações") — primeira tela de
  // chegada do sistema. Filtro/busca/paginação no servidor (D-049/D-050:
  // a lista cresce pra milhares). Mesmo endpoint alimenta o Ctrl+K
  // (busca de entidade, D-048/D-049): a tela manda page/pageSize
  // maiores, o Ctrl+K manda um "q" e um pageSize pequeno — nenhum
  // endpoint separado.
  @Get()
  async list(@Query() query: unknown) {
    const parsed = listQuotesQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.quoteService.list(parsed.data);
  }

  // Estado completo de UMA cotação, por id direto — não é lista de
  // cotações (fora de escopo, D-050): é o mínimo pra abrir uma tela de
  // detalhe já existente (link direto, sobrevive a F5), sem busca nem
  // navegação entre várias. Reaproveitado como corpo de resposta de
  // close()/accept()/reject() também, pra não duplicar a montagem do
  // objeto.
  //
  // Não recompõe o detalhamento de imposto (ICMS/IBS/CBS em R$): a
  // vigência de TaxRate.composesPrice usada no fechamento não fica
  // congelada em nenhuma coluna própria de Quote — só as ALÍQUOTAS
  // (icmsRateApplied etc.) e o total ficam. Recalcular o detalhamento
  // agora, com o composesPrice de HOJE, poderia divergir do que foi
  // aplicado de verdade no fechamento (CLAUDE.md 1.6: melhor não
  // inventar do que arriscar um número que parece preciso e não é). A
  // tela mostra alíquota aplicada (%) e total (R$), nunca um R$ de
  // imposto que não foi persistido.
  @Get(':id')
  async findOne(@Param('id') id: string) {
    let quote;
    try {
      quote = await this.tenantPrisma.db.quote.findUniqueOrThrow({
        where: { id },
        include: {
          status: true,
          party: true,
          costLines: {
            include: { costType: true },
            orderBy: { createdAt: 'asc' },
          },
          orders: { include: { trips: true } },
        },
      });
    } catch (error) {
      this.mapServiceErrorToHttp(error);
    }

    const costSubtotal = quote.costLines.reduce(
      (sum, line) => sum.plus(line.amount),
      new Prisma.Decimal(0),
    );
    const order = quote.orders[0];

    return {
      id: quote.id,
      createdAt: quote.createdAt,
      statusCode: quote.status.code,
      // Quem pediu a cotação (unidade "vincular cliente à Quote") —
      // parte do estado completo da Quote, como qualquer outra coluna
      // já devolvida aqui.
      party: { id: quote.party.id, name: quote.party.name },
      isExpired: isQuoteValidityExpired(quote.validUntil, new Date()),
      validUntil: quote.validUntil,
      icmsUf: quote.icmsUf,
      marginPercentage: quote.marginPercentage,
      icmsRateApplied: quote.icmsRateApplied,
      ibsRateApplied: quote.ibsRateApplied,
      cbsRateApplied: quote.cbsRateApplied,
      total: quote.total,
      quantity: quote.quantity,
      costSubtotal: costSubtotal.toString(),
      costLines: quote.costLines.map((line) => ({
        id: line.id,
        costTypeName: line.costType.name,
        description: line.description,
        amount: line.amount,
      })),
      order: order
        ? {
            id: order.id,
            number: order.number,
            tripsCount: order.trips.length,
            unitPrice: quote.total,
          }
        : null,
    };
  }

  // Fecha com PRAZO OBRIGATÓRIO (unidade "cotação por custo, parte 2"):
  // QuoteService.close() aceita validityTerm opcional por
  // compatibilidade (D-046), mas cotação sem prazo nunca expira — o
  // CONTRATO desta rota (closeQuoteSchema) exige o prazo, é a tela que
  // sempre manda a data. GUARDA A DATA (validUntil), calculada aqui via
  // computeQuoteValidUntil dentro do service — nunca o prazo em si.
  @Post(':id/close')
  @HttpCode(200)
  async close(@Param('id') id: string, @Body() body: unknown) {
    const parsed = closeQuoteSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      await this.quoteService.close(id, {
        validityTerm: parsed.data.validityTerm,
      });
    } catch (error) {
      this.mapServiceErrorToHttp(error);
    }
    return this.findOne(id);
  }

  // Aceitar cria o pedido na mesma transação (D-047) — IDEMPOTENTE: a
  // segunda tentativa (duplo clique, retry de rede) não cria um segundo
  // Order. QuoteService.accept() lança a mesma mensagem genérica pra
  // "já tem desfecho" e "vencida" — aqui a rota decide o código HTTP e a
  // mensagem certos pra cada caso, sem mudar o service (D-050: exception
  // filter global mudaria o formato de erro de 343 testes).
  @Post(':id/accept')
  @HttpCode(200)
  async accept(@Param('id') id: string, @Body() body: unknown) {
    const parsed = acceptQuoteSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      await this.quoteService.accept(id, parsed.data);
    } catch (error) {
      if (error instanceof Error && /já tem desfecho/.test(error.message)) {
        const quote = await this.tenantPrisma.db.quote.findUniqueOrThrow({
          where: { id },
          include: { status: true },
        });
        if (quote.status.code === 'ACCEPTED') {
          // Idempotência (D-048): duplo clique não é erro, é a mesma
          // pergunta de novo — 409, não 500/422 genérico. A tela lê isto
          // como "já aceita", não como falha.
          throw new ConflictException('Cotação já foi aceita.');
        }
        throw new UnprocessableEntityException(
          'Cotação já tem desfecho registrado — não pode ser aceita.',
        );
      }
      if (error instanceof Error && /vencida/.test(error.message)) {
        throw new UnprocessableEntityException(
          'Cotação vencida — não pode ser aceita.',
        );
      }
      this.mapServiceErrorToHttp(error);
    }
    return this.findOne(id);
  }

  // Recusar reaproveita QuoteStatus REJECTED (D-046). Cotação vencida
  // pode ser recusada normalmente — só accept() tem a guarda de
  // vencimento.
  @Post(':id/reject')
  @HttpCode(200)
  async reject(@Param('id') id: string) {
    try {
      await this.quoteService.reject(id);
    } catch (error) {
      if (error instanceof Error && /já tem desfecho/.test(error.message)) {
        throw new ConflictException(
          'Cotação já tem um desfecho registrado.',
        );
      }
      this.mapServiceErrorToHttp(error);
    }
    return this.findOne(id);
  }

  // findRate()/findUniqueOrThrow() lançam Error puro ou
  // PrismaClientKnownRequestError, nunca HttpException (chamados hoje só
  // por dentro, sem HTTP no meio) — sem este mapeamento, o filtro padrão
  // do Nest devolveria 500 "Internal server error" sem motivo (mesmo
  // achado do TaxRateController, D-050).
  private mapServiceErrorToHttp(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      throw new NotFoundException('Cotação não encontrada.');
    }
    if (error instanceof Error) {
      throw new UnprocessableEntityException(error.message);
    }
    throw error;
  }
}
