-- D-014: tarifa é histórico financeiro — cotação e fatura referenciam a
-- linha (quando existirem), e apagar quebra a rastreabilidade do preço
-- aplicado (D-017: movimento financeiro não se apaga). Erro de cadastro
-- se corrige fechando validTo (GRANT UPDATE por coluna, migração
-- 20260904073246_add_lane_freight_rate), nunca apagando a linha.
REVOKE DELETE ON "FreightRate" FROM mash_app;
