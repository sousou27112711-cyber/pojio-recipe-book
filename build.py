#!/usr/bin/env python3
"""src/app.html から、GitHub Pages用(docs/)と手元確認用(dist/preview.html)を作る。"""
import json
import re
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src" / "app.html"
DOCS = ROOT / "docs"
DIST = ROOT / "dist"


def version_of(body: str) -> str:
    m = re.search(r"試作版 (v[0-9.]+)", body)
    return m.group(1) if m else "v0"


def draw_icon(size: int) -> Image.Image:
    """藍色の地に白いお茶碗と湯気。iOSが角を丸めるので四角いまま描く。"""
    s = 1024
    im = Image.new("RGB", (s, s), (43, 74, 134))
    d = ImageDraw.Draw(im)
    # お茶碗
    d.pieslice([212, 330, 812, 930], 0, 180, fill=(255, 255, 255))
    d.rectangle([212, 618, 812, 640], fill=(255, 255, 255))
    d.rounded_rectangle([420, 905, 604, 950], radius=18, fill=(255, 255, 255))
    # ごはんの山
    d.ellipse([262, 470, 762, 700], fill=(255, 255, 255))
    # 湯気
    for x in (402, 512, 622):
        d.arc([x - 40, 200, x + 40, 300], 90, 270, fill=(214, 225, 246), width=26)
        d.arc([x - 40, 290, x + 40, 390], 270, 90, fill=(214, 225, 246), width=26)
    return im.resize((size, size), Image.LANCZOS)


def main() -> None:
    body = SRC.read_text(encoding="utf-8")
    ver = version_of(body)
    DOCS.mkdir(exist_ok=True)
    DIST.mkdir(exist_ok=True)

    head_common = (
        '<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
    )
    reset = (
        "<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}"
        "body{margin:0}</style>\n"
    )

    # GitHub Pages(ホーム画面に追加して使う本番)
    pwa_head = (
        head_common
        + '<meta name="apple-mobile-web-app-capable" content="yes">\n'
        + '<meta name="mobile-web-app-capable" content="yes">\n'
        + '<meta name="apple-mobile-web-app-status-bar-style" content="default">\n'
        + '<meta name="apple-mobile-web-app-title" content="ぽじおレシピ">\n'
        + '<meta name="theme-color" content="#F3F5F8" media="(prefers-color-scheme: light)">\n'
        + '<meta name="theme-color" content="#0F131B" media="(prefers-color-scheme: dark)">\n'
        + '<meta name="robots" content="noindex">\n'
        + '<link rel="manifest" href="manifest.webmanifest">\n'
        + '<link rel="apple-touch-icon" href="icon-180.png">\n'
        + reset
    )
    sw_reg = (
        "<script>if('serviceWorker' in navigator){window.addEventListener('load',function(){"
        "navigator.serviceWorker.register('sw.js').catch(function(){});});}</script>\n"
    )
    (DOCS / "index.html").write_text(pwa_head + "</head>\n<body>\n" + body + "\n" + sw_reg + "</body>\n</html>\n", encoding="utf-8")

    manifest = {
        "name": "ぽじおレシピブック",
        "short_name": "ぽじおレシピ",
        "lang": "ja",
        "start_url": "./",
        "scope": "./",
        "display": "standalone",
        "background_color": "#F3F5F8",
        "theme_color": "#F3F5F8",
        "icons": [
            {"src": "icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "icon-512.png", "sizes": "512x512", "type": "image/png"},
        ],
    }
    (DOCS / "manifest.webmanifest").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    sw = f"""// ぽじおレシピブック Service Worker({ver})。オフラインでも開けるよう、アプリ本体を端末に置いておく。
const CACHE = 'pojio-{ver}';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => {{
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
}});
self.addEventListener('activate', e => {{
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
}});
self.addEventListener('fetch', e => {{
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {{
    const hit = await c.match(req, {{ ignoreSearch: true }});
    const net = fetch(req).then(res => {{ if (res.ok) c.put(req, res.clone()); return res; }}).catch(() => hit);
    return hit || net;
  }}));
}});
"""
    (DOCS / "sw.js").write_text(sw, encoding="utf-8")

    for size in (180, 192, 512):
        draw_icon(size).save(DOCS / f"icon-{size}.png", optimize=True)

    # 手元確認用(Artifactと同じく外枠だけ足す)
    (DIST / "preview.html").write_text(head_common + reset + "</head>\n<body>\n" + body + "\n</body>\n</html>\n", encoding="utf-8")
    print(f"built {ver}: docs/index.html, docs/sw.js, docs/manifest.webmanifest, icons, dist/preview.html")


if __name__ == "__main__":
    main()
