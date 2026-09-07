import PDFDocument from 'pdfkit';

// Documento operacional (D-022, D-027): densidade, sem enfeite, legível
// impresso em preto e branco. Fonte de largura fixa (Courier) nas colunas
// numéricas — mesma razão do tabular-nums exigido em toda coluna numérica
// de tela: dígito de largura variável não alinha, e uma coluna que não
// alinha é mais lenta de escanear.
const PAGE_MARGIN = 40;
const LABEL_FONT = 'Helvetica';
const LABEL_BOLD_FONT = 'Helvetica-Bold';
const NUMERIC_FONT = 'Courier';

const SIZE_TITLE = 14;
const SIZE_SECTION = 9;
const SIZE_LABEL = 8;
const SIZE_BODY = 8.5;

export interface PickupOrderPdfAddress {
  logradouro: string;
  numero: string | null;
  complemento: string | null;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
}

export interface PickupOrderPdfItem {
  description: string;
  quantity: number;
  weightKg: string | null;
}

export interface PickupOrderPdfData {
  pickupDate: Date;
  locationLabel: string | null;
  pickupWindow: string | null;
  businessHours: string | null;
  totalWeightKg: string;
  totalVolumeCount: number;
  totalCubicMeters: string;
  laborNote: string | null;
  nfeReference: string | null;
  romaneioReference: string | null;
  address: PickupOrderPdfAddress;
  sender: { name: string };
  recipient: { name: string };
  tomador: { name: string };
  driver: { name: string; cpf: string; cnhNumber: string; cnhCategory: string };
  vehicle: { plate: string };
  trailer1: { plate: string } | null;
  trailer2: { plate: string } | null;
  items: PickupOrderPdfItem[];
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function formatAddress(a: PickupOrderPdfAddress): string {
  return [
    `${a.logradouro}${a.numero ? `, ${a.numero}` : ''}`,
    a.complemento ?? '',
    a.bairro,
    `${a.municipio}/${a.uf}`,
    `CEP ${a.cep}`,
  ]
    .filter((part) => part.length > 0)
    .join(' — ');
}

// Fluxo vertical: cada bloco pergunta se cabe (ensure), desenha, e o
// cursor avança pra onde o bloco terminou. Quando não cabe, quebra de
// página e redesenha o cabeçalho de identificação — layout com altura
// fixa quebraria assim que o conteúdo real variar (1 item vs. 40).
class PdfFlow {
  y: number;
  readonly contentWidth: number;
  readonly contentLeft = PAGE_MARGIN;

  // Só setado quando a seção de itens começa — uma quebra de página
  // antes disso (ex.: no bloco "Motorista e veículo") não deve redesenhar
  // cabeçalho de coluna de uma tabela que ainda nem começou.
  onContinuedPage: (() => void) | null = null;

  constructor(
    private readonly doc: PDFKit.PDFDocument,
    private readonly data: PickupOrderPdfData,
  ) {
    this.contentWidth = doc.page.width - PAGE_MARGIN * 2;
    this.y = PAGE_MARGIN;
    this.drawIdentificationHeader(false);
  }

  private drawIdentificationHeader(continued: boolean) {
    const { doc, data } = this;
    doc
      .font(LABEL_BOLD_FONT)
      .fontSize(SIZE_TITLE)
      .text(
        `ORDEM DE COLETA${continued ? ' (continuação)' : ''}`,
        this.contentLeft,
        PAGE_MARGIN,
        { width: this.contentWidth },
      );
    this.y = doc.y + 2;

    const subtitle = `${formatDate(data.pickupDate)} — ${data.sender.name} — ${data.address.municipio}/${data.address.uf}`;
    doc
      .font(LABEL_FONT)
      .fontSize(SIZE_BODY)
      .text(subtitle, this.contentLeft, this.y, { width: this.contentWidth });
    this.y = doc.y + 6;

    doc
      .moveTo(this.contentLeft, this.y)
      .lineTo(this.contentLeft + this.contentWidth, this.y)
      .lineWidth(0.75)
      .stroke();
    this.y += 10;

    if (continued && this.onContinuedPage) {
      this.onContinuedPage();
    }
  }

  // Garante que o bloco cabe antes de desenhar. Se não couber, quebra a
  // página e redesenha o cabeçalho de identificação — nunca desenha
  // parcialmente pra descobrir depois que não cabia (isso é o que corta
  // texto).
  ensure(height: number) {
    const bottom = this.doc.page.height - PAGE_MARGIN;
    if (this.y + height > bottom) {
      this.doc.addPage();
      this.drawIdentificationHeader(true);
    }
  }

  advanceTo(y: number) {
    this.y = y;
  }
}

function drawSectionTitle(doc: PDFKit.PDFDocument, flow: PdfFlow, title: string) {
  flow.ensure(16);
  doc
    .font(LABEL_BOLD_FONT)
    .fontSize(SIZE_SECTION)
    .text(title, flow.contentLeft, flow.y, { width: flow.contentWidth });
  flow.advanceTo(doc.y + 4);
}

function drawField(
  doc: PDFKit.PDFDocument,
  flow: PdfFlow,
  label: string,
  value: string | null | undefined,
) {
  if (!value) return;
  const text = `${label}: ${value}`;
  const height = doc
    .font(LABEL_FONT)
    .fontSize(SIZE_BODY)
    .heightOfString(text, { width: flow.contentWidth });
  flow.ensure(height + 2);
  doc
    .font(LABEL_BOLD_FONT)
    .text(`${label}: `, flow.contentLeft, flow.y, { continued: true, width: flow.contentWidth })
    .font(LABEL_FONT)
    .text(value);
  flow.advanceTo(doc.y + 2);
}

// Colunas da tabela de itens — largura fixa, mesma posição em toda página
// (cabeçalho de coluna redesenhado a cada quebra).
const COL_DESCRIPTION_WIDTH_RATIO = 0.6;
const COL_QUANTITY_WIDTH_RATIO = 0.18;
const ROW_MIN_HEIGHT = 14;

function itemColumns(flow: PdfFlow) {
  const descriptionWidth = flow.contentWidth * COL_DESCRIPTION_WIDTH_RATIO;
  const quantityWidth = flow.contentWidth * COL_QUANTITY_WIDTH_RATIO;
  const weightWidth = flow.contentWidth - descriptionWidth - quantityWidth;
  return {
    descriptionX: flow.contentLeft,
    descriptionWidth,
    quantityX: flow.contentLeft + descriptionWidth,
    quantityWidth,
    weightX: flow.contentLeft + descriptionWidth + quantityWidth,
    weightWidth,
  };
}

// Só o desenho, sem checar espaço — chamada em dois contextos distintos
// (ver drawItemsTableHeader e PdfFlow.onContinuedPage) que já garantem
// espaço antes de chamar, cada um do seu jeito. Duplicar a checagem aqui
// causaria quebra de página dentro de uma quebra de página já em
// andamento (onContinuedPage chamando de volta ensure()), desenhando o
// cabeçalho duas vezes.
function drawItemsTableHeaderContent(doc: PDFKit.PDFDocument, flow: PdfFlow) {
  const cols = itemColumns(flow);
  doc.font(LABEL_BOLD_FONT).fontSize(SIZE_LABEL);
  doc.text('Descrição', cols.descriptionX, flow.y, { width: cols.descriptionWidth });
  doc.text('Qtde', cols.quantityX, flow.y, { width: cols.quantityWidth, align: 'right' });
  doc.text('Peso (kg)', cols.weightX, flow.y, { width: cols.weightWidth, align: 'right' });
  flow.advanceTo(flow.y + ROW_MIN_HEIGHT);
  doc
    .moveTo(flow.contentLeft, flow.y - 2)
    .lineTo(flow.contentLeft + flow.contentWidth, flow.y - 2)
    .lineWidth(0.5)
    .stroke();
}

// Chamada só ao entrar na seção de itens: garante espaço pro cabeçalho
// (pode, ela mesma, disparar uma quebra de página — nesse caso
// onContinuedPage já desenha o cabeçalho na página nova, e não há nada
// mais a fazer aqui).
function drawItemsTableHeader(doc: PDFKit.PDFDocument, flow: PdfFlow) {
  const yBefore = flow.y;
  flow.ensure(ROW_MIN_HEIGHT + 4);
  if (flow.y !== yBefore) return; // quebrou de página — onContinuedPage já desenhou
  drawItemsTableHeaderContent(doc, flow);
}

function drawItemRow(doc: PDFKit.PDFDocument, flow: PdfFlow, item: PickupOrderPdfItem) {
  const cols = itemColumns(flow);
  const descHeight = doc
    .font(LABEL_FONT)
    .fontSize(SIZE_BODY)
    .heightOfString(item.description, { width: cols.descriptionWidth });
  const rowHeight = Math.max(ROW_MIN_HEIGHT, descHeight + 4);

  flow.ensure(rowHeight);
  const rowY = flow.y;
  doc
    .font(LABEL_FONT)
    .fontSize(SIZE_BODY)
    .text(item.description, cols.descriptionX, rowY, { width: cols.descriptionWidth });
  doc
    .font(NUMERIC_FONT)
    .fontSize(SIZE_BODY)
    .text(String(item.quantity), cols.quantityX, rowY, {
      width: cols.quantityWidth,
      align: 'right',
    });
  doc
    .font(NUMERIC_FONT)
    .text(item.weightKg ?? '—', cols.weightX, rowY, {
      width: cols.weightWidth,
      align: 'right',
    });
  flow.advanceTo(rowY + rowHeight);
}

function drawTotalsRow(doc: PDFKit.PDFDocument, flow: PdfFlow, data: PickupOrderPdfData) {
  const height = 14;
  flow.ensure(height + 4);
  const colWidth = flow.contentWidth / 3;
  doc.font(LABEL_BOLD_FONT).fontSize(SIZE_LABEL);
  doc.text('Peso total (kg)', flow.contentLeft, flow.y, { width: colWidth });
  doc.text('Volumes', flow.contentLeft + colWidth, flow.y, { width: colWidth });
  doc.text('Cubagem (m³)', flow.contentLeft + colWidth * 2, flow.y, { width: colWidth });
  flow.advanceTo(doc.y + 2);

  flow.ensure(height);
  doc.font(NUMERIC_FONT).fontSize(SIZE_BODY);
  doc.text(data.totalWeightKg, flow.contentLeft, flow.y, { width: colWidth });
  doc.text(String(data.totalVolumeCount), flow.contentLeft + colWidth, flow.y, { width: colWidth });
  doc.text(data.totalCubicMeters, flow.contentLeft + colWidth * 2, flow.y, { width: colWidth });
  flow.advanceTo(doc.y + 8);
}

// Gera o PDF em memória (sem gravar em disco — só sob demanda, na
// resposta HTTP, ver docs/decisoes.md D-034). Devolve um Buffer: a
// aplicação nunca faz storage de arquivo pra ordem de coleta.
export function buildPickupOrderPdf(data: PickupOrderPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => {
      // Numera as páginas só depois de todo o conteúdo existir — o total
      // só é conhecido no final (bufferPages: true segura as páginas
      // abertas pra isso).
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc
          .font(LABEL_FONT)
          .fontSize(SIZE_LABEL)
          .text(
            `Página ${i + 1} de ${range.count}`,
            PAGE_MARGIN,
            doc.page.height - PAGE_MARGIN + 10,
            { width: doc.page.width - PAGE_MARGIN * 2, align: 'right' },
          );
      }
      resolve(Buffer.concat(chunks));
    });

    const flow = new PdfFlow(doc, data);

    drawSectionTitle(doc, flow, 'Coleta');
    drawField(doc, flow, 'Endereço', formatAddress(data.address));
    drawField(doc, flow, 'Referência do local', data.locationLabel ?? undefined);
    drawField(doc, flow, 'Janela de coleta', data.pickupWindow ?? undefined);
    drawField(doc, flow, 'Horário de funcionamento', data.businessHours ?? undefined);

    drawSectionTitle(doc, flow, 'Partes');
    drawField(doc, flow, 'Remetente', data.sender.name);
    drawField(doc, flow, 'Destinatário', data.recipient.name);
    drawField(doc, flow, 'Tomador', data.tomador.name);

    drawSectionTitle(doc, flow, 'Motorista e veículo');
    drawField(
      doc,
      flow,
      'Motorista',
      `${data.driver.name} — CPF ${data.driver.cpf} — CNH ${data.driver.cnhNumber} (${data.driver.cnhCategory})`,
    );
    const composition = [data.vehicle.plate, data.trailer1?.plate, data.trailer2?.plate]
      .filter((plate): plate is string => Boolean(plate))
      .join(' + ');
    drawField(doc, flow, 'Composição', composition);

    drawSectionTitle(doc, flow, 'Referências');
    drawField(doc, flow, 'Nota fiscal', data.nfeReference ?? undefined);
    drawField(doc, flow, 'Romaneio', data.romaneioReference ?? undefined);

    drawSectionTitle(doc, flow, 'Totais');
    drawTotalsRow(doc, flow, data);

    drawField(doc, flow, 'Mão de obra', data.laborNote ?? undefined);

    drawSectionTitle(doc, flow, 'Itens');
    flow.onContinuedPage = () => drawItemsTableHeaderContent(doc, flow);
    drawItemsTableHeader(doc, flow);
    for (const item of data.items) {
      drawItemRow(doc, flow, item);
    }

    doc.end();
  });
}
