import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { updateTenantSettingsSchema } from '@mash/shared';
import { RequirePermission } from '../auth/permission.decorator.js';
import { TenantSettingsService } from './tenant-settings.service.js';

// Primeira configuração real do produto (D-020 já previa isto "desde o
// primeiro dia" como SettingsService — nunca construído até esta
// unidade). Atrás de settings.view/settings.change (D-055, semeadas
// exatamente pra isto) — a guarda é no BACKEND, a tela só esconde por
// conveniência (mesmo critério de todo endpoint desde D-055).
//
// POST pra alterar, não PUT/PATCH: nenhum endpoint deste sistema usa
// esses verbos — close()/accept()/reject() também são mudança de
// estado em recurso existente e são POST (D-048/D-051). Convenção do
// repositório vence preferência pessoal.
@Controller('tenant-settings')
export class TenantSettingsController {
  constructor(private readonly tenantSettingsService: TenantSettingsService) {}

  @RequirePermission('settings.view')
  @Get()
  async get() {
    const defaultQuoteValidity =
      await this.tenantSettingsService.getDefaultQuoteValidity();
    return { defaultQuoteValidity };
  }

  @RequirePermission('settings.change')
  @Post()
  async update(@Body() body: unknown) {
    const parsed = updateTenantSettingsSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const defaultQuoteValidity =
      await this.tenantSettingsService.updateDefaultQuoteValidity(
        parsed.data.defaultQuoteValidity,
      );
    return { defaultQuoteValidity };
  }
}
