#!/usr/bin/env python3
"""Build/run a finite RAM-only NanoVG console comparison; extract bounded logs.
No persistent component installation or boot/save modification. No retries.
"""
import argparse
import base64
import json
from pathlib import Path
import re
import shutil
import socket
import struct
import sys

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
from package_payload import pack_directory,read_package,wire_json
from payload_menu import LAUNCHER_SCRIPTS
from send_app import send_stage
sys.path.insert(0,str(Path(__file__).resolve().parent))
from package import SCRIPTS

def build():
    directory=ROOT/'build/nanovg/benchmark';directory.mkdir(parents=True,exist_ok=True)
    names=[]
    for i,path in enumerate(SCRIPTS+LAUNCHER_SCRIPTS[:-1]):
        if not path.is_file():raise ValueError(f'Missing dependency: {path}')
        name=f'{i:02d}-{path.name}';shutil.copyfile(path,directory/name);names.append(name)
    flags='CivNanoVGPrototype.enabled=false;CivNanoVGPrototype.defer=true;window.__civNanoVGNextMount=true;\n'
    (directory/'benchmark-flags.js').write_text(flags);names.append('benchmark-flags.js')
    for path in [ROOT/'app/app.js',ROOT/'investigation/probes/nanovg/console-benchmark.js']:
        shutil.copyfile(path,directory/path.name);names.append(path.name)
    manifest={'id':'civhomebrew-nanovg-benchmark','name':'NanoVG Console Benchmark','api':1,'release':'0.1.0','description':'RAM-only Gameface and NanoVG 1080p 60/120 Hz comparison','scripts':names}
    (directory/'payload.json').write_text(json.dumps(manifest,indent=2)+'\n')
    package=pack_directory(directory);output=ROOT/'dist/nanovg-benchmark.civapp';output.write_bytes(wire_json(package)+b'\n')
    actual=read_package(output);assert actual==package;assert actual['scripts'][-1]['name']=='console-benchmark.js'
    print(f'Built and inspected {output}: {output.stat().st_size:,} bytes, {len(names)} ordered scripts',flush=True)
    return package

def request(host,message,timeout=15):
    data=wire_json({'protocol':1,**message})
    with socket.create_connection((host,9027),timeout=10) as s:
        s.settimeout(timeout);s.sendall(struct.pack('>I',len(data))+data)
        def read(n):
            out=[]
            while n:
                b=s.recv(n)
                if not b:raise RuntimeError('Management connection closed before its response')
                out.append(b);n-=len(b)
            return b''.join(out)
        size=struct.unpack('>I',read(4))[0]
        if not 0<size<=48*1024*1024:raise RuntimeError('Management frame bound')
        result=json.loads(read(size))
        if not result.get('ok'):raise RuntimeError(result.get('error','Management request rejected'))
        return result

def extract(host):
    source="""(async function(){var v=window.__civNanoVGBenchmark;if(!v||v.version!==1)throw Error('No NanoVG result');var text=JSON.stringify(v,function(k,x){return typeof x==='bigint'?x.toString():x;});if(text.length>262144)throw Error('Benchmark result bound');var encoded=PayloadCore.base64(PayloadCore.encode(text)),count=Math.ceil(encoded.length/900);for(var i=0;i<count;i++)await log('CIV_NANOVG_DATA '+i+'/'+count+' '+encoded.slice(i*900,(i+1)*900));await log('CIV_NANOVG_RESULT_COMPLETE');})();"""
    directory=ROOT/'investigation/evidence';directory.mkdir(parents=True,exist_ok=True)
    path=directory/'nanovg-console-results.txt'
    with path.open('wb') as output:send_stage(host,9026,source.encode(),output,timeout=60)
    text=path.read_text();chunks={};count=None
    for match in re.finditer(r'CIV_NANOVG_DATA (\d+)/(\d+) ([A-Za-z0-9+/=]+)',text):
        index,total=map(int,match.group(1,2));count=total;chunks[index]=match[3]
    if 'CIV_NANOVG_RESULT_COMPLETE' not in text or count is None or set(chunks)!=set(range(count)):raise RuntimeError('Incomplete result transfer')
    result=json.loads(base64.b64decode(''.join(chunks[i] for i in range(count))))
    (directory/'nanovg-console-results.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('command',choices=['build','run','status','extract']);p.add_argument('host',nargs='?');a=p.parse_args()
    if a.command=='build':build();return
    if not a.host:p.error('host is required')
    if a.command=='extract':extract(a.host);return
    state=request(a.host,{'op':'status'})['state']
    if a.command=='status':print(json.dumps(state,indent=2));return
    if state.get('busy') or state.get('mode')!='launcher':raise RuntimeError('Benchmark requires an idle launcher')
    package=build();result=request(a.host,{'op':'run-source','package':package},timeout=60)
    print(json.dumps(result,indent=2));print('Accepted into RAM. Do not resend. Check status; extract only after the app finishes.',flush=True)
if __name__=='__main__':main()
