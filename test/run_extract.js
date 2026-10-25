// gas/Code.gs のうちGASの機能を使わない部分(extractRecipe など)を、保存したHTMLで試す。
// 使い方: node test/run_extract.js <HTMLとURLを置いたフォルダ>
const fs = require('fs'), path = require('path'), vm = require('vm');
const code = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');
const ctx = {}; vm.createContext(ctx); vm.runInContext(code + '\nthis.extractRecipe = extractRecipe;', ctx);
const dir = process.argv[2];
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.html') && !f.startsWith('cp_'))){
  const name = f.replace(/\.html$/, '');
  const url = fs.existsSync(path.join(dir, name + '.url')) ? fs.readFileSync(path.join(dir, name + '.url'), 'utf8').trim() : '';
  const r = ctx.extractRecipe(fs.readFileSync(path.join(dir, f), 'utf8'), url);
  console.log(`=== ${name}  found=${r.found}`);
  console.log(`料理名: ${r.title}\n分量: ${r.servings}\n画像: ${r.imageUrl.slice(0, 90)}`);
  console.log(`材料(${r.ingredients.length}): ${r.ingredients.slice(0, 5).join(' / ')}${r.ingredients.length > 5 ? ' …' : ''}`);
  console.log(`手順(${r.steps.length}): ${r.steps.slice(0, 2).map(s => s.slice(0, 40)).join(' / ')}${r.steps.length > 2 ? ' …' : ''}`);
}
