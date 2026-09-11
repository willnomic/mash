import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import { z } from 'zod';
import { BRAZILIAN_STATE_CODES } from '@mash/shared';
import { TaxRateService } from './tax-rate.service.js';
import { TenantPrisma } from '../tenant/tenant-prisma.service.js';

const quotePreviewQuerySchema = z.object({
  icmsUf: z.enum(BRAZILIAN_STATE_CODES, { message: 'UF inválida' }),
});

// Único endpoint HTTP do TaxRateService hoje — desbloqueia o preview ao
// vivo da cotação por custo (unidade "primeira tela de negócio", parte
// 1). Mesmas TRÊS buscas que QuoteService.close() já faz no fechamento
// real (D-041/D-043): ICMS interna por UF (Quote só tem um campo
// icmsUf — não origem/destino — então findInterstateIcmsRate() nunca
// se aplica aqui, mesma leitura de close()), IBS e CBS nacionais. Nem a
// busca nem a regra de vigência são reimplementadas — é a mesma
// TaxRateService.findRate(), só exposta por HTTP.
//
// "Agora" como data de referência é decisão desta unidade, não do
// serviço: a data que vale de verdade é a do FECHAMENTO (D-014, "recotar
// data passada usa a alíquota daquela data"), que só existe em close()
// (parte 2, fora de escopo). Isto aqui é preview — o backend nunca
// confia nele como valor oficial (D-048).
@Controller('tax-rates')
export class TaxRateController {
  constructor(
    private readonly taxRateService: TaxRateService,
    private readonly tenantPrisma: TenantPrisma,
  ) {}

  @Get('quote-preview')
  async quotePreview(@Query() query: unknown) {
    const parsed = quotePreviewQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const date = new Date();
    try {
      return await this.tenantPrisma.transaction(async (tx) => {
        const [icms, ibs, cbs] = await Promise.all([
          this.taxRateService.findRate(tx, {
            taxType: 'ICMS',
            uf: parsed.data.icmsUf,
            date,
          }),
          this.taxRateService.findRate(tx, { taxType: 'IBS', date }),
          this.taxRateService.findRate(tx, { taxType: 'CBS', date }),
        ]);

        return {
          icmsRatePercent: icms.rate.toString(),
          ibsRatePercent: ibs.rate.toString(),
          ibsComposesPrice: ibs.composesPrice,
          cbsRatePercent: cbs.rate.toString(),
          cbsComposesPrice: cbs.composesPrice,
        };
      });
    } catch (error) {
      // findRate() lança Error puro, não HttpException (é chamado
      // internamente por close(), que não passa por HTTP) — sem este
      // catch, o filtro padrão do Nest devolveria 500 "Internal server
      // error" SEM a mensagem, escondendo exatamente o motivo que o
      // guard de placeholder (D-041/D-043) existe para mostrar. 422, não
      // 400: a requisição está bem formada, é o dado de negócio
      // (alíquota indisponível/não calibrada) que impede a resposta —
      // "falhe explícito, mostrando o motivo", nunca zero ou inventado.
      if (error instanceof Error) {
        throw new UnprocessableEntityException(error.message);
      }
      throw error;
    }
  }
}
