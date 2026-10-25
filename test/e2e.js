// ヘッドレスChromeをiPhone相当の画面で動かし、主な操作を順に押して画面を撮る。
// 使い方: node test/e2e.js <ページURL> <撮影先フォルダ>  (Chromeは --remote-debugging-port=9333 で起動しておく)
const fs = require('fs');
const path = require('path');
const [, , URL_, OUT = '.'] = process.argv;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const targets = await (await fetch('http://127.0.0.1:9333/json/list')).json();
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map(); const problems = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)){ pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') problems.push('例外: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') problems.push('console.error: ' + m.params.args.map(a => a.value ?? a.description).join(' '));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon/.test(m.params.entry.url || '')) problems.push('log: ' + m.params.entry.text);
  });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) problems.push('評価失敗: ' + expr.slice(0, 80) + ' → ' + r.result.exceptionDetails.exception?.description); return r.result?.result?.value; };
  const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, 'base64')); };
  const click = async sel => { const ok = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; e.click(); return true;})()`); if (!ok) problems.push('見つからない: ' + sel); await sleep(450); };
  const log = [];

  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Storage.clearDataForOrigin', { origin: new URL(URL_).origin, storageTypes: 'all' });
  await send('Page.navigate', { url: URL_ });
  await sleep(2500);
  log.push('件数表示: ' + await ev(`document.querySelector('#count').textContent`));
  log.push('タイル数: ' + await ev(`document.querySelectorAll('.tile').length`));
  await shot('01_list.png');

  await click('.tile[data-id="sample-shoga"]');
  await sleep(300);
  log.push('詳細の材料行: ' + await ev(`[...document.querySelectorAll('.ing li')].map(l=>l.textContent).join(' | ')`));
  await shot('02_detail.png');

  await click('[data-act="shop"]');
  await ev(`(()=>{const b=document.querySelector('#shop .mode-body'); b.scrollTop=9999; return b.scrollTop;})()`);
  const before = await ev(`document.querySelector('#shop .mode-body').scrollTop`);
  await click('#shop .shop-row[data-i="8"]');
  await click('#shop .shop-row[data-i="1"]');
  const after = await ev(`document.querySelector('#shop .mode-body').scrollTop`);
  log.push(`買い物: タップ前のスクロール位置=${before} タップ後=${after} / 表示=${await ev(`document.querySelector('#shop-left').textContent`)}`);
  await ev(`document.querySelector('#shop .mode-body').scrollTop=0`);
  await shot('03_shop.png');
  await click('[data-act="mode-close"]');

  await click('[data-act="cook"]');
  await click('[data-act="cook-next"]');
  await click('[data-act="cook-next"]');
  await sleep(600);
  log.push('料理: いまの手順=' + await ev(`document.querySelector('.cook-step.current .tx').textContent`) + ' / スリープ表示=' + await ev(`document.querySelector('#wake-slot').textContent`));
  await shot('04_cook.png');
  await click('[data-act="cook-ing"]');
  log.push('料理: 材料を開いたあとも手順を保持=' + await ev(`document.querySelector('.cook-step.current .tx').textContent`));
  await click('[data-act="mode-close"]');

  await click('[data-act="back"]');
  await click('[data-act="add"]');
  await ev(`(()=>{const t=document.querySelector('#add-text'); t.value=${JSON.stringify(`https://www.instagram.com/p/TEST123/\n＼レンジで5分！／\nやみつき無限ピーマン🫑\n【材料】2人分\n・ピーマン 4個\n・ツナ缶 1缶\n【作り方】\n①ピーマンを細切りにする\n②レンジで2分加熱する\n③ツナと混ぜる\n#レシピ`)}; t.dispatchEvent(new Event('input',{bubbles:true})); return true;})()`);
  await shot('05_add.png');
  await click('[data-act="add-go"]');
  log.push('編集画面: 料理名=' + await ev(`document.querySelector('#f-title').value`) + ' / URL=' + await ev(`document.querySelector('#f-url').value`));
  await shot('06_edit.png');
  await click('[data-act="edit-save"]');
  await sleep(400);
  log.push('保存後の画面: ' + await ev(`document.querySelector('.d-title')?.textContent`) + ' / 元リンク=' + await ev(`document.querySelector('.src-link')?.textContent`));
  await click('[data-act="cook-today"]');
  log.push('今日作った後: ' + await ev(`document.querySelector('.d-stats').textContent`));

  await send('Page.reload'); await sleep(2500);
  log.push('再読み込み後に開いていた画面: ' + await ev(`(document.querySelector('#v-detail').hidden ? '一覧' : '詳細 ' + document.querySelector('.d-title').textContent)`));
  await click('[data-act="back"]');
  log.push('一覧の件数: ' + await ev(`document.querySelector('#count').textContent`));

  await click('[data-act="settings"]');
  await sleep(500);
  await shot('07_settings.png');
  await click('[data-act="backup-prepare"]');
  await sleep(600);
  log.push('バックアップ準備: ' + await ev(`document.querySelector('#backup-slot').textContent`));
  await click('[data-act="sheet-close"]');

  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await sleep(300);
  await shot('08_list_dark.png');
  await click('.tile[data-id="sample-piman"]');
  await click('[data-act="cook"]');
  await sleep(400);
  await shot('09_cook_dark.png');

  console.log(log.join('\n'));
  console.log(problems.length ? '\n問題:\n' + problems.join('\n') : '\n問題: なし(エラー0件)');
  ws.close();
})().catch(e => { console.error('テスト失敗', e); process.exit(1); });
