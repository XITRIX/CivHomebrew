/* Host CPU/I/O-count profile; no console connection or persistent save writes.
 * Build with npm run package:nanovg:main, then run with node --jitless.
 * In-memory reads exclude native bridge/storage latency. No GPU is initialized.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {performance} = require('node:perf_hooks');
const root = path.resolve(__dirname, '../..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const image = JSON.parse(read('dist/launcher-nanovg-main.civupdate'));
const g = {console, setTimeout, clearTimeout, performance, WebAssembly: undefined};
g.window = g;
const context = vm.createContext(g);
for (const name of ['core', 'system', 'app-metadata', 'storage', 'ftp-settings', 'ftp-files', 'loader-scope', 'resident']) vm.runInContext(read('app/src/' + name + '.js'), context);
const C = g.PayloadCore;
const files = new Map();
let reads = [], hashes = [], encodes = [];
const io = {
  read: async name => { const value = files.get(name) ?? null; reads.push({name, bytes: value === null ? 0 : Buffer.byteLength(value)}); return value; },
  write: async (name, value) => { files.set(name, value); },
  commit: async () => {}, ensureDirectory: async () => {}, remove: async name => { files.delete(name); }
};
const system = g.CivSystem.create(io);
function track(name, rows) {
  const original = C[name];
  C[name] = function (value) {
    const at = performance.now();
    try { return original(value); }
    finally { rows().push({chars: value.length, ms: performance.now() - at}); }
  };
}
track('hash', () => hashes); track('encode', () => encodes);
function total(rows) { return rows.reduce((n, row) => n + row.ms, 0); }
async function sample(first) {
  reads = []; hashes = []; encodes = [];
  const at = performance.now(), selected = await system.choose('launcher', false), chosen = performance.now();
  // Compile/evaluate the actual package, including its early cached-factory return.
  const factory = vm.runInContext(selected.source, context), evaluated = performance.now();
  if (factory.api !== 1) throw Error('Invalid launcher factory');
  const sourceReads = reads.filter(row => row.name.endsWith('.js'));
  return {first, chooseMs: chosen - at, evaluateMs: evaluated - chosen,
    totalMs: evaluated - at, reads: reads.length,
    sourceReadBytes: sourceReads.reduce((n, row) => n + row.bytes, 0),
    sourceHashPasses: hashes.filter(row => row.chars === image.source.length).length,
    sourceEncodePasses: encodes.filter(row => row.chars === image.source.length).length,
    hashMs: total(hashes), encodeMs: total(encodes)};
}
(async () => {
  await system.stage(image);
  await system.confirm('launcher', await system.choose('launcher', false));
  const samples = [await sample(true)];
  const originalFactory = g.__civNanoVGMainLauncher.factory, compiled = g.CivNanoVGFactory;
  for (let i = 0; i < 5; i++) {
    delete g.CivFtp; delete g.CivHomebrewLauncher;
    samples.push(await sample(false));
    if (g.__civNanoVGMainLauncher.factory !== originalFactory || g.CivNanoVGFactory !== compiled) throw Error('Renderer cache changed');
  }
  // Count the real launcher's update-hint/snapshot reads independently of UI.
  // A synthetic acknowledged core supplies only metadata for this fixture.
  const coreSource = '({api:1})';
  await system.stage({format: 'civswitch-system', version: 1, api: 1,
    component: 'core', release: '0.4.3', source: coreSource, checksum: C.hash(coreSource)});
  await system.confirm('core', await system.choose('core', false));
  const boot = {system, native: {io, files: {read: io.read}}};
  reads = [];
  const metadataAt = performance.now();
  const hints = g.CivUpdateStatus.create(g.CivUpdateStatus.platform(boot.native));
  await hints.load();
  await g.CivSystemUpdates.platform({}, boot).snapshot();
  const mountMetadata = {ms: performance.now() - metadataAt, reads: reads.slice()};
  if (mountMetadata.reads.length !== 8) throw Error('Mount metadata read count changed');
  await hints.close();
  // Exercise the actual resident cache selection. Stub only the DOM/GPU mount
  // so these measurements isolate component selection, just like the baseline.
  let evaluations = 0;
  const manager = g.CivResident.create({io, system, evaluate: async source => {
    evaluations++;
    const factory = vm.runInContext(source, context);
    factory.mount = async () => ({close: async () => {}});
    return factory;
  }});
  await manager.start();
  const residentWarmSamples = [];
  for (let i = 0; i < 5; i++) {
    manager.showTerminal(); await manager.idle();
    reads = []; hashes = []; encodes = [];
    const at = performance.now(); await manager.showLauncher();
    residentWarmSamples.push({ms: performance.now() - at, reads: reads.length,
      sourceReadBytes: reads.filter(row => row.name.endsWith('.js')).reduce((n, row) => n + row.bytes, 0),
      sourceHashPasses: hashes.filter(row => row.chars === image.source.length).length});
  }
  if (evaluations !== 1) throw Error('Resident re-evaluated the cached launcher');
  await manager.shutdown();
  // Exercise the real generated wasm2js/font initialization without a display.
  const geometryAt = performance.now();
  const geometry = await g.CivAppsNativeUI.geometry.create();
  const geometryInitMs = performance.now() - geometryAt;
  geometry.close();
  const result = {kind: 'host-only', node: process.version, flags: process.execArgv,
    sourceBytes: Buffer.byteLength(image.source), release: image.release,
    checksum: image.checksum, samples, residentWarmSamples, mountMetadata, geometryInitMs,
    limits: ['In-memory I/O, no native bridge/storage timing', 'No Vulkan/display/first-frame timing', 'Host CPU and V8 differ from Switch']};
  const out = path.join(root, 'build/launcher-startup-review-host.json');
  fs.mkdirSync(path.dirname(out), {recursive: true});
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; });
