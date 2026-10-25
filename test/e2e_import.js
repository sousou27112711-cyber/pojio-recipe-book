// 自動取り込みの流れを、にせの取り込み係(test/mock_relay.js)を相手に試す。
// 使い方: node test/e2e_import.js <ページURL> <撮影先フォルダ> <スクショ画像> <サイト情報のフォルダ>
const fs = require('fs');
const path = require('path');
const [, , URL_, OUT, SHOT, SITES] = process.argv;
const siteUrl = n => fs.readFileSync(path.join(SITES, n + '.url'), 'utf8').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const page = (await (await fetch('http://127.0.0.1:9333/json/list')).json()).find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map(); const problems = []; const log = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)){ pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') problems.push('例外: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') problems.push('console.error: ' + m.params.args.map(a => a.value ?? a.description).join(' '));
  });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) problems.push('評価失敗: ' + expr.slice(0, 60)); return r.result?.result?.value; };
  const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, 'base64')); };
  const click = async sel => { const ok = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; e.click(); return true;})()`); if (!ok) problems.push('見つからない: ' + sel); await sleep(350); };
  const waitFor = async (expr, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms){ if (await ev(expr)) return true; await sleep(150); } problems.push('待ちきれず: ' + expr.slice(0, 90)); return false; };
  const toastText = () => ev(`document.querySelector('#toast').hidden ? '' : document.querySelector('#toast').textContent`);
  const paste = v => ev(`(()=>{const t=document.querySelector('#add-text'); t.value=${JSON.stringify(v)}; t.dispatchEvent(new Event('paste',{bubbles:true})); return true;})()`);
  const pickShots = async n => {
    const doc = await send('DOM.getDocument', { depth: -1 });
    const q = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: '#add-file' });
    await send('DOM.setFileInputFiles', { nodeId: q.result.nodeId, files: Array(n).fill(SHOT) });
    await waitFor(`document.querySelectorAll('#add-imgs .thumb').length === ${n} && !document.querySelector('[data-act="add-go"]').disabled`);
  };
  const detailSummary = () => ev(`document.querySelector('.d-title').textContent + ' / 材料' + document.querySelectorAll('.ing li:not(.h)').length + '行 / 手順' + document.querySelectorAll('.steps li').length + ' / 画像 ' + !!document.querySelector('#hero-img')`);
  const inDetail = `!document.querySelector('#v-detail').hidden && !!document.querySelector('.d-title')`;
  const inEdit = `!document.querySelector('#v-edit').hidden && !!document.querySelector('#f-title')`;

  await send('Runtime.enable'); await send('Page.enable'); await send('DOM.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Storage.clearDataForOrigin', { origin: new URL(URL_).origin, storageTypes: 'all' });
  await send('Page.navigate', { url: URL_ }); await sleep(2500);

  await click('[data-act="settings"]');
  await ev(`document.querySelector('#relay-code').value='https://example.com/x#abc'`);
  await click('[data-act="relay-save"]');
  log.push('形の違う設定コード: ' + await toastText());
  log.push('設定コード欄の種類: ' + await ev(`document.querySelector('#relay-code').type`));
  await click('[data-act="sheet-close"]');

  // にせの取り込み係を設定済みにする(本物は script.google.com のURLしか受け付けないため、保存場所に直接入れる)
  await ev(`new Promise((res, rej) => { const q = indexedDB.open('pojio-recipe-book', 1); q.onsuccess = () => { const db = q.result; const t = db.transaction('meta', 'readwrite'); t.objectStore('meta').put({ key: 'relay', value: { url: 'http://127.0.0.1:8799/exec', token: 'test-token' } }); t.oncomplete = () => { db.close(); res(true); }; }; q.onerror = () => rej(q.error); })`);
  await send('Page.reload'); await sleep(2500);
  await click('[data-act="settings"]');
  await click('[data-act="relay-test"]'); await sleep(500);
  log.push('つながるか: ' + await ev(`document.querySelector('#relay-state').textContent`));
  await click('[data-act="sheet-close"]');

  // 1) レシピサイトのURLを貼る → 自動登録
  await click('[data-act="add"]');
  await paste(siteUrl('kurashiru'));
  await sleep(200);
  log.push('1) 読み込み中: ' + await ev(`document.querySelector('#import-status').textContent`) + ' / ボタン押せない=' + await ev(`document.querySelector('[data-act="add-go"]').disabled`));
  await click('[data-act="add-go"]');
  await waitFor(inDetail);
  log.push('1) URLから登録: ' + await detailSummary() + ' / ' + await toastText());
  log.push('1) 二重登録なし: 件数 ' + await ev(`(document.querySelector('[data-act="back"]').click(), document.querySelector('#count').textContent)`));

  // 2) 同じURLをもう一度 → 確認 → 入っている方を開く
  await click('[data-act="add"]');
  await paste(siteUrl('kurashiru'));
  await waitFor(`!!document.querySelector('[data-act="confirm-cancel"]')`);
  log.push('2) 同じURL: ' + await ev(`document.querySelector('.sheet-head h2').textContent`));
  await click('[data-act="confirm-cancel"]');
  log.push('2) 入っている方を開く: ' + await ev(`document.querySelector('.d-title').textContent`) + ' / 件数 ' + await ev(`(document.querySelector('[data-act="back"]').click(), document.querySelector('#count').textContent)`));

  // 3) 料理名と画像だけのサイト → URLを貼っただけで登録(材料と作り方は読めなかったと知らせる)
  await click('[data-act="add"]');
  log.push('3) 追加画面: 主ボタン=' + await ev(`document.querySelector('[data-act="paste-url"]')?.textContent`) + ' / スクショ欄は閉じている=' + await ev(`!document.querySelector('#shot-box').open`));
  await shot('31_add_url_first.png');
  await paste(siteUrl('sirogohan'));
  await waitFor(inDetail);
  log.push('3) 白ごはん.com: ' + await detailSummary() + ' / ' + await toastText());
  await click('[data-act="back"]');

  // 4) 読み込み中に「やめる」
  await click('[data-act="add"]');
  await paste(siteUrl('delish'));
  await sleep(150);
  await click('[data-act="import-cancel"]');
  await sleep(1200);
  log.push('4) やめる: ' + await toastText() + ' / シートは開いたまま=' + await ev(`!document.querySelector('#sheet').hidden`) + ' / 件数 ' + await ev(`document.querySelector('#count').textContent`));

  // 5) インスタのURLだけ → 案内。スクショ1枚 → 文字を読み取って自動登録
  await ev(`document.querySelector('#add-text').value=''`);
  await paste('https://www.instagram.com/p/ABC123/');
  await sleep(300);
  log.push('5) インスタURLだけ: ' + await toastText() + ' / スクショ欄が開いた=' + await ev(`document.querySelector('#shot-box').open`));
  await pickShots(1);
  log.push('5) 追加画面の印: ' + await ev(`document.querySelector('#add-imgs .thumb-tag')?.textContent`));
  await shot('21_add_shot.png');
  await click('[data-act="add-go"]');
  await waitFor(inDetail);
  log.push('5) スクショから登録: ' + await detailSummary() + ' / 元リンク ' + await ev(`document.querySelector('.src-link')?.textContent`) + ' / ' + await toastText());
  await sleep(500);
  log.push('5) トップ画像: ' + await ev(`(()=>{const i=document.querySelector('#hero-img'); const c=document.createElement('canvas'); c.width=i.naturalWidth; c.height=i.naturalHeight; const g=c.getContext('2d'); g.drawImage(i,0,0); const p=g.getImageData(Math.round(c.width*0.05), Math.round(c.height*0.05), 1, 1).data; return i.naturalWidth+'x'+i.naturalHeight+' 左上の色 rgb('+p[0]+','+p[1]+','+p[2]+')';})()`));
  await shot('22_imported_shot.png');
  await click('[data-act="back"]');

  // 6) スクショ2枚で2枚目の読み取りが失敗 → 編集画面で確認
  await click('[data-act="add"]');
  await pickShots(2);
  await click('[data-act="add-go"]');
  await waitFor(inEdit);
  log.push('6) 読み取り失敗: ' + await ev(`document.querySelector('.edit .note').textContent`) + ' / 料理名=' + await ev(`document.querySelector('#f-title').value`));
  await shot('23_ocr_failed.png');
  await click('[data-act="edit-cancel"]');

  log.push('最終の件数: ' + await ev(`document.querySelector('#count').textContent`));
  console.log(log.join('\n'));
  console.log(problems.length ? '\n問題:\n' + problems.join('\n') : '\n問題: なし(エラー0件)');
  ws.close();
})().catch(e => { console.error('テスト失敗', e); process.exit(1); });
