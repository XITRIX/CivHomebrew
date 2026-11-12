#!/usr/bin/env python3
"""RAM-only native terminal trial. Never stages/installs a system component."""
import argparse,base64,json,re,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'));sys.path.insert(0,str(Path(__file__).resolve().parent))
from package import SCRIPTS,LAUNCHER_SCRIPTS
from package_payload import pack_directory,read_package,wire_json
from send_app import build_payload,plan_upload,send_stage
from device import request

def build():
    import shutil
    folder=ROOT/'build/nanovg/terminal-trial';folder.mkdir(parents=True,exist_ok=True)
    sources=SCRIPTS+LAUNCHER_SCRIPTS[:-1];paths=[]
    for i,p in enumerate(sources):
        target=folder/f'{i:02d}-{p.name}';shutil.copyfile(p,target);paths.append(target)
    flags=folder/'activation.js';flags.write_text('CivNanoVGPrototype.enabled=true;window.__civNanoVGNextMount=true;\n');paths.append(flags)
    for p in [ROOT/'app/app.js',ROOT/'investigation/probes/nanovg/terminal-trial.js',ROOT/'investigation/probes/nanovg/terminal-checks.js']:
        target=folder/p.name;shutil.copyfile(p,target);paths.append(target)
    manifest={'id':'civhomebrew-native-terminal-trial','name':'Native Terminal RAM Trial','api':1,'release':'0.1.0','scripts':[p.name for p in paths]}
    (folder/'payload.json').write_text(json.dumps(manifest,indent=2)+'\n')
    package=pack_directory(folder);output=ROOT/'dist/nanovg-terminal-trial.civapp';output.write_bytes(wire_json(package)+b'\n');assert read_package(output)==package
    source=build_payload(paths);(ROOT/'dist/nanovg-terminal-trial.js').write_bytes(source)
    print(f'Built and inspected {output}: {output.stat().st_size:,} bytes, {len(paths)} scripts; finite activation last',flush=True)
    return source

def finite(host,source,output):
    stages,final=plan_upload(source)
    for piece in stages+[final]:send_stage(host,9026,piece,output,timeout=120)

def extract(host):
    source=b'''(async function(){var t=window.__civNanoVGTerminalTrial;if(!t||!t.snapshot)throw Error('No terminal trial');var text=JSON.stringify(t.snapshot());if(text.length>262144)throw Error('Terminal report bound');var s=PayloadCore.base64(PayloadCore.encode(text)),count=Math.ceil(s.length/900);for(var i=0;i<count;i++)await log('CIV_NATIVE_TERMINAL_DATA '+i+'/'+count+' '+s.slice(i*900,(i+1)*900));await log('CIV_NATIVE_TERMINAL_RESULT_COMPLETE');})();'''
    folder=ROOT/'investigation/evidence';folder.mkdir(exist_ok=True);path=folder/'nanovg-terminal-results.txt'
    with path.open('wb') as out:finite(host,source,out)
    text=path.read_text();parts=re.findall(r'CIV_NATIVE_TERMINAL_DATA (\d+)/(\d+) ([A-Za-z0-9+/=]+)',text)
    if not parts or 'CIV_NATIVE_TERMINAL_RESULT_COMPLETE' not in text:raise RuntimeError('Incomplete native terminal report')
    count=int(parts[0][1]);chunks={int(a):c for a,b,c in parts};assert set(chunks)==set(range(count))
    result=json.loads(base64.b64decode(''.join(chunks[i]for i in range(count))));(folder/'nanovg-terminal-results.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('command',choices=['build','start','status','extract','stop']);p.add_argument('host',nargs='?');a=p.parse_args()
    if a.command=='build':build();return
    if not a.host:p.error('host required')
    if a.command=='status':print(json.dumps(request(a.host,{'op':'status'})['state'],indent=2));return
    if a.command=='extract':extract(a.host);return
    state=request(a.host,{'op':'status'})['state']
    if state.get('busy')or state.get('mode')not in ['launcher','terminal']:raise RuntimeError('An idle resident launcher or terminal is required')
    if a.command=='stop':finite(a.host,b'(async function(){var t=window.__civNanoVGTerminalTrial;if(!t||!t.stop)throw Error("No terminal trial");await t.stop();await log("CIV_NATIVE_TERMINAL_STOPPED; restart Civ VII for visible Gameface return");})();',sys.stdout.buffer);return
    source=build();path=ROOT/'investigation/evidence/nanovg-terminal-start.txt';path.parent.mkdir(exist_ok=True)
    with path.open('wb')as out:finite(a.host,source,out)
    print('RAM trial activated. Automated real-core switches are running. Do not resend.',flush=True)
if __name__=='__main__':main()
