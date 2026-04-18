import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  Tooltip,
  Legend,
  CategoryScale,
  Filler,
  Decimation,
} from "chart.js";

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler,
  Decimation
);

Chart.defaults.color = "#cbd5e1";
Chart.defaults.borderColor = "#ffffff14";
Chart.defaults.font.family = "system-ui, sans-serif";

type ApiResponse<T> = { success: boolean; message?: string; data: T };

type Totales = {
  actasContabilizadas: number;
  contabilizadas: number;
  totalActas: number;
  actasEnviadasJee: number;
  enviadasJee: number;
  actasPendientesJee: number;
  pendientesJee: number;
  participacionCiudadana: number;
  totalVotosEmitidos: number;
  totalVotosValidos: number;
  fechaActualizacion: number;
  [k: string]: unknown;
};

type Participante = {
  nombreAgrupacionPolitica: string;
  codigoAgrupacionPolitica: number;
  nombreCandidato: string;
  dniCandidato: string;
  totalVotosValidos: number;
  porcentajeVotosValidos: number;
  porcentajeVotosEmitidos: number;
};

const PARAMS = "idEleccion=10&tipoFiltro=eleccion";

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`/api/${path}?${PARAMS}`, {
    headers: { Accept: "application/json, text/plain, */*" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Respuesta no-JSON: ${text.slice(0, 300)}`);
  }
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const statusEl = $("status");
const summaryEl = $("summary");
const partiesEl = $("parties");
const rawEl = $("raw");

function fmtInt(n: number | undefined) {
  return typeof n === "number" ? n.toLocaleString("es-PE") : "—";
}
function fmtPct(n: number | undefined) {
  return typeof n === "number" ? `${n.toFixed(3)}%` : "—";
}

function renderSummary(t: Totales) {
  const rows: [string, string][] = [
    ["Actas contabilizadas", `${fmtPct(t.actasContabilizadas)} (${fmtInt(t.contabilizadas)} / ${fmtInt(t.totalActas)})`],
    ["Para envío al JEE", `${fmtPct(t.actasEnviadasJee)} (${fmtInt(t.enviadasJee)})`],
    ["Pendientes", `${fmtPct(t.actasPendientesJee)} (${fmtInt(t.pendientesJee)})`],
    ["Participación ciudadana", fmtPct(t.participacionCiudadana)],
    ["Votos emitidos", fmtInt(t.totalVotosEmitidos)],
    ["Votos válidos", fmtInt(t.totalVotosValidos)],
    ["Actualizado", new Date(t.fechaActualizacion).toLocaleString("es-PE")],
  ];
  summaryEl.innerHTML = `<div class="card">${rows
    .map(([k, v]) => `<div class="row"><span class="k">${k}</span><strong>${v}</strong></div>`)
    .join("")}</div>`;
}

function extractParticipantes(data: unknown): Participante[] {
  if (Array.isArray(data)) return data as Participante[];
  if (data && typeof data === "object") {
    for (const v of Object.values(data as Record<string, unknown>)) {
      if (Array.isArray(v)) return v as Participante[];
    }
  }
  return [];
}

function renderParties(list: Participante[]) {
  if (!list.length) {
    partiesEl.innerHTML = `<p class="k">Sin datos de participantes.</p>`;
    return;
  }
  const sorted = [...list].sort((a, b) => b.totalVotosValidos - a.totalVotosValidos);
  const rows = sorted
    .map(
      (p, i) => `<tr>
        <td style="opacity:.6">${i + 1}</td>
        <td><strong>${p.nombreAgrupacionPolitica}</strong><br><span class="k" style="font-size:.85rem">${p.nombreCandidato}</span></td>
        <td style="text-align:right">${fmtInt(p.totalVotosValidos)}</td>
        <td style="text-align:right">${fmtPct(p.porcentajeVotosValidos)}</td>
      </tr>`
    )
    .join("");
  partiesEl.innerHTML = `
    <table>
      <thead><tr><th>#</th><th>Organización política / Candidato</th><th style="text-align:right">Votos válidos</th><th style="text-align:right">% válidos</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

async function load() {
  statusEl.textContent = " · cargando…";
  statusEl.className = "";
  try {
    const [totales, participantes] = await Promise.all([
      apiGet<ApiResponse<Totales>>("resumen-general/totales"),
      apiGet<ApiResponse<unknown>>("resumen-general/participantes"),
    ]);
    renderSummary(totales.data);
    renderParties(extractParticipantes(participantes.data));
    rawEl.textContent = JSON.stringify({ totales, participantes }, null, 2);
    statusEl.textContent = ` · actualizado ${new Date().toLocaleTimeString()}`;
  } catch (e) {
    statusEl.className = "err";
    statusEl.textContent = ` · error`;
    rawEl.textContent = (e as Error).message;
  }
}

type Snapshot = { ts: string; totales: Totales; participantes: Participante[] };

const TOP_N = 5;
const COLORS = ["#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4", "#42d4f4", "#f032e6"];
const charts: Record<string, Chart> = {};

function seriesFor(
  snapshots: Snapshot[],
  nombre: string,
  field: keyof Pick<Participante, "porcentajeVotosValidos" | "totalVotosValidos"> = "porcentajeVotosValidos"
) {
  return snapshots.map(
    (s) =>
      s.participantes.find((p) => p.nombreAgrupacionPolitica === nombre)?.[field] ?? null
  );
}

type YFormat = "percent" | "int";
function drawChart(
  id: string,
  labels: string[],
  datasets: any[],
  yTitle: string,
  yFormat: YFormat = "percent"
) {
  const canvas = $<HTMLCanvasElement>(id);
  charts[id]?.destroy();
  const styled = datasets.map((d) => ({
    pointRadius: 0,
    pointHoverRadius: 4,
    borderWidth: 2,
    cubicInterpolationMode: "monotone",
    ...d,
  }));
  const fmt = (v: number | null) =>
    v == null ? "—" : yFormat === "int" ? v.toLocaleString("es-PE") : `${v.toFixed(2)}%`;
  charts[id] = new Chart(canvas, {
    type: "line",
    data: { labels, datasets: styled },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { boxWidth: 12, boxHeight: 12, usePointStyle: true } },
        decimation: { enabled: true, algorithm: "lttb", samples: 200 },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`,
            footer: (items) => {
              if (items.length !== 2) return "";
              const [a, b] = items.map((i) => i.parsed.y);
              if (a == null || b == null) return "";
              return `Δ ${fmt(Math.abs(a - b))}`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { maxTicksLimit: 8, autoSkip: true, maxRotation: 0 },
          grid: { color: "#ffffff08" },
        },
        y: {
          title: { display: true, text: yTitle },
          grace: "5%",
          grid: { color: "#ffffff14" },
          ticks: { callback: (v) => fmt(Number(v)) },
        },
      },
    },
  });
}

let allSnapshots: Snapshot[] = [];

const rangeSel = $<HTMLSelectElement>("range");
const rangeInfo = $("range-info");

function filteredSnapshots(): Snapshot[] {
  const minutes = Number(rangeSel.value) || 0;
  if (!minutes) return allSnapshots;
  const cutoff = Date.now() - minutes * 60_000;
  return allSnapshots.filter((s) => new Date(s.ts).getTime() >= cutoff);
}

async function loadHistory() {
  const res = await fetch(`/history.jsonl?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) return;
  const text = await res.text();
  allSnapshots = text
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  renderHistory();
}

function renderHistory() {
  const snapshots = filteredSnapshots();
  rangeInfo.textContent = `${snapshots.length} de ${allSnapshots.length} snapshots`;
  if (snapshots.length === 0) return;

  const last = snapshots.at(-1)!;
  const ranking = [...last.participantes]
    .sort((a, b) => b.totalVotosValidos - a.totalVotosValidos)
    .map((p) => p.nombreAgrupacionPolitica);

  const labels = snapshots.map((s) => new Date(s.ts).toLocaleTimeString("es-PE"));

  // Chart 1: top-5
  const top = ranking.slice(0, TOP_N);
  drawChart(
    "chart",
    labels,
    top.map((n, i) => ({
      label: n,
      data: seriesFor(snapshots, n),
      borderColor: COLORS[i % COLORS.length],
      backgroundColor: COLORS[i % COLORS.length],
      tension: 0.2,
      spanGaps: true,
    })),
    "% votos válidos"
  );

  if (ranking.length < 3) return;
  const [, n2, n3] = ranking;

  // Chart 2: zoom 2° vs 3° por cantidad de votos (Chart.js auto-ajusta el eje Y)
  drawChart(
    "chart-battle",
    labels,
    [
      {
        label: `2° ${n2}`,
        data: seriesFor(snapshots, n2, "totalVotosValidos"),
        borderColor: COLORS[1],
        backgroundColor: COLORS[1] + "22",
        fill: "+1",
        tension: 0.2,
        spanGaps: true,
      },
      {
        label: `3° ${n3}`,
        data: seriesFor(snapshots, n3, "totalVotosValidos"),
        borderColor: COLORS[2],
        backgroundColor: COLORS[2],
        tension: 0.2,
        spanGaps: true,
      },
    ],
    "votos válidos",
    "int"
  );

  // Charts de actas (cada uno con su propio zoom)
  const actasCharts: [string, string, keyof Totales, string][] = [
    ["chart-actas-cont", "Contabilizadas", "contabilizadas", COLORS[1]],
    ["chart-actas-jee", "Para envío al JEE", "enviadasJee", COLORS[2]],
    ["chart-actas-pend", "Pendientes", "pendientesJee", COLORS[0]],
  ];
  for (const [id, label, field, color] of actasCharts) {
    drawChart(
      id,
      labels,
      [
        {
          label,
          data: snapshots.map((s) => (s.totales[field] as number | undefined) ?? null),
          borderColor: color,
          backgroundColor: color + "22",
          fill: true,
          tension: 0.2,
          spanGaps: true,
        },
      ],
      "actas",
      "int"
    );
  }

  // Chart 3: brecha 2° − 3°
  const s2 = seriesFor(snapshots, n2);
  const s3 = seriesFor(snapshots, n3);
  const gap = s2.map((v, i) => (v != null && s3[i] != null ? +(v - s3[i]).toFixed(3) : null));
  drawChart(
    "chart-gap",
    labels,
    [
      {
        label: `${n2} − ${n3}`,
        data: gap,
        borderColor: "#222",
        backgroundColor: "#2224",
        fill: true,
        tension: 0.2,
        spanGaps: true,
      },
    ],
    "diferencia (pp)"
  );
}

async function loadAll() {
  await load();
  await loadHistory().catch(() => {});
}

$<HTMLButtonElement>("reload").addEventListener("click", loadAll);
rangeSel.addEventListener("change", renderHistory);
loadAll();
setInterval(loadAll, 60_000);
