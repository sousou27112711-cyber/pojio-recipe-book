// にせの取り込み係(GASのdoPostと同じ受け答え)。保存したHTMLから gas/Code.gs の extractRecipe で読み取り、OCRは決まった文を返す。
// 使い方: node test/mock_relay.js <HTMLを置いたフォルダ> <料理写真のJPEG>
const http = require('http'), fs = require('fs'), path = require('path'), vm = require('vm');
const [, , dir, photo] = process.argv;
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8') + '\nthis.extractRecipe = extractRecipe;', ctx);
const photoData = 'data:image/jpeg;base64,' + fs.readFileSync(photo).toString('base64');
const OCR_TEXT = '9:41\n投稿\nyuu_cooking\nフォローする\nyuu_cooking ＼レンジで5分！／\nやみつき無限ピーマン\n【材料】2人分\n・ピーマン 4個\n・ツナ缶 1缶\n・鶏がらスープの素 小さじ1\n【作り方】\n①ピーマンを細切りにする\n②600Wで2分加熱する\n③ツナと調味料を混ぜる\n♡ 1,234\n3日前';
let ocrCalls = 0;
const send = (res, obj) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(obj)); };
http.createServer((req, res) => {
  if (req.method === 'OPTIONS'){ res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }); return res.end(); }
  let body = ''; req.on('data', c => body += c); req.on('end', () => {
    let q = {}; try { q = JSON.parse(body); } catch (e) { return send(res, { ok: false, error: 'bad_request' }); }
    if (q.token !== 'test-token') return send(res, { ok: false, error: 'unauthorized' });
    if (q.action === 'ping') return send(res, { ok: true, version: '1' });
    if (q.action === 'ocr'){
      ocrCalls++;
      if (!/^data:image\/(jpeg|png);base64,/.test(q.image || '')) return send(res, { ok: false, error: 'bad_image' });
      if (ocrCalls % 3 === 0) return send(res, { ok: false, error: 'server_error' });   // 3回に1回は失敗させる
      return setTimeout(() => send(res, { ok: true, text: OCR_TEXT }), 300);
    }
    if (q.action === 'fetch'){
      const name = ['kurashiru', 'delish', 'nadia', 'rakuten', 'sirogohan'].find(n => fs.existsSync(path.join(dir, n + '.url')) && fs.readFileSync(path.join(dir, n + '.url'), 'utf8').trim() === q.url);
      if (!name) return send(res, { ok: false, error: 'http_403' });
      const r = ctx.extractRecipe(fs.readFileSync(path.join(dir, name + '.html'), 'utf8'), q.url);
      r.image = r.imageUrl ? photoData : ''; r.ok = true;
      return setTimeout(() => send(res, r), 900);
    }
    send(res, { ok: false, error: 'unknown_action' });
  });
}).listen(8799, '127.0.0.1', () => console.log('mock relay on 8799'));
