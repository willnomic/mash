import type { DayPeriodCode } from './time-window.types.js';
import { type TimeWindow, validateTimeWindow } from './time-window.types.js';

/**
 * Remove acentos e normaliza espaços/caixa, para casar tanto o que o operador
 * digitou (maiúsculo, às vezes sem acento — "MANHÃ" e "MANHA" convivem no
 * mesmo dado real) quanto a saída de `formatTimeWindow` (minúsculo, com
 * acento) contra os mesmos padrões.
 */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Correções de erro de digitação confirmadas em dado real (planilha
 * operacional de 2025) — tabela pequena e explícita, não heurística de
 * distância de string: cada entrada aqui é um erro específico que apareceu
 * de verdade, não uma tentativa de adivinhar erro futuro.
 */
function fixTypos(r: string): string {
  return (
    r
      // pontuação sobrando no fim ("PELA MANHÃ!")
      .replace(/[!?.,;:]+$/, '')
      // transposição de letra ("MIEO DIA" -> "MEIO DIA", "PRMEIRA HORA" -> "PRIMEIRA HORA")
      .replace(/\bMIEO\b/g, 'MEIO')
      .replace(/\bPRMEIRA\b/g, 'PRIMEIRA')
      // conector "A" grudado no horário ("A16H00" -> "A 16H00")
      .replace(/\bA(\d{1,2}H\d{1,2})\b/g, 'A $1')
      // dígito da hora separado do resto por espaço ("A0 8H00" -> "A 08H00")
      .replace(/\bA(\d)\s+(\d)(H\d{1,2})\b/g, 'A $1$2$3')
      .trim()
  );
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function isPlausibleDate(day: number, month: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function buildTime(h: string, m: string): string {
  return `${pad2(Number(h))}:${pad2(Number(m))}`;
}

/**
 * Períodos do dia reconhecidos — todos confirmados em dado real (planilha
 * operacional de 2025, 1.951 células / 1.453 formas distintas):
 *   MORNING (35)          "PELA MANHÃ" / "PELA MANHA" / "DE MANHA"
 *   AFTERNOON (37)        "PELA TARDE"
 *   EVENING (2)           "PELA NOITE" / "A NOITE"
 *   FIRST_HOUR (13+3)     "PRIMEIRA HORA DA MANHÃ", e os sinônimos "PRIMEIRA
 *                         HORA" / "PRIMEIRA HORA DO DIA"
 *   END_OF_DAY (3+1)      "FINAL DA TARDE", e o sinônimo "FIM DE TARDE"
 *   MIDDAY (5)            "MEIO DIA"
 *   LATE_MORNING (2)      "FINAL DA MANHÃ" — novo
 *   EARLY_AFTERNOON (2)   "INICIO DA TARDE" / "PRIMEIRA HORA DA TARDE" — novo
 *   ALL_DAY (1)           "RECEBE O DIA INTEIRO" — novo
 * Contagens sobre as células originais (com repetição), não sobre as formas
 * já deduplicadas do fixture. Verificadas em
 * `shared/src/time-window/__fixtures__/janelas-planilha-pedro-2025.json`.
 *
 * Ordem importa (mesmo sem overlap real de regex aqui, já que os padrões são
 * de string inteira, não substring — mantida por clareza e defesa):
 * `LATE_MORNING` antes de `MORNING`, `EARLY_AFTERNOON` antes de `AFTERNOON`,
 * `PRIMEIRA HORA DA TARDE` (EARLY_AFTERNOON) antes do sinônimo solto
 * `PRIMEIRA HORA` (FIRST_HOUR), e `PRIMEIRA HORA DA MANHA`/`FINAL DA TARDE`
 * antes dos genéricos de `MANHA`/`TARDE`.
 */
const PERIOD_PATTERNS: Array<[RegExp, DayPeriodCode]> = [
  [/^PRIMEIRA HORA DA MANHA$/, 'FIRST_HOUR'],
  [/^(FINAL DA TARDE|FIM DE TARDE)$/, 'END_OF_DAY'],
  [/^FINAL DA MANHA$/, 'LATE_MORNING'],
  [/^(INICIO DA TARDE|PRIMEIRA HORA DA TARDE)$/, 'EARLY_AFTERNOON'],
  [/^(PRIMEIRA HORA|PRIMEIRA HORA DO DIA)$/, 'FIRST_HOUR'],
  [/^MEIO DIA$/, 'MIDDAY'],
  [/^RECEBE O DIA INTEIRO$/, 'ALL_DAY'],
  [/^(PELA MANHA|DE MANHA)$/, 'MORNING'],
  [/^PELA TARDE$/, 'AFTERNOON'],
  [/^(PELA NOITE|A NOITE)$/, 'EVENING'],
];

type ParsedRest = Pick<TimeWindow, 'startTime' | 'endTime' | 'endsNextDay' | 'dayPeriodCode'> & {
  /** Trecho normalizado que o padrão consumiu — usado para saber se sobrou texto (vira note). */
  matchedText: string;
};

function buildRange(
  h1: string,
  m1: string,
  h2s: string,
  m2s: string,
  hasNextDaySuffix: boolean,
): Omit<ParsedRest, 'matchedText'> | null {
  let h2 = Number(h2s);
  const m2 = Number(m2s);
  if (h2 > 23 && m2 === 0) {
    // "24H00" — fim de dia escrito como meia-noite do próprio dia. Vira
    // "00:00" do dia seguinte (invariante: endTime nunca é "24:00").
    h2 = 0;
  } else if (h2 > 23) {
    return null;
  }
  const startTime = buildTime(h1, m1);
  const endTime = `${pad2(h2)}:${pad2(m2)}`;
  const endsNextDay = hasNextDaySuffix || toMinutes(endTime) < toMinutes(startTime);
  return { startTime, endTime, endsNextDay, dayPeriodCode: null };
}

/**
 * Casa o restante da string (depois da data, ou a string inteira quando não
 * há data nenhuma) contra as formas de horário/período, na ordem de
 * precedência combinada com dado real:
 *
 *   1. faixa HHhMM A HHhMM
 *   2. ATÉ AS / ANTES DAS (sinônimo) / A PARTIR DAS (ou "DA") / APÓS AS +
 *      hora (inclui "ATÉ O MEIO DIA" = 12h00)
 *   3. HHhMM sozinho — em qualquer posição da string, não só logo após a data
 *   4. PRIMEIRA HORA DA MANHÃ / PRIMEIRA HORA DA TARDE (antes dos genéricos)
 *   5. FINAL DA TARDE / FINAL DA MANHÃ (antes dos genéricos)
 *   6. MEIO DIA / RECEBE O DIA INTEIRO
 *   7. MANHÃ / TARDE / NOITE / PRIMEIRA HORA (sinônimo solto)
 *
 * Horário explícito sempre ganha de período nomeado quando os dois aparecem
 * na mesma célula (ex. "FINAL DA TARDE APÓS AS 18H00") — a invariante que
 * proíbe `dayPeriodCode` e horário juntos não muda; quem resolve o conflito é
 * o parser, não o tipo. Os passos 1–3 buscam o padrão em qualquer posição do
 * texto (não âncora a string inteira) exatamente para pegar esses casos
 * mistos; o texto que sobra ao redor não é descartado — sinaliza pro chamador
 * que a nota deve preservar a célula original inteira.
 */
function parseRest(rest: string): ParsedRest | null {
  const r = fixTypos(normalize(rest));

  // 1. RANGE — "00H00 A 02H00" (digitado) ou "DAS 00H00 AS 02H00 [DO DIA
  // SEGUINTE]" (saída de formatTimeWindow, reconhecida de volta no teste de
  // ida e volta). Busca em qualquer posição do texto.
  const rangeMatch = r.match(
    /(?:DAS\s+)?(\d{1,2})[H:](\d{1,2})\s+(?:AS|A)\s+(\d{1,2})[H:](\d{1,2})(?:\s+DO DIA SEGUINTE)?/,
  );
  if (rangeMatch) {
    const [matchedText, h1, m1, h2s, m2s] = rangeMatch;
    const hasNextDaySuffix = /DO DIA SEGUINTE$/.test(matchedText);
    const built = buildRange(h1, m1, h2s, m2s, hasNextDaySuffix);
    if (built) {
      return { ...built, matchedText };
    }
  }

  // 2a. "ATÉ O MEIO DIA" — meio-dia como referência de horário (12h00), não
  // o período MIDDAY (confirmado em dado real: "15/10 - ATE O MEIO DIA").
  const untilMiddayMatch = r.match(/ATE\s+O\s+MEIO\s+DIA/);
  if (untilMiddayMatch) {
    return {
      startTime: null,
      endTime: '12:00',
      endsNextDay: false,
      dayPeriodCode: null,
      matchedText: untilMiddayMatch[0],
    };
  }

  // 2b. UNTIL — "ATE AS 17H30" (digitado "ATÉ AS…" ou saída "até as…"), e o
  // sinônimo "ANTES DAS 17H00" (mesmo sentido: limite superior).
  const untilMatch = r.match(/(?:ATE|ANTES)\s+(?:AS|DAS)\s+(\d{1,2})[H:](\d{1,2})/);
  if (untilMatch) {
    const [matchedText, h, m] = untilMatch;
    return { startTime: null, endTime: buildTime(h, m), endsNextDay: false, dayPeriodCode: null, matchedText };
  }

  // 2c. FROM — "A PARTIR DAS 13H00" (digitado ou saída do formatter, com o
  // erro de digitação "A PARTIR DA", sem o "S", tolerado) ou "APOS [AS]
  // 17H00" (sinônimo digitado; format sempre emite "a partir das").
  const fromMatch = r.match(/(?:A PARTIR DAS?|APOS(?:\s+AS)?)\s+(\d{1,2})[H:](\d{1,2})/);
  if (fromMatch) {
    const [matchedText, h, m] = fromMatch;
    return { startTime: buildTime(h, m), endTime: null, endsNextDay: false, dayPeriodCode: null, matchedText };
  }

  // 3a. EXACT, casamento limpo (sem sobra) — "08H00" (digitado, sem prefixo)
  // ou "AS 08H00" (saída "às 08h00"). Âncora a string inteira: garante que a
  // saída de formatTimeWindow reconhece de volta sem gerar note.
  const exactAnchored = r.match(/^(?:AS\s+)?(\d{1,2})[H:](\d{1,2})$/);
  if (exactAnchored) {
    const [matchedText, h, m] = exactAnchored;
    const time = buildTime(h, m);
    return { startTime: time, endTime: time, endsNextDay: false, dayPeriodCode: null, matchedText };
  }

  // 3b. EXACT embutido em qualquer posição da string (sobra vira note) — ex.
  // "SE APRESENTAR AS 17H30", "AGENDAMENTO EXPRESSO AS 18H00". Só chega
  // aqui depois que faixa/até/a-partir-de/após já tentaram e falharam, então
  // não há risco de reinterpretar um conector reconhecido como EXACT solto.
  const exactEmbedded = r.match(/(\d{1,2})[Hh:](\d{1,2})/);
  if (exactEmbedded) {
    const [matchedText, h, m] = exactEmbedded;
    const time = buildTime(h, m);
    return { startTime: time, endTime: time, endsNextDay: false, dayPeriodCode: null, matchedText };
  }

  // 4–7. Período do dia — só chega aqui se não há horário explícito nenhum.
  // Padrões de string inteira (sem sobra possível): se bater, `matchedText`
  // é a própria `r`.
  for (const [pattern, code] of PERIOD_PATTERNS) {
    if (pattern.test(r)) {
      return { startTime: null, endTime: null, endsNextDay: false, dayPeriodCode: code, matchedText: r };
    }
  }

  return null;
}

function fallback(raw: string, date: string): TimeWindow {
  return {
    date,
    startTime: null,
    endTime: null,
    endsNextDay: false,
    dayPeriodCode: null,
    note: raw,
  };
}

/**
 * Formas confirmadas em dado real que são DELIBERADAMENTE deixadas em
 * fallback — não são janela de tempo, mesmo reconhecendo o texto. Não há
 * regra de parsing pra elas porque estruturar errado é pior que não
 * estruturar (perderia a distinção). Documentado aqui, não só no teste de
 * fixture, porque é aqui que a decisão de NÃO parsear é tomada:
 *
 * - Ordem da perna dentro do pedido, não horário: "PRIMEIRA/SEGUNDA/
 *   TERCEIRA/ULTIMA DE QUINTA" (e "DE SEXTA"), ordinais soltos ("PRIMEIRO",
 *   "SEGUNDO"...), "PRIMEIRA ENTREGA"/"SEGUNDA ENTREGA". É `Trip.sequence`
 *   (D-037, transbordo) — o operador está registrando qual perna do pedido é
 *   essa, não quando ela acontece. Confirmado em dado real que esse campo é
 *   usado hoje pra isso por falta de lugar próprio (reforça D-037, pendência
 *   nova registrada em `decisoes.md`). Quando um ordinal aparece JUNTO de um
 *   horário explícito (ex. "PRIMEIRO AS 07H30"), o horário É extraído — o
 *   ordinal sozinho é que nunca vira campo estruturado.
 * - Dependência de evento, não horário: "LOGO APÓS A DESCARGA", "PÓS
 *   COLETA", "EM ATÉ 48 HORAS APÓS A COLETA", "SEM PREVISAO", "LIBERADO",
 *   "LIBERADO PARA COLETA", "COLETADO PELA TRANSPORTADORA UPS", "ENVIADO
 *   PELA TDR", "ALINHAMENTO NELSO E TDR". É status da viagem/`Occurrence`,
 *   não uma janela — depende de outro evento acontecer primeiro, não de uma
 *   data/hora fixa.
 * - Regra do local, não da carga: "ORDEM DE CHEGADA" — é horário de
 *   funcionamento/regra de atendimento do `Address`, que hoje não existe no
 *   modelo (D-027 já lista isso como conteúdo da ordem de coleta; pendência
 *   nova registrada em `decisoes.md`). "RECEBE O DIA INTEIRO" NÃO entra
 *   aqui — vira `dayPeriodCode: 'ALL_DAY'` (é, de fato, uma janela: o dia
 *   inteiro é uma precisão válida, só mais larga).
 * - Data alternativa, decisão deliberada de não modelar: "05/03 OU 06/03",
 *   "09/01 - PELA MANHÃ OU 10/01 - PELA MANHÃ". Duas datas candidatas
 *   viraria lista e poluiria toda consulta por dia — o parser ancora na
 *   PRIMEIRA data (comportamento natural do fallback: a data já é
 *   reconhecida antes do "OU", o resto da string não bate com nenhuma forma
 *   de horário/período, então cai em note com a data da primeira ocorrência
 *   preenchida) e preserva a string inteira pra revisão humana.
 */

/**
 * Lê o que o operador digitou (ou o que `formatTimeWindow` devolveu, para o
 * caso de ida e volta) e estrutura numa `TimeWindow`.
 *
 * Nunca lança. Entrada não reconhecida vai inteira para `note`, com `date`
 * preenchida quando reconhecível e os demais campos nulos — perder o que o
 * operador digitou é pior que não estruturar. Quando o horário é reconhecido
 * mas sobra texto ao redor (período nomeado junto de horário explícito, mês
 * implausível, ou não há data alguma na célula), os campos estruturados são
 * preenchidos E a célula original inteira também vai pra `note` — não é
 * fallback total, é estruturação parcial.
 */
export function parseTimeWindow(input: string, referenceYear: number): TimeWindow {
  const raw = input ?? '';
  const trimmed = raw.trim();

  if (trimmed === '') {
    return fallback(raw, '');
  }

  // Data crua do Excel: "2025-07-03" ou "2025-07-03 00:00:00". Sem separador
  // " - ", forma inteiramente diferente das demais.
  const isoMatch = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?$/,
  );
  if (isoMatch) {
    const [, year, month, day, h, m, s] = isoMatch;
    if (isPlausibleDate(Number(day), Number(month))) {
      const date = `${year}-${month}-${day}`;
      const hasRealTime = h !== undefined && !(h === '00' && m === '00' && s === '00');
      if (hasRealTime) {
        const time = buildTime(h, m);
        return { date, startTime: time, endTime: time, endsNextDay: false, dayPeriodCode: null, note: null };
      }
      return { date, startTime: null, endTime: null, endsNextDay: false, dayPeriodCode: null, note: null };
    }
    return fallback(raw, '');
  }

  // "DD/MM" isolado (sem parte de horário) — forma que o próprio
  // formatTimeWindow produz para precisão DAY, e que o operador também pode
  // digitar sozinha.
  const bareDate = trimmed.match(/^(\d{2})\/(\d{2})$/);
  if (bareDate) {
    const [, dd, mm] = bareDate;
    if (isPlausibleDate(Number(dd), Number(mm))) {
      const date = `${referenceYear}-${mm}-${dd}`;
      return { date, startTime: null, endTime: null, endsNextDay: false, dayPeriodCode: null, note: null };
    }
    return fallback(raw, '');
  }

  // "DD/MM [- ,]? resto" — separador opcional: "DD/MM - resto" e "DD/MM,
  // resto" (saída de formatTimeWindow) continuam funcionando, e "DD/MM
  // resto" (sem hífen nenhum, confirmado em dado real) também passa a bater.
  const withRest = trimmed.match(/^(\d{2})\/(\d{2})\s*[-,]?\s*(.+)$/);
  if (withRest) {
    const [, dd, mm, rest] = withRest;
    const datePlausible = isPlausibleDate(Number(dd), Number(mm));
    const date = datePlausible ? `${referenceYear}-${mm}-${dd}` : '';
    const parsedRest = parseRest(rest);
    if (parsedRest !== null) {
      const { matchedText, ...fields } = parsedRest;
      const candidate: TimeWindow = { date, note: null, ...fields };
      if (validateTimeWindow(candidate).length === 0) {
        // Sobrou texto ao redor do horário/período reconhecido (período
        // nomeado junto de horário explícito, ou mês implausível — data
        // fica nula mas a hora foi extraída mesmo assim) — estruturação
        // parcial: os campos ficam preenchidos, mas a célula inteira também
        // vai pra note.
        const isCleanMatch = datePlausible && fixTypos(normalize(rest)) === matchedText;
        return isCleanMatch ? candidate : { ...candidate, note: raw };
      }
    }
    if (datePlausible) {
      // Data reconhecida, mas o restante não bateu com nenhuma forma
      // conhecida (ex. ordinal solto, dependência de evento, data
      // alternativa "OU") — guarda a data, o resto vai inteiro pra nota.
      return fallback(raw, date);
    }
    // Nem data plausível, nem horário no resto — cai no último recurso
    // abaixo (busca na string inteira), que ainda pode achar algo solto
    // fora do formato "DD/MM ...".
  }

  // Última tentativa: busca a string INTEIRA por horário/período embutido,
  // sem nenhuma data reconhecida antes dela — cobre células sem prefixo de
  // data nenhum, como "(RECEBIMENTO DAS 07H00 A 17H00)".
  const wholeMatch = parseRest(trimmed);
  if (wholeMatch !== null) {
    const { matchedText, ...fields } = wholeMatch;
    const candidate: TimeWindow = { date: '', note: null, ...fields };
    if (validateTimeWindow(candidate).length === 0) {
      // Sem data, sempre sobra pelo menos o texto descritivo ao redor —
      // preserva a célula inteira.
      return { ...candidate, note: raw };
    }
  }

  return fallback(raw, '');
}
