import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const BASE = "https://resultadoelectoral.onpe.gob.pe/presentacion-backend";
const PARAMS = "idEleccion=10&tipoFiltro=eleccion";
const OUT_FILE = process.env.OUT_FILE ?? join("public", "history.jsonl");
const INTERVAL_MS = Number(process.env.INTERVAL_MS ?? 60_000);

const HEADERS = {
  accept: "*/*",
  "accept-language": "es-419,es;q=0.9",
  "content-type": "application/json",
  referer: "https://resultadoelectoral.onpe.gob.pe/main/resumen",
  "sec-ch-ua": '"Chromium";v="147", "Not.A/Brand";v="8"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
};

async function get(path: string) {
  const res = await fetch(`${BASE}/${path}?${PARAMS}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${path}`);
  return res.json() as Promise<{ success: boolean; data: unknown }>;
}

async function snapshot() {
  const ts = new Date().toISOString();
  try {
    const [totales, participantes] = await Promise.all([
      get("resumen-general/totales"),
      get("resumen-general/participantes"),
    ]);
    const line = JSON.stringify({
      ts,
      totales: totales.data,
      participantes: participantes.data,
    });
    await appendFile(OUT_FILE, line + "\n", "utf8");

    const t = totales.data as { actasContabilizadas?: number };
    console.log(`[${ts}] ✓ snapshot guardado · actas ${t.actasContabilizadas ?? "?"}%`);
  } catch (e) {
    console.error(`[${ts}] ✗ ${(e as Error).message}`);
  }
}

export async function startRecorder(intervalMs = INTERVAL_MS) {
  await mkdir(dirname(OUT_FILE), { recursive: true });
  console.log(`[record] grabando cada ${intervalMs / 1000}s en ${OUT_FILE}`);
  await snapshot();
  return setInterval(snapshot, intervalMs);
}

const isCli =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) startRecorder();
