import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessBundle, hasUnknownHigh } from './security-evidence.mjs';
const zod = {name:'zod',severity:'high',nodes:['node_modules/expo/node_modules/zod'],advisories:[{url:'https://github.com/advisories/GHSA-mrhx-c7xc-m3w5'}]};
test('an affected nested copy fails reachability even beside a patched runtime copy',()=>{
  assert.equal(assessBundle('web',['/node_modules/zod/v4/core.js','/node_modules/expo/node_modules/zod/lib/index.js'],[zod]).affectedPackages.length,1);
});
test('patched runtime plus CLI loader does not falsely include CLI schema dependency',()=>{
  assert.deepEqual(assessBundle('web',['/node_modules/zod/v4/core.js','/node_modules/expo/node_modules/@expo/cli/build/metro-require/require.js'],[zod]).affectedPackages,[]);
});
test('normalizes Windows inputs and rejects empty evidence',()=>{
  assert.equal(assessBundle('android',['C:\\node_modules\\expo\\node_modules\\zod\\lib\\index.js'],[zod]).affectedPackages.length,1);
  assert.throws(()=>assessBundle('ios',[],[zod]));
});
test('new high dependencies or advisories require a fresh assessment',()=>{
  assert.equal(hasUnknownHigh([zod]),false);
  assert.equal(hasUnknownHigh([{...zod,name:'other'}]),true);
  assert.equal(hasUnknownHigh([{...zod,advisories:[{url:'new-advisory'}]}]),true);
});
