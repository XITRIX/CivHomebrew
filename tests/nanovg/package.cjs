const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {execFileSync}=require('node:child_process'),root=path.resolve(__dirname,'../..');
test('fresh prototype component includes dependencies/notices and returns its factory without enabling the normal launcher',()=>{
 execFileSync('python3',['tools/nanovg/package.py'],{cwd:root});
 const p=JSON.parse(fs.readFileSync(path.join(root,'dist/launcher-nanovg.civupdate'))),g={console};g.window=g;g.globalThis=g;const context=vm.createContext(g);
 vm.runInContext(fs.readFileSync(path.join(root,'app/src/core.js'),'utf8'),context);
 assert.equal(p.format,'civswitch-system');assert.equal(p.component,'launcher');assert.equal(p.checksum,g.PayloadCore.hash(p.source));
 const factory=vm.runInContext(p.source,context);assert.equal(factory.api,1);assert.equal(typeof factory.mount,'function');assert.equal(g.__civNanoVGNextMount,undefined);assert(g.CivNanoVGPrototype.enabled);assert(g.CivNanoVGLicenses['nanovg/LICENSE.txt']);assert(g.CivNanoVGLicenses['nanovg/Roboto-LICENSE.txt']);assert.equal(typeof g.CivNanoVGVulkan.create,'function');assert.equal(typeof g.CivNanoVGFactory,'function');assert.equal(typeof g.CivNanoVGSession.start,'function');assert(g.CivNanoVGAssets['SourceCodePro-Regular.ttf']);assert(g.CivNanoVGLicenses['source-code-pro/LICENSE.md']);
 vm.runInContext(fs.readFileSync(path.join(root,'app/app.js'),'utf8'),context);assert.equal(g.CivNanoVGPrototype.enabled,false,'reloading stock launcher never inherits prototype activation');
 const html=fs.readFileSync(path.join(root,'app/nanovg.html'),'utf8');assert(html.indexOf('vendor/native-ui-runtime.js')<html.indexOf('src="app.js"'));
 const terminalHtml=fs.readFileSync(path.join(root,'app/nanovg-terminal.html'),'utf8');assert(terminalHtml.includes('CivHomebrewNativeUI.start({browser:true})'));
 for(const match of html.matchAll(/<script src="([^"]+)"/g))assert(fs.existsSync(path.join(root,'app',match[1])),match[1]);
});
