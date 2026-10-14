import type { CopomInfo, CopomMeeting, FocusExpectations, Indicators, SeriesValue } from "@shared/types";
import { brDateToIso, cached, getJson, isoToBrDate, mapLimit, todayIsoSaoPaulo } from "./http";

const SGS = "https://api.bcb.gov.br/dados/serie/bcdata.sgs";
const OLINDA = "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata";

interface SgsRow {
  data: string;
  valor: string;
}

async function sgsLast(code: number, n = 1): Promise<SeriesValue[]> {
  let rows: SgsRow[];
  try {
    rows = await getJson<SgsRow[]>(`${SGS}.${code}/dados/ultimos/${n}?formato=json`, {}, 9_000);
  } catch {
    rows = await getJson<SgsRow[]>(`${SGS}.${code}/dados/ultimos/${n}?formato=json`, {}, 9_000);
  }
  return rows
    .map((r) => ({ date: brDateToIso(r.data), value: parseFloat(r.valor) }))
    .filter((r) => Number.isFinite(r.value));
}

export async function sgsProbe(code: number): Promise<SeriesValue[]> {
  return sgsLast(code, 2);
}

async function sgsRange(code: number, fromIso: string, toIso: string): Promise<SeriesValue[]> {
  const url = `${SGS}.${code}/dados?formato=json&dataInicial=${isoToBrDate(fromIso)}&dataFinal=${isoToBrDate(toIso)}`;
  const rows = await getJson<SgsRow[]>(url, {}, 20_000);
  return rows
    .map((r) => ({ date: brDateToIso(r.data), value: parseFloat(r.valor) }))
    .filter((r) => Number.isFinite(r.value));
}

function settled<T>(r: PromiseSettledResult<T>): T | undefined {
  return r.status === "fulfilled" ? r.value : undefined;
}

export async function getIndicators(): Promise<Indicators> {
  return cached("bcb:indicators", 30 * 60_000, async () => {
    // O SGS do Banco Central trava com muitas consultas simultâneas: no máximo 3 por vez.
    const jobs: (() => Promise<SeriesValue[]>)[] = [
      () => sgsLast(432, 1),
      () => sgsLast(4389, 1),
      () => sgsLast(433, 1),
      () => sgsLast(13522, 1),
      () => sgsLast(1, 2).catch(() => sgsLast(10813, 2)),
      () => sgsLast(21619, 1),
      () => sgsLast(195, 1),
      () => sgsLast(226, 1),
    ];
    const results = await mapLimit(jobs, 3, (job) =>
      job().then(
        (value): PromiseSettledResult<SeriesValue[]> => ({ status: "fulfilled", value }),
        (reason): PromiseSettledResult<SeriesValue[]> => ({ status: "rejected", reason })
      )
    );
    const [selic, cdiAnnual, ipcaMonth, ipca12, dollar, euro, savings, tr] = results.map(settled);
    const cdiDaily = cdiAnnual ? undefined : await sgsLast(12, 1).catch(() => undefined);
    let cdi = cdiAnnual?.[0];
    if (!cdi && cdiDaily?.[0]) {
      cdi = { date: cdiDaily[0].date, value: (Math.pow(1 + cdiDaily[0].value / 100, 252) - 1) * 100 };
    }
    const dollarLast = dollar?.[dollar.length - 1];
    const dollarPrev = dollar && dollar.length > 1 ? dollar[dollar.length - 2] : undefined;
    const focus = await getFocus().catch(() => undefined);
    const today = todayIsoSaoPaulo();
    const out: Indicators = {
      selic: selic?.[0] ? { ...selic[0], date: selic[0].date > today ? today : selic[0].date } : undefined,
      cdi,
      ipcaMonth: ipcaMonth?.[0],
      ipca12m: ipca12?.[0],
      dollarPtax: dollarLast
        ? { ...dollarLast, change: dollarPrev ? ((dollarLast.value - dollarPrev.value) / dollarPrev.value) * 100 : undefined }
        : undefined,
      euroPtax: euro?.[0],
      savingsMonth: savings?.[0],
      tr: tr?.[0],
      focus,
      updatedAt: new Date().toISOString(),
    };
    if (!out.selic && !out.cdi && !out.ipca12m) throw new Error("Banco Central indisponível");
    return out;
  });
}

interface FocusAnnualRow {
  Indicador: string;
  Data: string;
  DataReferencia: string;
  Mediana: number;
}

interface FocusSelicRow {
  Data: string;
  Reuniao: string;
  Mediana: number;
}

interface FocusAnnualRowFull extends FocusAnnualRow {
  baseCalculo: number;
}

async function focusAnnualRows(): Promise<FocusAnnualRowFull[]> {
  return cached("bcb:focus-annual", 6 * 3600_000, async () => {
    const url = `${OLINDA}/ExpectativasMercadoAnuais?$top=600&$orderby=Data%20desc&$format=json`;
    const json = await getJson<{ value: FocusAnnualRowFull[] }>(url, {}, 20_000);
    return (json.value ?? []).filter((r) => r.baseCalculo === 0);
  });
}

async function focusAnnual(indicator: string): Promise<{ year: number; value: number } | undefined> {
  const rows = (await focusAnnualRows()).filter((r) => r.Indicador === indicator);
  if (!rows.length) return undefined;
  const latest = rows[0].Data;
  const year = new Date().getFullYear();
  const pick =
    rows.find((r) => r.Data === latest && Number(r.DataReferencia) === year) ??
    rows.find((r) => r.Data === latest && Number(r.DataReferencia) === year + 1);
  return pick ? { year: Number(pick.DataReferencia), value: pick.Mediana } : undefined;
}

function meetingOrder(code: string): number {
  const m = /R(\d+)\/(\d{4})/.exec(code);
  return m ? Number(m[2]) * 10 + Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

async function focusNextMeeting(): Promise<{ meeting: string; value: number; date: string } | undefined> {
  const url = `${OLINDA}/ExpectativasMercadoSelic?$top=60&$orderby=Data%20desc&$format=json`;
  const json = await getJson<{ value: (FocusSelicRow & { baseCalculo: number })[] }>(url, {}, 15_000);
  const rows = (json.value ?? []).filter((r) => r.baseCalculo === 0);
  if (!rows.length) return undefined;
  const latest = rows[0].Data;
  const sameDay = rows.filter((r) => r.Data === latest).sort((a, b) => meetingOrder(a.Reuniao) - meetingOrder(b.Reuniao));
  const next = sameDay[0];
  return next ? { meeting: next.Reuniao, value: next.Mediana, date: latest } : undefined;
}

/** Expectativas ano a ano de Selic e IPCA (usadas na projeção do "Meu plano"). */
async function focusPaths(): Promise<{ selic: { year: number; value: number }[]; ipca: { year: number; value: number }[] }> {
  return cached("bcb:focus-path", 6 * 3600_000, async () => {
    const filter = encodeURIComponent("(Indicador eq 'Selic' or Indicador eq 'IPCA') and baseCalculo eq 0");
    const url = `${OLINDA}/ExpectativasMercadoAnuais?$top=60&$filter=${filter}&$orderby=Data%20desc&$format=json`;
    // Se a consulta filtrada falhar, usa a lista geral do Focus (já em cache).
    const rows = await getJson<{ value: FocusAnnualRowFull[] }>(url, {}, 15_000)
      .then((json) => json.value ?? [])
      .catch(() => focusAnnualRows());
    const year = new Date().getFullYear();
    const pick = (indicator: string) => {
      const list = rows.filter((r) => r.Indicador === indicator);
      const latest = list[0]?.Data;
      const out = new Map<number, number>();
      for (const r of list) {
        const y = Number(r.DataReferencia);
        if (r.Data === latest && y >= year && Number.isFinite(r.Mediana) && !out.has(y)) out.set(y, r.Mediana);
      }
      return [...out].map(([y, value]) => ({ year: y, value })).sort((a, b) => a.year - b.year);
    };
    return { selic: pick("Selic"), ipca: pick("IPCA") };
  });
}

export async function getFocus(): Promise<FocusExpectations> {
  return cached("bcb:focus", 6 * 3600_000, async () => {
    const [ipcaR, selicR, pibR, dollarR, meetingR, pathR] = await Promise.allSettled([
      focusAnnual("IPCA"),
      focusAnnual("Selic"),
      focusAnnual("PIB Total"),
      focusAnnual("Câmbio"),
      focusNextMeeting(),
      focusPaths(),
    ]);
    if (ipcaR.status === "rejected" && meetingR.status === "rejected") throw ipcaR.reason;
    const ipca = settled(ipcaR);
    const selic = settled(selicR);
    const pib = settled(pibR);
    const dollar = settled(dollarR);
    const meeting = settled(meetingR);
    const path = settled(pathR);
    if (!ipca && !selic && !meeting) throw new Error("Boletim Focus indisponível");
    return {
      date: meeting?.date ?? new Date().toISOString().slice(0, 10),
      ipcaYear: ipca,
      selicYear: selic,
      pibYear: pib,
      dollarYear: dollar,
      nextMeeting: meeting ? { meeting: meeting.meeting, value: meeting.value } : undefined,
      selicPath: path?.selic.length ? path.selic : undefined,
      ipcaPath: path?.ipca.length ? path.ipca : undefined,
    };
  });
}

/** Calendário oficial de reuniões do Copom divulgado pelo Banco Central (início, dia da decisão). */
export const COPOM_CALENDAR: CopomMeeting[] = [
  ["2025-01-28", "2025-01-29"], ["2025-03-18", "2025-03-19"], ["2025-05-06", "2025-05-07"], ["2025-06-17", "2025-06-18"],
  ["2025-07-29", "2025-07-30"], ["2025-09-16", "2025-09-17"], ["2025-11-04", "2025-11-05"], ["2025-12-09", "2025-12-10"],
  ["2026-01-27", "2026-01-28"], ["2026-03-17", "2026-03-18"], ["2026-04-28", "2026-04-29"], ["2026-06-16", "2026-06-17"],
  ["2026-08-04", "2026-08-05"], ["2026-09-15", "2026-09-16"], ["2026-11-03", "2026-11-04"], ["2026-12-08", "2026-12-09"],
].map(([start, decision]) => ({ start, decision }));

export async function getCopom(): Promise<CopomInfo> {
  return cached("bcb:copom", 60 * 60_000, async () => {
    const today = todayIsoSaoPaulo();
    const from = new Date();
    from.setFullYear(from.getFullYear() - 2);
    const series = await sgsRange(432, from.toISOString().slice(0, 10), today);
    const history: CopomInfo["history"] = [];
    for (let i = 1; i < series.length; i++) {
      if (series[i].value !== series[i - 1].value) {
        history.push({ date: series[i].date, from: series[i - 1].value, to: series[i].value });
      }
    }
    const current = series[series.length - 1]?.value;
    const past = COPOM_CALENDAR.filter((m) => m.decision < today);
    const last = past[past.length - 1];
    let lastMeeting: CopomInfo["lastMeeting"];
    if (last) {
      const before = [...series].reverse().find((s) => s.date <= last.decision);
      const after = series.find((s) => s.date > last.decision);
      if (!after || !before) {
        lastMeeting = { date: last.decision, outcome: "aguardando", from: before?.value };
      } else {
        const outcome = after.value > before.value ? "elevou" : after.value < before.value ? "reduziu" : "manteve";
        lastMeeting = { date: last.decision, outcome, from: before.value, to: after.value };
      }
    }
    const nextMeeting = COPOM_CALENDAR.find((m) => m.decision >= today);
    const focus = await getFocus().catch(() => undefined);
    return {
      current,
      lastMeeting,
      nextMeeting,
      history: history.reverse(),
      expectation: focus?.nextMeeting ? { ...focus.nextMeeting, date: focus.date } : undefined,
    };
  });
}

export async function getIpcaHistory(months = 13): Promise<SeriesValue[]> {
  return cached(`bcb:ipca:${months}`, 6 * 3600_000, () => sgsLast(433, months));
}

export async function getSelicHistory(): Promise<SeriesValue[]> {
  return cached("bcb:selic-hist", 6 * 3600_000, async () => {
    const from = new Date();
    from.setFullYear(from.getFullYear() - 5);
    const rows = await sgsRange(432, from.toISOString().slice(0, 10), todayIsoSaoPaulo());
    const out: SeriesValue[] = [];
    for (const r of rows) if (!out.length || out[out.length - 1].value !== r.value) out.push(r);
    if (rows.length) out.push(rows[rows.length - 1]);
    return out;
  });
}
