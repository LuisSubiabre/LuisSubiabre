"""Actualiza la sección de últimos videos de YouTube en README.md.

Lee el feed RSS público del canal (no necesita API key). Si no se define
YOUTUBE_CHANNEL_ID, intenta obtener el ID del canal desde su página pública.
"""

import html
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET

README = os.environ.get("README_PATH", "README.md")
HANDLE = os.environ.get("YOUTUBE_HANDLE", "luissubiabre").lstrip("@")
CHANNEL_ID = os.environ.get("YOUTUBE_CHANNEL_ID", "").strip()
MAX_VIDEOS = int(os.environ.get("MAX_VIDEOS", "4"))
PER_ROW = 2

START = "<!-- YOUTUBE:START -->"
END = "<!-- YOUTUBE:END -->"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    "Cookie": "CONSENT=YES+1; SOCS=CAI",
}

NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "yt": "http://www.youtube.com/xml/schemas/2015",
}


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def find_channel_id() -> str:
    candidates = [
        f"https://www.youtube.com/@{HANDLE}",
        f"https://www.youtube.com/{HANDLE}",
        f"https://www.youtube.com/c/{HANDLE}",
        f"https://www.youtube.com/user/{HANDLE}",
    ]
    patterns = [
        r'"externalId":"(UC[\w-]{22})"',
        r'<link rel="canonical" href="https://www\.youtube\.com/channel/(UC[\w-]{22})"',
        r'"channelId":"(UC[\w-]{22})"',
        r'channel_id=(UC[\w-]{22})',
    ]
    for url in candidates:
        try:
            page = fetch(url)
        except Exception as exc:  # noqa: BLE001
            print(f"No se pudo abrir {url}: {exc}")
            continue
        for pattern in patterns:
            match = re.search(pattern, page)
            if match:
                print(f"ID del canal encontrado en {url}: {match.group(1)}")
                return match.group(1)
    sys.exit(
        "No se encontró el ID del canal. Define la variable YOUTUBE_CHANNEL_ID "
        "en el workflow (empieza con 'UC')."
    )


def get_videos(channel_id: str) -> list[dict]:
    feed = fetch(f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}")
    root = ET.fromstring(feed)
    videos = []
    for entry in root.findall("atom:entry", NS)[:MAX_VIDEOS]:
        videos.append(
            {
                "id": entry.findtext("yt:videoId", default="", namespaces=NS),
                "title": entry.findtext("atom:title", default="", namespaces=NS),
            }
        )
    return [v for v in videos if v["id"]]


def render(videos: list[dict]) -> str:
    if not videos:
        return '<p align="center"><a href="https://www.youtube.com/luissubiabre">Visita mi canal de YouTube</a></p>'
    width = 100 // PER_ROW
    rows = []
    for i in range(0, len(videos), PER_ROW):
        cells = []
        for v in videos[i : i + PER_ROW]:
            title = html.escape(v["title"])
            url = f"https://www.youtube.com/watch?v={v['id']}"
            thumb = f"https://i.ytimg.com/vi/{v['id']}/hqdefault.jpg"
            cells.append(
                f'    <td align="center" width="{width}%">\n'
                f'      <a href="{url}"><img src="{thumb}" alt="{title}" width="100%" /></a>\n'
                f"      <br/><sub><b>{title}</b></sub>\n"
                f"    </td>"
            )
        rows.append("  <tr>\n" + "\n".join(cells) + "\n  </tr>")
    return '<table align="center">\n' + "\n".join(rows) + "\n</table>"


def main() -> None:
    channel_id = CHANNEL_ID or find_channel_id()
    videos = get_videos(channel_id)
    print(f"{len(videos)} videos obtenidos")

    with open(README, encoding="utf-8") as f:
        content = f.read()
    if START not in content or END not in content:
        sys.exit(f"Faltan los marcadores {START} / {END} en {README}")

    block = f"{START}\n{render(videos)}\n{END}"
    new_content = re.sub(
        re.escape(START) + r".*?" + re.escape(END), lambda _: block, content, flags=re.S
    )
    if new_content == content:
        print("Sin cambios")
        return
    with open(README, "w", encoding="utf-8") as f:
        f.write(new_content)
    print("README actualizado")


if __name__ == "__main__":
    main()
