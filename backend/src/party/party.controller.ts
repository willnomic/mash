import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { createPartySchema, cnpjFieldSchema } from '@mash/shared';
import { z } from 'zod';
import { TenantPrisma } from '../tenant/tenant-prisma.service.js';
import { CnpjLookupService } from './cnpj-lookup.service.js';

const cnpjParamSchema = z.object({ cnpj: cnpjFieldSchema });

// Leitura simples pra popular seletor (remetente/destinatário/tomador,
// D-047) — sem paginação, sem busca. Cadastro de Party completo (tela
// própria pra corrigir e completar) é modelagem que ainda não existe —
// fora desta unidade. Só parte ATIVA (D-017: inativar é estado, não
// remoção).
@Controller('parties')
export class PartyController {
  constructor(
    private readonly tenantPrisma: TenantPrisma,
    private readonly cnpjLookupService: CnpjLookupService,
  ) {}

  @Get()
  list() {
    return this.tenantPrisma.db.party.findMany({
      where: { active: true },
      select: { id: true, name: true, cnpj: true, cpf: true },
      orderBy: { name: 'asc' },
    });
  }

  // Consulta é AUXÍLIO, nunca requisito (unidade "criar cliente sem sair
  // do fluxo") — mesmo CNPJ com formato inválido não bloqueia nada além
  // desta rota específica (o formulário de criação valida de novo, e
  // aceita sem consulta nenhuma). Sempre 200 quando o formato é válido,
  // mesmo se o CNPJ não existir ou a BrasilAPI estiver fora do ar —
  // `found:false`+`reason` é resultado normal, não erro HTTP.
  @Get('cnpj/:cnpj')
  async lookupCnpj(@Param('cnpj') cnpj: string) {
    const parsed = cnpjParamSchema.safeParse({ cnpj });
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.cnpjLookupService.lookup(parsed.data.cnpj);
  }

  // Cria pelo modal (D-048) — sempre personType=COMPANY (o modal só
  // existe pra CNPJ). Endereço é OPCIONAL e, se inválido/incompleto,
  // NUNCA bloqueia a criação da Party — só é descartado (não é campo
  // que o operador digita nesta unidade, é auto-preenchido pela
  // consulta; falhar a requisição inteira por causa dele seria a
  // consulta "requisito" disfarçada de "auxílio").
  @Post()
  async create(@Body() body: unknown) {
    let parsed = createPartySchema.safeParse(body);
    if (!parsed.success) {
      const bodyWithoutAddress =
        typeof body === 'object' && body !== null
          ? { ...(body as Record<string, unknown>), address: undefined }
          : body;
      const retried = createPartySchema.safeParse(bodyWithoutAddress);
      if (!retried.success) {
        throw new BadRequestException(retried.error.flatten());
      }
      parsed = retried;
    }
    const input = parsed.data;

    try {
      return await this.tenantPrisma.transaction(async (tx, tenantId) => {
        const party = await tx.party.create({
          data: {
            id: uuidv7(),
            tenantId,
            personType: 'COMPANY',
            name: input.name,
            cnpj: input.cnpj,
          },
        });
        if (input.address) {
          await tx.address.create({
            data: {
              id: uuidv7(),
              tenantId,
              partyId: party.id,
              ...input.address,
            },
          });
        }
        return { id: party.id, name: party.name, cnpj: party.cnpj };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // CNPJ já cadastrado no tenant (@@unique([tenantId, cnpj])) —
        // motivo legível, e devolve a parte existente pra tela oferecer
        // "usar esta" em vez de só recusar (pedido explícito da
        // unidade).
        const existing = await this.tenantPrisma.db.party.findFirst({
          where: { cnpj: input.cnpj },
          select: { id: true, name: true, cnpj: true },
        });
        throw new ConflictException({
          message: 'CNPJ já cadastrado.',
          existingParty: existing,
        });
      }
      throw error;
    }
  }
}
