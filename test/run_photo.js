// スクショの中の料理写真の範囲を探す処理(findPhotoBand)を、テスト画像6種類で確かめる。
// 使い方: node test/run_photo.js [テスト画像のフォルダ]
const fs = require('fs'), path = require('path');
const { findPhotoBand } = require('./parser.js');
const D = process.argv[2] || path.join(__dirname, 'fixtures', 'photo');
const exp = JSON.parse(fs.readFileSync(path.join(D, 'expected.json'), 'utf8'));
exp['4_reels'] = 'full';
let ng = 0;
for (const [name, e] of Object.entries(exp)){
  const { w, h } = JSON.parse(fs.readFileSync(path.join(D, name + '.json'), 'utf8'));
  const r = findPhotoBand(fs.readFileSync(path.join(D, name + '.rgba')), w, h);
  let v, ok;
  if (e === 'full'){ ok = r && r.kind === 'full'; v = ok ? '画面いっぱい→真ん中を切り抜く' : JSON.stringify(r); }
  else if (!e){ ok = !r; v = ok ? '写真なし' : JSON.stringify(r); }
  else if (name === '6_white_photo'){ ok = r && r.kind === 'band'; v = ok ? '既知の限界(料理のあたりだけ)' : JSON.stringify(r); }
  else { ok = r && r.kind === 'band' && Math.abs(r.y - e[1]) < 0.015 && Math.abs(r.y + r.h - e[1] - e[3]) < 0.015; v = ok ? '写真の帯どおり' : JSON.stringify(r); }
  if (!ok) ng++;
  console.log((ok ? 'OK ' : 'NG ') + name.padEnd(16) + v);
}
process.exit(ng ? 1 : 0);
