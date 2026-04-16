import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = "https://resultadoelectoral.onpe.gob.pe/presentacion-backend";
const PARAMS = "idEleccion=10&tipoFiltro=eleccion";
const OUT = "samples";

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

const ENDPOINTS = [
  "resumen-general/totales",
  "resumen-general/participantes",
  "resumen-general/elecciones",
  "resumen-general/mapa-calor",
  "participacion-ciudadana/totales",
  "ubigeos/departamentos",
];

async function fetchOne(path: string) {
  const url = `${BASE}/${path}?${PARAMS}`;
  const res = await fetch(url, { headers: HEADERS });
  const text = await res.text();
  const ok = res.ok && res.headers.get("content-type")?.includes("json");
  const name = path.replace(/\//g, "__") + ".json";
  const file = join(OUT, name);

  if (ok) {
    try {
      await writeFile(file, JSON.stringify(JSON.parse(text), null, 2), "utf8");
      console.log(`✓ ${path} → ${file} (${text.length}b)`);
      return;
    } catch {
      /* fall through */
    }
  }
  await writeFile(file, text, "utf8");
  console.log(`✗ ${path} [${res.status} ${res.headers.get("content-type")}] → ${file}`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  for (const ep of ENDPOINTS) {
    try {
      await fetchOne(ep);
    } catch (e) {
      console.error(`! ${ep}: ${(e as Error).message}`);
    }
  }
}

main();
