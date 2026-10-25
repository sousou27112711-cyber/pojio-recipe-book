// 本番のアプリ(GitHub Pages)から本物の取り込み係につないで、自動取り込みを通しで試す。
// 設定コードはテスト用のブラウザの中だけに入れる(画面やログには出さない)。
// 使い方: node test/e2e_real.js <撮影先フォルダ> <スクショ画像> <URL1> <URL2> ...
const fs = require('fs');
const path = require('path');
const [, , OUT, SHOT, ...URLS] = process.argv;
const APP = 'https://sousou27112711-cyber.github.io/pojio-recipe-book/';
const relay = { url: fs.readFileSync(path.join(__dirname, '..', 'gas', 'relay_url.txt'), 'utf8').trim(), token: fs.readFileSync(path.join(__dirname, '..', 'gas', '.token'), 'utf8').trim() };
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
  const waitFor = async (expr, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms){ if (await ev(expr)) return (Date.now() - t0) / 1000; await sleep(250); } problems.push('待ちきれず: ' + expr.slice(0, 80)); return -1; };
  const toastText = () => ev(`document.querySelector('#toast').hidden ? '' : document.querySelector('#toast').textContent`);
  const summary = () => ev(`document.querySelector('.d-title').textContent + ' / 分量 ' + (document.querySelector('.sec .sub')?.textContent || '-') + ' / 材料' + document.querySelectorAll('.ing li:not(.h)').length + '行 / 手順' + document.querySelectorAll('.steps li').length + ' / 写真 ' + !!document.querySelector('#hero-img') + ' / 元リンク ' + (document.querySelector('.src-link')?.textContent || 'なし')`);
  const inDetail = `!document.querySelector('#v-detail').hidden && !!document.querySelector('.d-title')`;

  await send('Runtime.enable'); await send('Page.enable'); await send('DOM.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: APP }); await sleep(3000);
  log.push('版: ' + await ev(`(document.querySelector('[data-act="settings"]').click(), new Promise(r => setTimeout(() => { const v = document.querySelector('.ver')?.textContent; document.querySelector('[data-act="sheet-close"]').click(); r(v); }, 400)))`));

  // 設定画面に設定コードを貼ったときと同じ形で、つながるか確かめて保存する
  await click('[data-act="settings"]');
  await ev(`(()=>{ document.querySelector('#relay-code').value = ${JSON.stringify(relay.url + '#' + relay.token)}; return true; })()`);
  await click('[data-act="relay-save"]');
  await waitFor(`/設定済み|つながりませんでした|保存できません/.test(document.querySelector('#relay-state')?.textContent || '') || /できました/.test(document.querySelector('#toast')?.textContent || '')`, 40000);
  log.push('設定コードを保存: ' + await toastText() + ' / 状態 ' + await ev(`document.querySelector('#relay-state')?.textContent`));
  await click('[data-act="sheet-close"]');

  for (const u of URLS){
    await click('[data-act="add"]');
    await ev(`(()=>{const t=document.querySelector('#add-text'); t.value=${JSON.stringify(u)}; t.dispatchEvent(new Event('paste',{bubbles:true})); return true;})()`);
    const sec = await waitFor(inDetail + ` && document.querySelector('.d-title').textContent !== window.__last`, 120000);
    log.push(`URL ${new URL(u).hostname} (${sec}秒): ` + await summary() + ' / ' + await toastText());
    await ev(`window.__last = document.querySelector('.d-title').textContent`);
    await shot('real_' + new URL(u).hostname.replace(/\W/g, '_') + '.png');
    await click('[data-act="back"]');
  }

  // インスタのスクショ
  await click('[data-act="add"]');
  const doc = await send('DOM.getDocument', { depth: -1 });
  const q = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: '#add-file' });
  await send('DOM.setFileInputFiles', { nodeId: q.result.nodeId, files: [SHOT] });
  const sec = await waitFor(inDetail + ` && document.querySelector('.d-title').textContent !== window.__last`, 120000);
  log.push(`スクショ (${sec}秒): ` + await summary() + ' / ' + await toastText());
  await shot('real_screenshot.png');

  console.log(log.join('\n'));
  console.log(problems.length ? '\n問題:\n' + problems.join('\n') : '\n問題: なし(エラー0件)');
  ws.close();
})().catch(e => { console.error('テスト失敗', e); process.exit(1); });
