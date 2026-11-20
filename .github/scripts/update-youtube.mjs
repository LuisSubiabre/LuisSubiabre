// Actualiza la sección de últimos videos de YouTube en README.md.
// Lee el feed RSS público del canal (no necesita API key ni dependencias).
// Si no se define YOUTUBE_CHANNEL_ID, obtiene el ID desde la página del canal.

import { readFile, writeFile } from "node:fs/promises";

const README = process.env.README_PATH || "README.md";
const HANDLE = (process.env.YOUTUBE_HANDLE || "luissubiabre").replace(/^@/, "");
const CHANNEL_ID = (process.env.YOUTUBE_CHANNEL_ID || "").trim();
const MAX_VIDEOS = Number(process.env.MAX_VIDEOS || 4);
const PER_ROW = 2;

const START = "<!-- YOUTUBE:START -->";
const END = "<!-- YOUTUBE:END -->";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
  Cookie: "CONSENT=YES+1; SOCS=CAI",
};

export let fetchText = async (url) => {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
};
export const setFetch = (fn) => (fetchText = fn);

const decode = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");

const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function findChannelId() {
  const urls = [
    `https://www.youtube.com/@${HANDLE}`,
    `https://www.youtube.com/${HANDLE}`,
    `https://www.youtube.com/c/${HANDLE}`,
    `https://www.youtube.com/user/${HANDLE}`,
  ];
  const patterns = [
    /"externalId":"(UC[\w-]{22})"/,
    /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/,
    /"channelId":"(UC[\w-]{22})"/,
    /channel_id=(UC[\w-]{22})/,
  ];
  for (const url of urls) {
    let page;
    try {
      page = await fetchText(url);
    } catch (err) {
      console.log(`No se pudo abrir ${url}: ${err.message}`);
      continue;
    }
    for (const re of patterns) {
      const m = page.match(re);
      if (m) {
        console.log(`ID del canal encontrado en ${url}: ${m[1]}`);
        return m[1];
      }
    }
  }
  throw new Error(
    "No se encontró el ID del canal. Define YOUTUBE_CHANNEL_ID en el workflow (empieza con 'UC')."
  );
}

async function getVideos(channelId) {
  const feed = await fetchText(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
  );
  const entries = feed.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  return entries
    .slice(0, MAX_VIDEOS)
    .map((e) => ({
      id: (e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1],
      title: decode((e.match(/<title>([\s\S]*?)<\/title>/) || [, ""])[1]).trim(),
    }))
    .filter((v) => v.id);
}

function render(videos) {
  if (!videos.length) {
    return '<p align="center"><a href="https://www.youtube.com/luissubiabre">Visita mi canal de YouTube</a></p>';
  }
  const width = Math.floor(100 / PER_ROW);
  const rows = [];
  for (let i = 0; i < videos.length; i += PER_ROW) {
    const cells = videos.slice(i, i + PER_ROW).map(({ id, title }) => {
      const t = escapeHtml(title);
      return [
        `    <td align="center" width="${width}%">`,
        `      <a href="https://www.youtube.com/watch?v=${id}"><img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="${t}" width="100%" /></a>`,
        `      <br/><sub><b>${t}</b></sub>`,
        `    </td>`,
      ].join("\n");
    });
    rows.push(`  <tr>\n${cells.join("\n")}\n  </tr>`);
  }
  return `<table align="center">\n${rows.join("\n")}\n</table>`;
}

export async function main() {
  const channelId = CHANNEL_ID || (await findChannelId());
  const videos = await getVideos(channelId);
  console.log(`${videos.length} videos obtenidos`);

  const content = await readFile(README, "utf8");
  const s = content.indexOf(START);
  const e = content.indexOf(END);
  if (s === -1 || e === -1 || e < s) throw new Error(`Faltan los marcadores ${START} / ${END}`);

  const updated =
    content.slice(0, s) + `${START}\n${render(videos)}\n${END}` + content.slice(e + END.length);
  if (updated === content) return console.log("Sin cambios");
  await writeFile(README, updated);
  console.log("README actualizado");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
