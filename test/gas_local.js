// gas/Code_paste.gs(合言葉入り)を手元で動かし、doPost が合言葉を正しく扱うか確かめる。GASの機能は簡単なにせものに置き換える。
const fs = require('fs'), path = require('path'), vm = require('vm');
const file = process.argv[2] || path.join(__dirname, '..', 'gas', 'Code_paste.gs');
const token = fs.readFileSync(path.join(__dirname, '..', 'gas', '.token'), 'utf8').trim();
const ctx = {
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType: () => ({ body: s }) }) },
  CacheService: { getScriptCache: () => { const m = new Map(); return { get: k => m.get(k), put: (k, v) => m.set(k, v) }; } },
};
vm.createContext(ctx); vm.runInContext(fs.readFileSync(file, 'utf8') + '\nthis.doPost = doPost; this.doGet = doGet;', ctx);
const call = body => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).body);
const show = (name, r, ok) => console.log((ok ? 'OK ' : 'NG ') + name + ' → ' + JSON.stringify(r));
let r;
r = call({ token, action: 'ping' }); show('正しい合言葉でping', r, r.ok === true && r.version === '3');
r = call({ token: 'wrong-token-xxxxxxxxxxxxxxxx', action: 'ping' }); show('違う合言葉', r, r.error === 'unauthorized');
r = call({ token, action: 'nothing' }); show('知らない依頼', r, r.error === 'unknown_action');
r = call({ token, action: 'fetch', url: 'http://localhost/x' }); show('内部向けURLは断る', r, r.error === 'bad_url');
r = call({ token, action: 'fetch', url: 'https://www.instagram.com/p/ABC/' }); show('インスタは読まない', r, r.error === 'login_wall');
r = JSON.parse(ctx.doGet().body); show('GET', r, r.ok === true);
