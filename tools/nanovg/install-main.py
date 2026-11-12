#!/usr/bin/env python3
"""Install the native UI-only main launcher through existing two-slot updates.
Keeps a verified PC backup and never rewrites a core or boot trigger.
"""
import argparse,base64,hashlib,importlib.util,json,re,sys,time
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'));sys.path.insert(0,str(Path(__file__).resolve().parent))
from device import request
from send_app import send_stage
from payload_menu import rpc,system_package,fnv_hash
from package_payload import wire_json
spec=importlib.util.spec_from_file_location('package_main',Path(__file__).with_name('package-main.py'));builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)

def finite(host,source,path):
    path.parent.mkdir(parents=True,exist_ok=True)
    with path.open('wb')as out:send_stage(host,9026,source.encode(),out,timeout=120)
    return path.read_text()

def read_report(host,body,label,path):
    source='''(async function(){var value=await (async function(){BODY})();var text=JSON.stringify(value);if(text.length>12*1024*1024)throw Error('Install report bound');var encoded=PayloadCore.base64(PayloadCore.encode(text)),count=Math.ceil(encoded.length/900);for(var i=0;i<count;i++)await log('LABEL '+i+'/'+count+' '+encoded.slice(i*900,(i+1)*900));await log('LABEL_COMPLETE');})();'''.replace('BODY',body).replace('LABEL',label)
    text=finite(host,source,path);parts=re.findall(re.escape(label)+r' (\d+)/(\d+) ([A-Za-z0-9+/=]+)',text)
    if not parts or label+'_COMPLETE'not in text:raise RuntimeError('Incomplete install report')
    count=int(parts[0][1]);chunks={int(a):c for a,b,c in parts}
    if set(chunks)!=set(range(count)):raise RuntimeError('Missing install report chunks')
    return json.loads(base64.b64decode(''.join(chunks[i]for i in range(count))))

def wait_idle(host):
    deadline=time.monotonic()+45
    while time.monotonic()<deadline:
        state=request(host,{'op':'status'})['state']
        if not state.get('busy'):return state
        time.sleep(.25)
    raise RuntimeError('Resident transition did not finish; do not resend update')

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('command',choices=['install','verify']);p.add_argument('host');a=p.parse_args()
    evidence=ROOT/'investigation/evidence'
    if a.command=='install':image,manifest=builder.build()
    else:
        installed=json.loads((evidence/'nanovg-main-installed.json').read_text());image={'checksum':installed['checksum'],'release':installed['release']};manifest={k:installed[k]for k in ['identity','packageSha256','sourceSha256']}
    stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ');backup=ROOT/'build/nanovg/install-backups'/stamp;
    if a.command=='install':backup.mkdir(parents=True,exist_ok=True)
    state=wait_idle(a.host)
    if state['mode']not in ['launcher','terminal']:raise RuntimeError('Close the foreground app before installing')
    if a.command=='install':
        before=read_report(a.host,"""var b=window.__civhomebrewBoot,s=await b.system.status('launcher');if(s.pending!==null)throw Error('A launcher update is already pending');if(s.active!==0&&s.active!==1)throw Error('No active launcher to preserve');var n='slot-'+s.active,source=await b.native.io.read(PayloadCore.path('system/launcher/'+n+'.js'),8*1024*1024,false),meta=PayloadCore.open(await b.native.io.read(PayloadCore.path('system/launcher/'+n+'.json'),65536,false));if(PayloadCore.hash(source)!==s.hashes[s.active]||meta.checksum!==s.hashes[s.active])throw Error('Existing launcher backup hash mismatch');var ui=window.CivNanoVGSession&&CivNanoVGSession.current;if(ui&&ui.active)await ui.active.lease.close();return {state:s,metadata:meta,source:source,core:await b.system.status('core')};""",'CIV_NATIVE_MAIN_BACKUP',backup/'transfer.txt')
        previous=system_package('launcher',before['source'],before['metadata']['release']);assert previous['checksum']==before['metadata']['checksum']==fnv_hash(before['source'])
        (backup/'launcher.civupdate').write_bytes(wire_json(previous)+b'\n');(backup/'launcher.js').write_text(before.pop('source'));(backup/'state.json').write_text(json.dumps(before,indent=2)+'\n')
        print(f'Verified previous launcher backup: {backup}',flush=True)
        if previous['checksum']!=image['checksum']:
            prepare="""(async function(){var b=window.__civhomebrewBoot,s=await b.system.status('launcher');if(s.pending!==null||s.hashes[s.active]!==EXPECTED)throw Error('Launcher changed after backup');var sessions=window.CivNanoVGSession,shared=sessions&&sessions.current,t=window.__civNanoVGTerminalTrial;if(shared&&!window.__civNanoVGMainLauncher){if(!t||!t.active||t.session!==shared||t.error||shared.stats.errors.length)throw Error('Existing native UI cannot be adopted safely');window.__civNanoVGLauncherAdoption={session:shared,sessions:sessions,prototype:window.CivNanoVGPrototype,factory:t.factory,ftp:t.ftp};window.__civNanoVGMainInstallUndo={choose:b.system.choose,trial:t,stop:t.stop};b.system.choose=CivSystem.create(b.native.io).choose;t.active=false;delete t.stop;}await log('CIV_NATIVE_MAIN_ADOPTION_READY');})();""".replace('EXPECTED',json.dumps(previous['checksum']))
            finite(a.host,prepare,evidence/'nanovg-main-adoption.txt')
            result=rpc(a.host,9027,{'op':'update','package':image});print(json.dumps(result),flush=True)
            time.sleep(.3)
            state=wait_idle(a.host)
            (evidence/'nanovg-main-update-response.json').write_text(json.dumps(result,indent=2)+'\n')
        else:print('Exact launcher source is already installed; verifying it.',flush=True)
    body="""var b=window.__civhomebrewBoot,s=await b.system.status('launcher');if(s.pending!==null||s.hashes[s.active]!==EXPECTED)throw Error('New launcher has not been acknowledged');var source=await b.native.io.read(PayloadCore.path('system/launcher/slot-'+s.active+'.js'),8*1024*1024,false);if(PayloadCore.hash(source)!==EXPECTED)throw Error('Installed source readback mismatch');var c=window.__civNanoVGMainLauncher,shared=window.CivNanoVGSession&&CivNanoVGSession.current;if(!c||c.identity!==IDENTITY||!c.mounts||!shared||shared.stats.errors.length)throw Error('Persistent native UI is not active');if(shared.active)await shared.active.lease.close();delete window.__civNanoVGMainInstallUndo;return {source:source,state:s,core:await b.system.status('core'),identity:c.identity,release:c.release,mounts:c.mounts,native:shared.renderer.owner?{state:shared.renderer.owner.state,device:String(shared.renderer.owner.display.device),swapchain:String(shared.renderer.owner.display.swapchain)}:null};""".replace('EXPECTED',json.dumps(image['checksum'])).replace('IDENTITY',json.dumps(manifest['identity']))
    verified=read_report(a.host,body,'CIV_NATIVE_MAIN_VERIFY',evidence/('nanovg-main-cold-verify-transfer.txt'if a.command=='verify'else'nanovg-main-verify-transfer.txt'));verified.update(packageSha256=manifest['packageSha256'],sourceSha256=manifest['sourceSha256'],checksum=image['checksum'],backup=str(backup)if a.command=='install'else None,verification='live source readback and acknowledged main component')
    saved_source=verified.pop('source');assert hashlib.sha256(saved_source.encode()).hexdigest()==manifest['sourceSha256'],'Installed source SHA mismatch'
    saved_image=system_package('launcher',saved_source,image['release']);saved_bytes=wire_json(saved_image)+b'\n';assert hashlib.sha256(saved_bytes).hexdigest()==manifest['packageSha256'],'Installed package reconstruction mismatch'
    (ROOT/'dist/launcher-nanovg-main-installed.js').write_text(saved_source);(ROOT/'dist/launcher-nanovg-main-installed.civupdate').write_bytes(saved_bytes)
    if a.command=='install':assert verified['core']==before['core'],'Core component state changed unexpectedly'
    (evidence/('nanovg-main-cold-verified.json'if a.command=='verify'else'nanovg-main-installed.json')).write_text(json.dumps(verified,indent=2)+'\n')
    rpc(a.host,9027,{'op':'launcher'});time.sleep(.3);state=wait_idle(a.host)
    if state['mode']!='launcher':raise RuntimeError('Installed launcher did not remount')
    print(json.dumps({'verified':verified,'resident':state},indent=2),flush=True)
if __name__=='__main__':main()
