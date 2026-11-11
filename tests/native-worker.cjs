const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createContext() {
    const context = vm.createContext({});
    vm.runInContext(fs.readFileSync(__dirname + '/../app/src/platform/native-worker.js', 'utf8'), context);
    return context;
}

test('native-worker exports expected constants and constructors', () => {
    const ctx = createContext();
    const W = ctx.PayloadNativeWorker;
    assert.ok(W);
    assert.equal(typeof W.createNative, 'function');
    assert.equal(typeof W.create, 'function');
    assert.equal(typeof W.open, 'function');
    assert.equal(typeof W.prelude, 'function');
    assert.equal(W.constants.HEADER, 320);
    assert.equal(W.constants.MAGIC, 0x42564943);
    assert.equal(W.constants.COMMIT, 0x454e4421);
    assert.equal(W.constants.MAX_BYTES, 4 * 1024 * 1024);
    assert.equal(W.constants.MAX_SOURCE, 256 * 1024);
    assert.equal(W.constants.MAX_INPUT, 900);
});

test('createCivWorker load validates source, limits and ASCII bounds', async () => {
    const ctx = createContext();
    const evaluated = [];
    const mockBackend = {
        busy: false,
        evaluate: (stage, script, limit) => { evaluated.push({ stage, script, limit }); },
        locate: (bytes) => ({ list: 'young', nodes: 1 }),
        forgetShared: () => {},
        stats: () => ({ status: 'ready', jobs: 0, busy: false })
    };
    const worker = ctx.PayloadNativeWorker.create(mockBackend);

    // Rejections
    await assert.rejects(() => worker.load(''), /RangeError/);
    await assert.rejects(() => worker.load(['']), /RangeError/);
    await assert.rejects(() => worker.load('hello \u0100'), /RangeError/);
    await assert.rejects(() => worker.load('hello', { bytes: 3 }), /RangeError/);
    await assert.rejects(() => worker.load('hello', { bytes: 5 }), /RangeError/);
    await assert.rejects(() => worker.load('hello', { bytes: 5 * 1024 * 1024 }), /RangeError/);

    // Valid load
    const info = await worker.load('function civStep(i, o) { o[0] = 42; }', { bytes: 16 });
    assert.equal(info.bytes, 16);
    assert.equal(info.list, 'young');
    assert.equal(worker.bytes, 16);
    assert.equal(evaluated.length, 2);
    assert.equal(evaluated[0].stage, 'prelude');
    assert.equal(evaluated[1].stage, 'app-source-0');
    assert.ok(evaluated[1].script.includes('civStep'));
});

test('createCivWorker submit and poll round-trip sequence and data', async () => {
    const ctx = createContext();
    let currentJob = null;
    let retired = false;
    const mockBackend = {
        get busy() { return !!currentJob; },
        evaluate: (stage, script) => {
            if (stage === 'retire') retired = true;
        },
        locate: () => ({ list: 'old', nodes: 2 }),
        forgetShared: () => {},
        submit: (queueScript) => {
            currentJob = { queueScript, seq: 1 };
        },
        poll: (page, timeoutMs, waitMs) => {
            if (!currentJob) return null;
            // Write valid header: word 0 magic, word 1 seq 1, word 2 total 336, word 3 commit, word 4 status 0
            const words = new Uint32Array(page.buffer, page.byteOffset, 8);
            words[0] = 0x42564943;
            words[1] = 1;
            words[2] = 336;
            words[3] = (0x454e4421 ^ 1) >>> 0;
            words[4] = 0;
            // Write payload data
            page[320] = 99;
            page[321] = 100;
            currentJob = null;
            return { waitMs: 0.5, copyMs: 0.1, submitMs: 0.05 };
        },
        stats: () => ({ status: 'ready', jobs: 1, busy: false })
    };

    const worker = ctx.PayloadNativeWorker.create(mockBackend);
    await worker.load('function civStep(i, o) {}', { bytes: 16 });

    const seq = worker.submit({ mode: 'test' });
    assert.equal(seq, 1);
    assert.equal(worker.busy, true);

    const result = worker.poll();
    assert.ok(result);
    assert.equal(result.seq, 1);
    assert.equal(result.data[0], 99);
    assert.equal(result.data[1], 100);
    assert.equal(result.error, null);
    assert.equal(worker.busy, false);

    await worker.release();
    assert.ok(retired);
    assert.throws(() => worker.submit({}), /released/);
});

test('createCivWorker decodes worker errors correctly', async () => {
    const ctx = createContext();
    let currentJob = null;
    const mockBackend = {
        get busy() { return !!currentJob; },
        evaluate: () => {},
        locate: () => ({ list: 'old', nodes: 2 }),
        forgetShared: () => {},
        submit: () => { currentJob = true; },
        poll: (page) => {
            const words = new Uint32Array(page.buffer, page.byteOffset, 8);
            words[0] = 0x42564943;
            words[1] = 1;
            words[2] = 336;
            words[3] = (0x454e4421 ^ 1) >>> 0;
            words[4] = 1; // Error status
            const errorMsg = 'Boom in civStep';
            words[5] = errorMsg.length;
            for (let i = 0; i < errorMsg.length; i++) page[64 + i] = errorMsg.charCodeAt(i);
            currentJob = null;
            return { waitMs: 0.1, copyMs: 0.1, submitMs: 0.05 };
        },
        stats: () => ({ status: 'ready', jobs: 1, busy: false })
    };

    const worker = ctx.PayloadNativeWorker.create(mockBackend);
    await worker.load('function civStep() { throw new Error("Boom"); }', { bytes: 16 });
    worker.submit({});
    const res = worker.poll();
    assert.ok(res);
    assert.equal(res.error, 'Boom in civStep');
    assert.equal(worker.stats().errors, 1);
});

test('createCivWorker step executes synchronously while idle', async () => {
    const ctx = createContext();
    const evaluated = [];
    const mockBackend = {
        busy: false,
        evaluate: (stage, script) => { evaluated.push({ stage, script }); },
        locate: () => ({ list: 'young', nodes: 1 }),
        readShared: (page) => {
            const words = new Uint32Array(page.buffer, page.byteOffset, 8);
            words[0] = 0x42564943;
            words[1] = 1;
            words[2] = 336;
            words[3] = (0x454e4421 ^ 1) >>> 0;
            words[4] = 0;
        },
        forgetShared: () => {},
        stats: () => ({ status: 'ready', jobs: 0, busy: false })
    };

    const worker = ctx.PayloadNativeWorker.create(mockBackend);
    await worker.load('function civStep(i, o) {}', { bytes: 16 });

    const stepSeq = worker.step({ hello: 'world' });
    assert.equal(stepSeq, 1);
    assert.ok(evaluated.some(e => e.stage === 'step' && e.script.includes('hello')));
});

test('createCivWorkerNative rejects if native primitives are missing', () => {
    const ctx = createContext();
    assert.throws(() => ctx.PayloadNativeWorker.createNative({}), /unavailable/);
});

function executingBackend(ctx) {
    return {
        busy: false,
        evaluate: (_stage, source) => vm.runInContext(source, ctx),
        locate: () => ({ list: 'young', nodes: 1 }),
        forgetShared() {},
        stats: () => ({ status: 'ready' })
    };
}

test('worker reload owns fresh lexical and var bindings and rejects a missing handler', async () => {
    const ctx = createContext(), backend = executingBackend(ctx);
    const worker = ctx.PayloadNativeWorker.create(backend);
    const sources = ['let state = 0; var increment = 2;',
        'const civStep = function() { globalThis.observed = state += increment; };'];
    for (let i = 0; i < 2; i++) {
        await worker.load(sources, { bytes: 16 });
        worker.step(null);
        assert.equal(ctx.observed, 2);
    }
    assert.equal(vm.runInContext('typeof increment', ctx), 'undefined');
    await assert.rejects(worker.load('var differentApp = true;', { bytes: 16 }), /civStep missing/);
    assert.throws(() => worker.step(null), /no app code/);
    await worker.load(sources, { bytes: 16 });
    worker.step(null);
    assert.equal(ctx.observed, 2);
});

test('native adapter reopens a released handle over the retained backend', async () => {
    const ctx = createContext();
    ctx.window = ctx;
    ctx.__civNativeWorkerBackend = executingBackend(ctx);
    const source = fs.readFileSync(__dirname + '/../app/src/platform/native.js', 'utf8');
    const getter = source.slice(source.indexOf('        var sharedWorker=null;'), source.indexOf('        return {io:io'));
    const getWorker = vm.runInContext('(function(){' + getter + ';return getWorker;})()', ctx);
    const first = getWorker();
    assert.equal(getWorker(), first);
    await first.load('let n=0; function civStep(){ globalThis.observed=++n; }', { bytes: 16 });
    await first.release();
    assert.equal(first.released, true);
    const second = getWorker();
    assert.notEqual(second, first);
    assert.equal(getWorker(), second);
    await second.load('let n=0; function civStep(){ globalThis.observed=++n; }', { bytes: 16 });
    second.step(null);
    assert.equal(ctx.observed, 1);
    await assert.rejects(first.load('function civStep(){}', { bytes: 16 }), /released/);
});
