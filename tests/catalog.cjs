'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function harness(responses = {}, initial = null, installed = []) {
  let saved = initial, committed = 0;
  const submitted = [];
  const g = {
    PayloadCore: {
      root: 'save:/civhomebrew', maxFrame: 12 * 1024 * 1024,
      id: value => {if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(value)) throw Error('Invalid app ID');},
      encode: value => value, decode: value => value,
      seal: value => JSON.stringify(value), open: value => JSON.parse(value),
      package: value => value
    },
    CivHttp: {
      url: value => {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.port || url.hash) throw Error('Only HTTPS supported');
        return {href: url.href};
      },
      create: () => ({
        get: async url => responses[url] || {status: 404, body: ''},
        close: async () => {}
      })
    },
    CivSha256: {hash: async bytes => crypto.createHash('sha256').update(bytes, 'binary').digest('hex')},
    CivVersions: {compare: (a, b) => {
      const parts = value => /^\d+\.\d+\.\d+$/.test(value) ? value.split('.').map(Number) : null;
      const left = parts(a), right = parts(b);
      if (!left || !right) return null;
      for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return Math.sign(left[i] - right[i]);
      return 0;
    }},
    CivAppLibrary: {create: () => ({describe: async (id, checksum) => {
      const entry = installed.find(item => item.id === id);
      if (!entry || entry.checksum !== checksum) throw Error('App changed');
      return {metadata: {release: entry.release}};
    }})}
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/src/catalog.js'), 'utf8'), g);
  const native = {
    files: {
      read: async () => saved,
      write: async (_file, text) => {saved = text;},
      commit: async () => {committed++;}
    },
    io: {ensureDirectory: async () => {}}
  };
  const catalog = g.CivCatalog.create({native, api: {
    list: () => installed.slice(),
    submit: async (name, bytes) => {submitted.push({name, bytes});}
  }});
  return {g, catalog, native, submitted, get committed() {return committed;}};
}

function catalogUiHarness(app, install) {
  function element(tag, parent, style = {}, text = '') {
    const value = {tag, parentNode: parent, style: {...style}, textContent: text, children: [],
      scrollTop: 0, offsetTop: 0, offsetHeight: 42, clientHeight: 400,
      addEventListener() {}, removeChild(child) {this.children.splice(this.children.indexOf(child), 1); child.parentNode = null;}};
    Object.defineProperty(value, 'firstChild', {get() {return this.children[0] || null;}});
    if (parent) parent.children.push(value);
    return value;
  }
  const stage = element('stage', null);
  const context = {CivKeyboard: {create: () => ({active: () => false, cancel() {}, edit: async () => null})}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/src/catalog-ui.js'), 'utf8'), context);
  let installs = 0;
  const ui = context.CivCatalogUI.create({stage, layout: {node: element}, catalog: {
    list: () => ['https://example.org/catalog.json'], load: async () => {},
    check: async () => [app], install: async selected => {installs++; await install?.(selected);},
    close: async () => {}
  }, focus() {}, suppress() {}});
  return {ui, stage, get installs() {return installs;}};
}

test('A installs or reinstalls the selected catalog app on the first press', async () => {
  for (const [kind, label] of [['new', 'install'], ['installed', 'reinstall'], ['update', 'update']]) {
    const app = {name: 'Sample', release: '1.0.0', description: 'Sample app', availability: {kind}};
    const h = catalogUiHarness(app);
    await h.ui.open();
    assert.match(h.stage.children[0].children[5].textContent, new RegExp(`A: ${label}`));
    h.ui.action('accept', 0);
    await new Promise(setImmediate);
    assert.equal(h.installs, 1);
    assert.equal(h.ui.active(), false);
  }
});

test('a failed first-press catalog install leaves Browse apps available', async () => {
  const app = {name: 'Sample', release: '1.0.0', description: 'Sample app', availability: {kind: 'new'}};
  const h = catalogUiHarness(app, async () => {throw Error('Download failed');});
  await h.ui.open();
  h.ui.action('accept', 0);
  await new Promise(setImmediate);
  assert.equal(h.installs, 1);
  assert.equal(h.ui.active(), true);
  assert.match(h.stage.children[0].children[5].textContent, /Download failed/);
});

test('repository URLs normalize and custom sources persist with readback', async () => {
  const h = harness();
  assert.equal(h.g.CivCatalog.sourceUrl('https://github.com/example/apps'),
    'https://raw.githubusercontent.com/example/apps/HEAD/catalog.json');
  assert.equal(h.g.CivCatalog.sourceUrl('https://github.com/cpypwn/civapp-db'), h.catalog.defaultUrl);
  assert.deepEqual(Array.from(await h.catalog.load()), [h.catalog.defaultUrl]);
  await assert.rejects(h.catalog.add('https://github.com/cpypwn/civapp-db'), /already added/);
  await h.catalog.add('https://example.trycloudflare.com/catalog.json');
  assert.equal(h.committed, 1);
  assert.equal(h.catalog.list().length, 2);
  await assert.rejects(h.catalog.add('https://example.trycloudflare.com/catalog.json'), /already added/);
  await assert.rejects(h.catalog.remove(0), /default catalog/);
  await h.catalog.remove(1);
  assert.equal(h.catalog.list().length, 1);
});

test('a previously added test repository migrates to the new default', async () => {
  const saved = JSON.stringify({version: 1, repos: [
    'https://github.com/cpypwn/civapp-db-test',
    'https://example.org/catalog.json'
  ]});
  const h = harness({}, saved);
  assert.deepEqual(Array.from(await h.catalog.load()), [
    h.catalog.defaultUrl,
    'https://example.org/catalog.json'
  ]);
});

test('unavailable default catalog reports why downloads cannot start', async () => {
  const h = harness();
  assert.equal(h.catalog.defaultUrl, 'https://raw.githubusercontent.com/cpypwn/civapp-db/main/catalog.json');
  await assert.rejects(h.catalog.fetch(0), /default catalog is unavailable/);
});

test('catalog packages require exact size, SHA-256, ID and release before install', async () => {
  const packageBytes = JSON.stringify({id: 'test-app', metadata: {release: '1.0.0'}});
  const sha256 = crypto.createHash('sha256').update(packageBytes).digest('hex');
  const manifest = JSON.stringify({format: 'civhomebrew-catalog', version: 1, apps: [{
    id: 'test-app', name: 'Test', release: '1.0.0', description: 'Test package',
    package: 'https://example.org/test.civapp', bytes: packageBytes.length, sha256
  }]});
  const responses = {
    'https://raw.githubusercontent.com/cpypwn/civapp-db/main/catalog.json': {status: 200, body: manifest},
    'https://example.org/test.civapp': {status: 200, body: packageBytes}
  };
  const h = harness(responses);
  const [app] = await h.catalog.fetch(0);
  await h.catalog.install(app);
  assert.deepEqual(h.submitted, [{name: 'test-app.civapp', bytes: packageBytes}]);
  responses[app.package] = {status: 200, body: packageBytes + 'x'};
  await assert.rejects(h.catalog.install(app), /size differs/);
  responses[app.package] = {status: 200, body: packageBytes.replace('test-app', 'bad-app-')};
  await assert.rejects(h.catalog.install(app), /SHA-256 differs/);
  assert.equal(h.submitted.length, 1);
});

test('catalog identifies available updates and verifies the installed app before replacing it', async () => {
  const packageBytes = JSON.stringify({id: 'test-app', metadata: {release: '1.1.0'}});
  const sha256 = crypto.createHash('sha256').update(packageBytes).digest('hex');
  const manifest = JSON.stringify({format: 'civhomebrew-catalog', version: 1, apps: [{
    id: 'test-app', name: 'Test', release: '1.1.0', description: 'Test package',
    package: 'https://example.org/test.civapp', bytes: packageBytes.length, sha256
  }]});
  const responses = {
    'https://raw.githubusercontent.com/cpypwn/civapp-db/main/catalog.json': {status: 200, body: manifest},
    'https://example.org/test.civapp': {status: 200, body: packageBytes}
  };
  const installed = [{id: 'test-app', checksum: 'installed-manifest-hash', release: '1.0.0'}];
  const h = harness(responses, null, installed);
  const [app] = await h.catalog.check(0);
  assert.equal(app.availability.kind, 'update');
  assert.equal(app.availability.release, '1.0.0');
  assert.equal(app.availability.checksum, 'installed-manifest-hash');
  await h.catalog.install(app);
  assert.deepEqual(h.submitted, [{name: 'test-app.civapp', bytes: packageBytes}]);
  installed[0].checksum = 'changed-manifest-hash';
  await assert.rejects(h.catalog.install(app), /Installed app changed/);
  assert.equal(h.submitted.length, 1);
});

test('catalog distinguishes installed, newer, new and unverified apps', async () => {
  const manifest = JSON.stringify({format: 'civhomebrew-catalog', version: 1, apps: [
    {id: 'same', name: 'Same', release: '1.0.0', description: '', package: 'https://example.org/same.civapp', bytes: 1, sha256: '0'.repeat(64)},
    {id: 'newer', name: 'Newer', release: '1.0.0', description: '', package: 'https://example.org/newer.civapp', bytes: 1, sha256: '0'.repeat(64)},
    {id: 'fresh', name: 'Fresh', release: '1.0.0', description: '', package: 'https://example.org/fresh.civapp', bytes: 1, sha256: '0'.repeat(64)},
    {id: 'unknown', name: 'Unknown', release: 'preview', description: '', package: 'https://example.org/unknown.civapp', bytes: 1, sha256: '0'.repeat(64)}
  ]});
  const installed = [
    {id: 'same', checksum: 'a', release: '1.0.0'},
    {id: 'newer', checksum: 'b', release: '2.0.0'},
    {id: 'unknown', checksum: 'c', release: 'preview'}
  ];
  const h = harness({'https://raw.githubusercontent.com/cpypwn/civapp-db/main/catalog.json': {status: 200, body: manifest}}, null, installed);
  const apps = await h.catalog.check(0);
  assert.deepEqual(Array.from(apps, app => app.availability.kind), ['installed', 'newer-installed', 'new', 'unverified']);
});

test('malformed catalog entries are rejected before download', async () => {
  const h = harness();
  assert.throws(() => h.g.CivCatalog.parse(JSON.stringify({format: 'civhomebrew-catalog', version: 1, apps: [{
    id: 'bad', name: 'Bad', release: '1', description: '', package: 'https://example.org/bad.js', bytes: 100,
    sha256: '0'.repeat(64)
  }]})), /\.civapp/);
});

test('boot stages the catalog launcher only over a known upstream launcher', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../app/boot.js'), 'utf8');
  for (const [checksum, expected] of [
    ['upstream', 1], ['60d573be', 1], ['custom', 0], ['catalog', 0]
  ]) {
    let stages = 0;
    const system = {
      seed: async () => {},
      status: async () => ({active: 0, pending: null, hashes: [checksum]}),
      stage: async () => {stages++;},
      choose: async () => ({source: 'core', release: '0.4.3', trial: false}),
      confirm: async () => {}
    };
    const window = {
      __payloadMenuConfig: {upstreamLauncherChecksum: 'upstream',
        seeds: {launcher: {checksum: 'catalog'}, core: {source: 'core'}}},
      PayloadNative: {available: true, create: () => ({io: {}})},
      CivSystem: {create: () => system},
      PayloadLoaderScope: {evaluate: async () => {
        window.__civhomebrewCore = {lifetime: {}};
        await window.__civhomebrewBoot.ready();
      }, evaluateScripts: async () => {}}
    };
    await vm.runInNewContext(source, {window});
    assert.equal(stages, expected, checksum);
  }
});
