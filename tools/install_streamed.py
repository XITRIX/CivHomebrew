#!/usr/bin/env python3
"""Install v1 packages one file at a time through the idle resident raw bridge.

Only metadata/descriptors survive between requests. Retire the catalog entry,
remove its folder, verify each committed file, and publish the manifest/catalog
last. No recovery copies and no whole-package JSON in the console heap.
"""
import argparse
import base64
import json
import re
import secrets
from pathlib import Path
from payload_menu import rpc, fnv_hash
from package_payload import read_package, wire_json
from send_app import plan_upload, send_stage


def plan(package):
    files = [dict(name='scripts/' + s['name'], data=s['source'], binary=False,
                  bytes=len(s['source'].encode()), checksum=fnv_hash(s['source'])) for s in package['scripts']]
    scripts = [dict(name=s['name'], path=f['name'], bytes=f['bytes'], checksum=f['checksum']) for s, f in zip(package['scripts'], files)]
    icon = None
    if package.get('icon'):
        raw = base64.b64decode(package['icon'].split(',', 1)[1]).decode('latin1')
        icon = dict(path='icon.png', bytes=len(raw), checksum=fnv_hash(raw))
        files.append(dict(name='icon.png', data=raw, binary=True, bytes=len(raw), checksum=fnv_hash(raw)))
    manifest = dict(format='civswitch-installed-app', version=1, id=package['id'], name=package['name'], metadata=package['metadata'], scripts=scripts, icon=icon)
    text = wire_json(manifest).decode()
    entry = dict(id=manifest['id'], name=manifest['name'], bytes=len(text.encode()) + sum(f['bytes'] for f in files), checksum=fnv_hash(text))
    return dict(manifest=manifest, text=text, entry=entry, files=files)


def begin_body(p, token):
    descriptors = [{k: v for k, v in f.items() if k != 'data'} for f in p['files']]
    value = dict(manifest=p['manifest'], text=p['text'], entry=p['entry'], files=descriptors, token=token)
    return 'var input=' + json.dumps(value, ensure_ascii=True) + ''';
var C=PayloadCore,io=__civhomebrewBoot.native.io;
if(window.__civStreamInstall)throw Error('A streamed install is already active');
C.installedManifest(input.manifest);
if(JSON.stringify(input.manifest)!==input.text||C.hash(input.text)!==input.entry.checksum)throw Error('Manifest integrity mismatch');
var total=C.encode(input.text).length;
for(var i=0;i<input.files.length;i++){var f=input.files[i],s=input.manifest.scripts[i];
 if(s){if(f.binary||f.name!==s.path||f.bytes!==s.bytes||f.checksum!==s.checksum)throw Error('Script descriptor mismatch');}
 else{var icon=input.manifest.icon;if(i!==input.files.length-1||!icon||!f.binary||f.name!==icon.path||f.bytes!==icon.bytes||f.checksum!==icon.checksum)throw Error('Icon descriptor mismatch');}
 C.appPath(input.manifest.id,f.name);total+=f.bytes;
}
if(input.files.length!==input.manifest.scripts.length+(input.manifest.icon?1:0)||total!==input.entry.bytes||input.entry.id!==input.manifest.id||input.entry.name!==input.manifest.name)throw Error('Install plan mismatch');
var store=C.createStore(io);await store.load();
await store.transaction(async function(tx){
 var position=tx.entries.findIndex(function(e){return e.id===input.entry.id;}),entries=[];
 for(var i=0;i<tx.entries.length;i++)entries.push(i===position?input.entry:tx.entries[i]);
 if(position<0)entries.push(input.entry);
 C.catalog({version:2,generation:1,entries:entries});
 var retired=tx.entries.filter(function(e){return e.id!==input.entry.id;});
 if(position>=0)await tx.publish(retired);
 await tx.files.removeDirectory(input.entry.id);await tx.files.commit();
 await tx.files.ensureDirectory(input.entry.id);await tx.files.ensureDirectory(input.entry.id,'scripts');
 window.__civStreamInstall={token:input.token,manifest:input.manifest,text:input.text,entry:input.entry,files:input.files,entries:entries,retired:JSON.stringify(retired),next:0};
});return {ready:true,files:input.files.length};'''


def file_body(index, f, token):
    return 'var token=' + json.dumps(token) + ',index=' + str(index) + ',source=' + json.dumps(f['data'], ensure_ascii=True) + ''';
var C=PayloadCore,s=window.__civStreamInstall;
if(!s||s.token!==token||s.next!==index)throw Error('Streamed file order mismatch');
var f=s.files[index];if(!f||C.hash(source)!==f.checksum||(f.binary?source.length:C.encode(source).length)!==f.bytes)throw Error('Streamed file integrity mismatch');
if(f.binary)C.png(source);
var store=C.createStore(__civhomebrewBoot.native.io);await store.load();
await store.transaction(async function(tx){
 if(JSON.stringify(tx.entries)!==s.retired)throw Error('Catalog changed during streamed install');
 var parts=f.name.split('/');parts.pop();for(var j=1;j<=parts.length;j++)await tx.files.ensureDirectory(s.entry.id,parts.slice(0,j).join('/'));
 await tx.files.write(s.entry.id,f.name,source,f.binary);await tx.files.commit();
 var actual=await tx.files.read(s.entry.id,f.name,f.bytes,f.binary);
 if(actual!==source)throw Error('Streamed file readback mismatch');
 s.next++;
});return {index:index,bytes:f.bytes,checksum:f.checksum};'''


def finish_body(token):
    return 'var token=' + json.dumps(token) + ''';
var C=PayloadCore,s=window.__civStreamInstall;
if(!s||s.token!==token||s.next!==s.files.length)throw Error('Streamed install is incomplete');
var store=C.createStore(__civhomebrewBoot.native.io);await store.load();
await store.transaction(async function(tx){
 if(JSON.stringify(tx.entries)!==s.retired)throw Error('Catalog changed during streamed install');
 await tx.files.write(s.entry.id,'manifest.json',s.text,false);await tx.files.commit();
 if(await tx.files.read(s.entry.id,'manifest.json',65536,false)!==s.text)throw Error('Manifest readback mismatch');
 await tx.publish(s.entries);
});var entry=s.entry;delete window.__civStreamInstall;return {entry:entry};'''


def request(host, port, body, output, raw_port=9026):
    state = rpc(host, port, {'op': 'status'})['state']
    if state['busy'] or state['mode'] not in ['launcher', 'terminal']:
        raise RuntimeError('Close foreground apps before installing')
    label = 'CIV_STREAM_INSTALL'
    source = "(async function(){var value=await (async function(){" + body + "})();var text=PayloadCore.base64(PayloadCore.encode(JSON.stringify(value)));for(var i=0;i<text.length;i+=900)await log('" + label + " '+text.slice(i,i+900));await log('" + label + "_COMPLETE');})();"
    stages, last = plan_upload(source.encode())
    with output.open('wb') as stream:
        for stage in stages:
            send_stage(host, raw_port, stage, stream, timeout=60)
        send_stage(host, raw_port, last, stream, timeout=90)
    text = output.read_text()
    if label + '_COMPLETE' not in text:
        raise RuntimeError('Streamed install did not finish; inspect console before another request')
    chunks = re.findall(label + r' ([A-Za-z0-9+/=]+)', text)
    return json.loads(base64.b64decode(''.join(chunks)))


def install_package(host, package, output, port=9027, raw_port=9026):
    p = plan(package)
    output = Path(output);output.mkdir(parents=True, exist_ok=True)
    token = secrets.token_hex(16)
    request(host, port, begin_body(p, token), output / 'begin.txt', raw_port)
    for i, f in enumerate(p['files']):
        actual = request(host, port, file_body(i, f, token), output / ('file-' + str(i) + '.txt'), raw_port)
        if actual != dict(index=i, bytes=f['bytes'], checksum=f['checksum']):
            raise RuntimeError('Unexpected streamed file receipt')
        print('Verified ' + str(i + 1) + '/' + str(len(p['files'])) + ': ' + f['name'], flush=True)
    return request(host, port, finish_body(token), output / 'finish.txt', raw_port)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('host');parser.add_argument('package', type=Path);parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    print(install_package(args.host, read_package(args.package), args.output))
