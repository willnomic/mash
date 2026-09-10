import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { precisionOf, type TimeWindowPrecision } from './time-window.precision.js';
import { parseTimeWindow } from './time-window.parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, '__fixtures__', 'janelas-planilha-pedro-2025.json');
const YEAR = 2025;

/**
 * Conjunto EXATO de formas que devem cair em fallback total (nada
 * estruturado além, possivelmente, da data) — não é janela de tempo, mesmo
 * reconhecendo o texto. Cada grupo tem a razão de negócio pela qual não é
 * parseado (rationale completo em `time-window.parser.ts`, no comentário
 * acima de `parseTimeWindow`). O teste compara CONJUNTOS, não taxa:
 *
 *   - fallback que não está aqui declarado -> FALHA (regra nova quebrou, ou
 *     uma forma nunca vista apareceu — mostra a string crua)
 *   - string daqui que passou a ser parseada -> FALHA também (uma regra
 *     nova engoliu algo que era pra ficar de fora, de propósito)
 */
const EXPECTED_FALLBACK = new Set<string>([
  // Ordem da perna dentro do pedido (Trip.sequence, D-037) — o operador usa
  // a coluna de data pra registrar isso por falta de lugar próprio, não é
  // horário. "26/05 - SEGUNDA"/"27/05 - TERÇA-FEIRA" são ambíguas entre dia
  // da semana e ordinal solto — de qualquer leitura, não são janela.
  '04/09 - PRIMEIRA DE QUINTA',
  '04/09 - SEGUNDA DE QUINTA',
  '04/09 - ULTIMA DE QUINTA',
  '05/09 - PRIMEIRA DE SEXTA',
  '05/09 - SEGUNDA DE SEXTA',
  '05/09 - TERCEIRA DE SEXTA',
  '05/09 - ULTIMA DE SEXTA',
  '12/03 - PRIMEIRO',
  '12/03 - SEGUNDO',
  '12/03 - TERCEIRO',
  '12/03 - QUARTO',
  '12/03 - QUINTO',
  '12/03 - ULTIMO',
  'PRIMEIRA ENTREGA',
  'SEGUNDA ENTREGA',
  '26/05 - SEGUNDA',
  '27/05 - TERÇA-FEIRA',

  // Dependência de evento (status de viagem / Occurrence), não horário fixo.
  '13/05 - LIBERADO PARA COLETA',
  '18/02 - LOGO APÓS A DESCARGA',
  '19/02 - PÓS COLETA',
  '20/03 - LIBERADO',
  'ALINHAMENTO NELSO E TDR',
  'COLETADO PELA TRANSPORTADORA UPS',
  'EM ATÉ 48 HORAS APÓS A COLETA',
  'ENVIADO PELA TDR',
  'SEM PREVISAO',

  // Regra do local (horário de funcionamento do Address), não da carga —
  // Address não modela isso ainda (pendência nova em decisoes.md).
  '24/07 - ORDEM DE CHEGADA',

  // Data alternativa — decisão deliberada de não modelar (duas datas
  // candidatas viraria lista e poluiria consulta por dia). Ancora na
  // primeira data, string inteira em note.
  '05/03 OU 06/03',
  '05/08 OU 06/08',
  '11/11 OU 12/11',
  '09/01 - PELA MANHÃ OU 10/01 - PELA MANHÃ',
]);

describe('parseTimeWindow contra a planilha operacional real de 2025 (Pedro)', () => {
  it('só cai em fallback total o conjunto declarado — nada mais, nada menos', () => {
    if (!existsSync(FIXTURE_PATH)) {
      throw new Error(
        [
          `Fixture ausente: ${FIXTURE_PATH}`,
          '',
          'Este teste precisa do arquivo real com as formas distintas extraídas da ' +
            'planilha operacional de 2025 — não foi gerado nem inventado aqui (CLAUDE.md ' +
            '§1: nada de dado real inventado).',
          '',
          'Formato esperado: array JSON de strings, uma por forma distinta, ex.:',
          '  ["03/02 - 00H00 A 02H00", "08/01 - 08H00", "05/05 - ATÉ AS 17H30", ...]',
        ].join('\n'),
      );
    }

    const inputs: string[] = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));
    expect(Array.isArray(inputs)).toBe(true);
    expect(inputs.length).toBeGreaterThan(0);

    const countsByPrecision: Record<TimeWindowPrecision, number> = {
      EXACT: 0,
      RANGE: 0,
      UNTIL: 0,
      FROM: 0,
      PERIOD: 0,
      DAY: 0,
    };
    const actualFallback: string[] = [];
    const partiallyStructuredWithNote: string[] = [];

    for (const input of inputs) {
      const w = parseTimeWindow(input, YEAR);
      countsByPrecision[precisionOf(w)]++;
      // "Caiu em fallback total" = nada estruturado além, possivelmente, da
      // data. Não confundir com estruturação PARCIAL (horário explícito
      // reconhecido junto de período nomeado, ou mês implausível, que
      // também preenche `note` mas COM startTime/endTime/dayPeriodCode reais).
      const isTotalFallback =
        w.note !== null && w.startTime === null && w.endTime === null && w.dayPeriodCode === null;
      if (isTotalFallback) {
        actualFallback.push(input);
      } else if (w.note !== null) {
        partiallyStructuredWithNote.push(input);
      }
    }

    console.log(`Total de formas: ${inputs.length}`);
    console.log('Distribuição por precisão:', countsByPrecision);
    console.log(`Caíram em fallback total: ${actualFallback.length}`);
    console.log(`Estruturadas parcialmente (nota preservada junto): ${partiallyStructuredWithNote.length}`);

    const actualSet = new Set(actualFallback);
    const missingFromExpected = actualFallback.filter((s) => !EXPECTED_FALLBACK.has(s)); // caiu em fallback, mas não estava declarado
    const noLongerFallback = [...EXPECTED_FALLBACK].filter((s) => !actualSet.has(s)); // estava declarado, mas passou a ser parseado

    if (missingFromExpected.length > 0 || noLongerFallback.length > 0) {
      throw new Error(
        [
          'O conjunto de fallback real não bate com o declarado.',
          '',
          missingFromExpected.length > 0
            ? [
                `Caíram em fallback SEM estar no conjunto declarado (${missingFromExpected.length}) ` +
                  '— forma nova, ou regra que deveria cobrir isso regrediu:',
                ...missingFromExpected.map((s) => `  - ${JSON.stringify(s)}`),
              ].join('\n')
            : null,
          noLongerFallback.length > 0
            ? [
                `Estavam declaradas como fallback mas foram PARSEADAS (${noLongerFallback.length}) ` +
                  '— uma regra nova passou a engolir algo que era pra ficar de fora:',
                ...noLongerFallback.map((s) => `  - ${JSON.stringify(s)}`),
              ].join('\n')
            : null,
        ]
          .filter(Boolean)
          .join('\n\n'),
      );
    }
  });
});
