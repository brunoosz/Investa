import ExcelJS from "exceljs";
import type { MonthSummary } from "@shared/finance";
import type { Invoice } from "@shared/types";
import { PAYMENT_LABEL, ymLabel } from "@shared/finance";
import { institutionLabel } from "@shared/banks";
import { logoMarkSvg } from "@shared/brand";

export interface ReportInput {
  userName: string;
  summary: MonthSummary;
  salary: number;
  extraIncomeProfile: number;
  invoices: Invoice[];
  /** Análise escrita pelo Assistente (Markdown), quando pedida. */
  aiAnalysis?: string;
}

/** Markdown simples (títulos, listas, negrito) para HTML. */
export function markdownToHtml(md: string): string {
  const inline = (t: string) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<i>$1</i>");
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let table: string[][] = [];
  const flushTable = () => {
    if (!table.length) return;
    const [head, ...rows] = table;
    out.push(
      `<table class="md"><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`
    );
    table = [];
  };
  const close = () => {
    if (list) out.push(`</${list}>`);
    list = null;
    flushTable();
  };
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    if (!line) {
      close();
      continue;
    }
    if (line.startsWith("|")) {
      if (list) {
        out.push(`</${list}>`);
        list = null;
      }
      // Linha separadora "|---|---|" não vira linha da tabela.
      if (!/^\|[\s:|-]+\|?$/.test(line)) table.push(tableCells(line));
      continue;
    }
    flushTable();
    const h = /^#{1,4}\s+(.*)$/.exec(line);
    const ul = /^[-*•]\s+(.*)$/.exec(line);
    const ol = /^\d+[.)]\s+(.*)$/.exec(line);
    if (h) {
      close();
      out.push(`<h3>${inline(h[1])}</h3>`);
    } else if (ul || ol) {
      const kind = ul ? "ul" : "ol";
      if (list !== kind) {
        close();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline((ul ?? ol)![1])}</li>`);
    } else if (!line.startsWith("|")) {
      close();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  close();
  return out.join("");
}

function tableCells(line: string): string[] {
  return line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

/** Markdown para texto corrido (planilha e PDF do celular). */
export function markdownToText(md: string): string[] {
  return md
    .split("\n")
    .map((l) => l.trim().replace(/^#{1,4}\s+/, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/^[-*•]\s+/, "• "))
    .filter((l) => l && !/^\|[\s:|-]+\|?$/.test(l))
    .map((l) => (l.startsWith("|") ? tableCells(l).join("  ·  ") : l));
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brDate = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const BRL_FMT = '"R$" #,##0.00;[Red]-"R$" #,##0.00';

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function buildExcel(input: ReportInput): Promise<Uint8Array> {
  const { summary } = input;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Investa";
  wb.created = new Date();

  const header = (row: ExcelJS.Row) => {
    row.eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F8CFF" } };
      c.alignment = { vertical: "middle" };
    });
    row.height = 22;
  };

  const resumo = wb.addWorksheet("Resumo", { views: [{ showGridLines: false }] });
  resumo.columns = [{ width: 34 }, { width: 20 }, { width: 14 }];
  resumo.mergeCells("A1:C1");
  resumo.getCell("A1").value = `Investa — Relatório de ${ymLabel(summary.ym)}`;
  resumo.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF0B0F1A" } };
  resumo.getCell("A2").value = `${input.userName} · gerado em ${new Date().toLocaleString("pt-BR")}`;
  resumo.getCell("A2").font = { color: { argb: "FF64748B" } };
  resumo.addRow([]);
  header(resumo.addRow(["Resumo do mês", "Valor", ""]));
  const kpis: [string, number][] = [
    ["Renda mensal (perfil)", summary.income],
    ["Entradas extras (à parte da renda)", summary.extraIncome],
    ["Total gasto no mês", summary.spent],
    ["Sobra da renda fixa", summary.balance],
  ];
  for (const [k, v] of kpis) {
    const r = resumo.addRow([k, v]);
    r.getCell(2).numFmt = BRL_FMT;
  }
  resumo.addRow([]);
  header(resumo.addRow(["Gastos por categoria", "Total", "% do total"]));
  for (const c of summary.byCategory) {
    const r = resumo.addRow([c.category, c.total, summary.spent ? c.total / summary.spent : 0]);
    r.getCell(2).numFmt = BRL_FMT;
    r.getCell(3).numFmt = "0.0%";
  }
  resumo.addRow([]);
  header(resumo.addRow(["Gastos por banco / instituição", "Total", ""]));
  for (const b of summary.byInstitution) {
    const r = resumo.addRow([institutionLabel(b.institution), b.total]);
    r.getCell(2).numFmt = BRL_FMT;
  }
  if (summary.futureInstallments.length) {
    resumo.addRow([]);
    header(resumo.addRow(["Parcelas dos próximos meses", "Total", ""]));
    for (const f of summary.futureInstallments) {
      const r = resumo.addRow([ymLabel(f.ym), f.total]);
      r.getCell(2).numFmt = BRL_FMT;
    }
  }

  const lanc = wb.addWorksheet("Lançamentos", { views: [{ state: "frozen", ySplit: 1 }] });
  lanc.columns = [
    { header: "Data", key: "date", width: 12 },
    { header: "Descrição", key: "desc", width: 34 },
    { header: "Tipo", key: "type", width: 11 },
    { header: "Categoria", key: "cat", width: 16 },
    { header: "Pagamento", key: "method", width: 14 },
    { header: "Banco", key: "bank", width: 18 },
    { header: "Parcela", key: "inst", width: 10 },
    { header: "Valor no mês", key: "value", width: 16 },
    { header: "Valor total", key: "total", width: 16 },
  ];
  header(lanc.getRow(1));
  for (const e of summary.entries) {
    const r = lanc.addRow({
      date: brDate(e.expense.date),
      desc: e.expense.description,
      type: e.expense.type === "receita" ? "Entrada extra" : "Despesa",
      cat: e.expense.category,
      method: PAYMENT_LABEL[e.expense.method],
      bank: institutionLabel(e.expense.institution),
      inst: e.totalInstallments > 1 ? `${e.installment}/${e.totalInstallments}` : "à vista",
      value: e.expense.type === "receita" ? e.amount : -e.amount,
      total: e.expense.amount,
    });
    r.getCell("value").numFmt = BRL_FMT;
    r.getCell("total").numFmt = BRL_FMT;
  }
  lanc.autoFilter = { from: "A1", to: "I1" };

  const invoices = input.invoices.filter((i) => i.ym === summary.ym);
  if (invoices.length) {
    const fat = wb.addWorksheet("Faturas");
    fat.columns = [
      { header: "Banco / cartão", key: "bank", width: 24 },
      { header: "Valor", key: "amount", width: 16 },
      { header: "Vencimento", key: "due", width: 12 },
      { header: "Mínimo", key: "min", width: 14 },
      { header: "Situação", key: "status", width: 12 },
    ];
    header(fat.getRow(1));
    for (const i of invoices) {
      const r = fat.addRow({ bank: institutionLabel(i.institution), amount: i.amount, due: i.dueDay ? `dia ${i.dueDay}` : "", min: i.minimumPayment ?? null, status: i.paid ? "Paga" : "Em aberto" });
      r.getCell("amount").numFmt = BRL_FMT;
      r.getCell("min").numFmt = BRL_FMT;
    }
  }

  if (input.aiAnalysis) {
    const an = wb.addWorksheet("Análise do Assistente", { views: [{ showGridLines: false }] });
    an.columns = [{ width: 110 }];
    an.getCell("A1").value = "Análise do Assistente";
    an.getCell("A1").font = { bold: true, size: 14 };
    for (const line of markdownToText(input.aiAnalysis).map(latin1)) {
      const r = an.addRow([line]);
      r.getCell(1).alignment = { wrapText: true, vertical: "top" };
    }
  }

  return new Uint8Array(await wb.xlsx.writeBuffer());
}

export function buildReportHtml(input: ReportInput): string {
  const { summary } = input;
  const max = Math.max(1, ...summary.byCategory.map((c) => c.total));
  const palette = ["#4F8CFF", "#A78BFA", "#34D399", "#FBBF24", "#F87171", "#22D3EE", "#F472B6", "#94A3B8"];
  const catRows = summary.byCategory
    .map(
      (c, i) => `<tr><td><span class="dot" style="background:${palette[i % palette.length]}"></span>${esc(c.category)}</td>
      <td class="bar"><div style="width:${(c.total / max) * 100}%;background:${palette[i % palette.length]}"></div></td>
      <td class="num">${brl(c.total)}</td><td class="num muted">${summary.spent ? ((c.total / summary.spent) * 100).toFixed(1).replace(".", ",") : "0"}%</td></tr>`
    )
    .join("");
  const entryRows = summary.entries
    .map(
      (e) => `<tr><td>${brDate(e.expense.date)}</td><td>${esc(e.expense.description)}</td><td>${esc(e.expense.category)}</td>
      <td>${PAYMENT_LABEL[e.expense.method]}</td><td>${esc(institutionLabel(e.expense.institution))}</td>
      <td>${e.totalInstallments > 1 ? `${e.installment}/${e.totalInstallments}` : "à vista"}</td>
      <td class="num ${e.expense.type === "receita" ? "pos" : ""}">${e.expense.type === "receita" ? "+" : "−"} ${brl(e.amount)}</td></tr>`
    )
    .join("");
  const future = summary.futureInstallments.map((f) => `<tr><td>${ymLabel(f.ym)}</td><td class="num">${brl(f.total)}</td></tr>`).join("");
  const invoiceRows = input.invoices
    .filter((i) => i.ym === summary.ym)
    .map(
      (i) =>
        `<tr><td>${esc(institutionLabel(i.institution))}</td><td>${i.dueDay ? `dia ${i.dueDay}` : "—"}</td><td>${i.paid ? "Paga" : "Em aberto"}</td><td class="num">${brl(i.amount)}</td></tr>`
    )
    .join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório ${ymLabel(summary.ym)}</title>
<style>
  *{box-sizing:border-box} body{font-family:"Segoe UI",Inter,system-ui,sans-serif;color:#0B0F1A;margin:0;font-size:11px}
  .hero{background:linear-gradient(135deg,#0B0F1A,#1A1F2E);color:#F8FAFC;padding:28px 32px;border-radius:0 0 18px 18px}
  .brand{display:flex;align-items:center;gap:10px} .brand b{font-size:20px;letter-spacing:-.3px}
  .tag{font-size:8px;letter-spacing:3px;color:#94A3B8;margin-top:2px}
  h1{font-size:22px;margin:18px 0 2px} .sub{color:#94A3B8}
  .wrap{padding:22px 32px}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px}
  .kpi{border:1px solid #E2E8F0;border-radius:12px;padding:12px} .kpi span{color:#64748B;font-size:9px;text-transform:uppercase;letter-spacing:.6px}
  .kpi strong{display:block;font-size:16px;margin-top:4px} .pos{color:#059669} .neg{color:#DC2626}
  h2{font-size:13px;margin:18px 0 8px}
  table{width:100%;border-collapse:collapse} td,th{padding:6px 8px;border-bottom:1px solid #EEF2F7;text-align:left;vertical-align:middle}
  th{font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:#64748B;background:#F8FAFC}
  .num{text-align:right;white-space:nowrap} .muted{color:#64748B}
  .bar{width:40%} .bar div{height:8px;border-radius:6px}
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}
  .ai{border:1px solid #DDE6FF;background:#F5F8FF;border-radius:12px;padding:12px 16px;line-height:1.5}
  .ai h3{font-size:12px;margin:10px 0 4px} .ai p{margin:6px 0} .ai ul,.ai ol{margin:4px 0;padding-left:18px}
  footer{margin-top:22px;color:#94A3B8;font-size:9px;text-align:center}
</style></head><body>
<div class="hero"><div class="brand">${logoMarkSvg(30, "pdfg")}<div><b>Investa</b><div class="tag">APRENDA · INVISTA · EVOLUA</div></div></div>
<h1>Relatório de gastos — ${ymLabel(summary.ym)}</h1><div class="sub">${esc(input.userName)} · gerado em ${new Date().toLocaleString("pt-BR")}</div></div>
<div class="wrap">
<div class="kpis">
  <div class="kpi"><span>Renda fixa do mês</span><strong>${brl(summary.income)}</strong>${summary.extraIncome ? `<span>+ ${brl(summary.extraIncome)} extras à parte</span>` : ""}</div>
  <div class="kpi"><span>Total gasto</span><strong class="neg">${brl(summary.spent)}</strong></div>
  <div class="kpi"><span>Saldo</span><strong class="${summary.balance >= 0 ? "pos" : "neg"}">${brl(summary.balance)}</strong></div>
  <div class="kpi"><span>Lançamentos</span><strong>${summary.entries.length}</strong></div>
</div>
${input.aiAnalysis ? `<h2>Análise do Assistente</h2><div class="ai">${markdownToHtml(input.aiAnalysis)}</div>` : ""}
<h2>Gastos por categoria</h2>
<table>${catRows || '<tr><td class="muted">Nenhum gasto neste mês.</td></tr>'}</table>
${invoiceRows ? `<h2>Faturas dos cartões</h2><table><thead><tr><th>Banco</th><th>Vencimento</th><th>Situação</th><th class="num">Valor</th></tr></thead><tbody>${invoiceRows}</tbody></table>` : ""}
${future ? `<h2>Parcelas dos próximos meses</h2><table>${future}</table>` : ""}
<h2>Lançamentos</h2>
<table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Pagamento</th><th>Banco</th><th>Parcela</th><th class="num">Valor</th></tr></thead>
<tbody>${entryRows || '<tr><td colspan="7" class="muted">Nenhum lançamento.</td></tr>'}</tbody></table>
<footer>Relatório gerado pelo aplicativo Investa.</footer>
</div></body></html>`;
}

/** PDF montado sem navegador, para o celular. */
export async function buildPdf(input: ReportInput): Promise<Uint8Array> {
  const { jsPDF } = await import("jspdf");
  const { summary } = input;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  let y = 0;
  const ensure = (h: number) => {
    if (y + h > H - M) {
      doc.addPage();
      y = M;
    }
  };
  doc.setFillColor(11, 15, 26);
  doc.rect(0, 0, W, 96, "F");
  doc.setTextColor(248, 250, 252);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Investa", M, 40);
  doc.setFontSize(14);
  doc.text(`Relatório de gastos — ${ymLabel(summary.ym)}`, M, 64);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text(`${input.userName} · gerado em ${new Date().toLocaleString("pt-BR")}`, M, 82);
  y = 124;
  doc.setTextColor(11, 15, 26);
  const kpis: [string, string][] = [
    ["Renda fixa do mês", brl(summary.income)],
    ["Total gasto", brl(summary.spent)],
    ["Saldo", brl(summary.balance)],
    ["Lançamentos", String(summary.entries.length)],
  ];
  const kw = (W - 2 * M) / 4;
  kpis.forEach(([k, v], i) => {
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(k.toUpperCase(), M + i * kw, y);
    doc.setFontSize(13);
    doc.setTextColor(11, 15, 26);
    doc.text(v, M + i * kw, y + 18);
  });
  y += 44;
  const title = (t: string) => {
    ensure(30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(t, M, y);
    doc.setFont("helvetica", "normal");
    y += 16;
  };
  const row = (cols: string[], widths: number[], opts: { bold?: boolean; muted?: boolean } = {}) => {
    ensure(16);
    doc.setFontSize(9);
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    if (opts.muted) doc.setTextColor(100, 116, 139);
    else doc.setTextColor(11, 15, 26);
    let x = M;
    cols.forEach((c, i) => {
      const right = i === cols.length - 1;
      const text = doc.splitTextToSize(latin1(c), widths[i] - 6)[0] ?? "";
      doc.text(text, right ? x + widths[i] : x, y, { align: right ? "right" : "left" });
      x += widths[i];
    });
    y += 15;
  };
  if (input.aiAnalysis) {
    title("Análise do Assistente");
    doc.setFontSize(9.5);
    for (const line of markdownToText(input.aiAnalysis)) {
      for (const part of doc.splitTextToSize(line, W - 2 * M)) {
        ensure(14);
        doc.text(part, M, y);
        y += 13;
      }
      y += 3;
    }
    y += 8;
  }
  title("Gastos por categoria");
  for (const c of summary.byCategory) row([c.category, brl(c.total)], [W - 2 * M - 120, 120]);
  const invoices = input.invoices.filter((i) => i.ym === summary.ym);
  if (invoices.length) {
    y += 8;
    title("Faturas dos cartões");
    for (const i of invoices) row([institutionLabel(i.institution), i.paid ? "Paga" : "Em aberto", brl(i.amount)], [W - 2 * M - 220, 100, 120]);
  }
  if (summary.futureInstallments.length) {
    y += 8;
    title("Parcelas dos próximos meses");
    for (const f of summary.futureInstallments) row([ymLabel(f.ym), brl(f.total)], [W - 2 * M - 120, 120]);
  }
  y += 8;
  title("Lançamentos");
  const widths = [52, W - 2 * M - 52 - 90 - 70 - 100, 90, 70, 100];
  row(["Data", "Descrição", "Categoria", "Parcela", "Valor"], widths, { bold: true, muted: true });
  for (const e of summary.entries) {
    row(
      [
        brDate(e.expense.date),
        e.expense.description,
        e.expense.category,
        e.totalInstallments > 1 ? `${e.installment}/${e.totalInstallments}` : "à vista",
        `${e.expense.type === "receita" ? "+" : "-"} ${brl(e.amount)}`,
      ],
      widths
    );
  }
  return new Uint8Array(doc.output("arraybuffer"));
}

/** Documento simples (plano do Assistente) em HTML, para virar PDF no desktop. */
export function buildDocHtml(title: string, subtitle: string, markdown: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
body{font-family:Inter,Segoe UI,Arial,sans-serif;color:#0B0F1A;margin:0;font-size:12.5px;line-height:1.55}
.top{background:#0B0F1A;color:#F8FAFC;padding:26px 40px}
.top h1{margin:0;font-size:20px}.top p{margin:6px 0 0;color:#94A3B8;font-size:11px}
.body{padding:24px 40px}
h2,h3{margin:18px 0 6px}ul{padding-left:20px}li{margin:3px 0}
table.md{border-collapse:collapse;width:100%;margin:8px 0}table.md th,table.md td{border:1px solid #E2E8F0;padding:5px 8px;text-align:left}table.md th{background:#F1F5F9}
footer{padding:16px 40px;color:#64748B;font-size:10px;border-top:1px solid #E2E8F0}
</style></head><body>
<div class="top"><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>
<div class="body">${markdownToHtml(markdown.replace(/^\s*[-*]\s*\[( |x|X)\]/gm, (_m, c) => (c.trim() ? "- ☑" : "- ☐")))}</div>
<footer>Gerado pelo aplicativo Investa. Conteúdo educacional, não é recomendação individual de investimento.</footer>
</body></html>`;
}

/** A fonte padrão do PDF do celular só tem Latin-1: troca símbolos comuns e tira emojis. */
function latin1(t: string): string {
  return t
    .replace(/≈/g, "~")
    .replace(/[→⇒➜]/g, "->")
    .replace(/[←]/g, "<-")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, "...")
    .replace(/[✅✔☑]/g, "[x]")
    .replace(/[☐]/g, "[ ]")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/[^\x00-\xFF]/g, "");
}

/** O mesmo documento em PDF, sem navegador (celular). */
export async function buildDocPdf(title: string, subtitle: string, markdown: string): Promise<Uint8Array> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  doc.setFillColor(11, 15, 26);
  doc.rect(0, 0, W, 80, "F");
  doc.setTextColor(248, 250, 252);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(doc.splitTextToSize(latin1(title), W - 2 * M)[0] ?? latin1(title), M, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text(latin1(subtitle), M, 62);
  let y = 108;
  doc.setTextColor(11, 15, 26);
  const lines = markdown
    .replace(/^\s*[-*]\s*\[( |x|X)\]/gm, (_m, c) => (c.trim() ? "- [feito]" : "- [ ]"))
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^\|[\s:|-]+\|?$/.test(l))
    .map((l) => (l.startsWith("|") ? tableCells(l).join("   ·   ") : l))
    .map(latin1);
  for (const line of lines) {
    const heading = /^#{1,4}\s/.test(line);
    const text = line.replace(/^#{1,4}\s*/, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/^[-*•]\s+/, "•  ");
    if (heading) y += 6;
    doc.setFont("helvetica", heading ? "bold" : "normal");
    doc.setFontSize(heading ? 12 : 10);
    for (const part of doc.splitTextToSize(text || " ", W - 2 * M) as string[]) {
      if (y > H - M) {
        doc.addPage();
        y = M;
      }
      doc.text(part, M, y);
      y += heading ? 17 : 14;
    }
    if (heading) y += 2;
  }
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("Gerado pelo aplicativo Investa. Conteúdo educacional, não é recomendação individual de investimento.", M, H - 24);
  return new Uint8Array(doc.output("arraybuffer"));
}
