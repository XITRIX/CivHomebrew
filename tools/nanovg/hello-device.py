#!/usr/bin/env python3
"""Back up/update installed Hello, then test its shared native view on Switch.
Does not update the launcher/core or lift the launcher's UI-only guard.
"""
import argparse,hashlib,importlib.util,json,sys,time
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
from package_payload import read_package,validate,wire_json
from payload_menu import rpc,INSTALL_SCRIPTS
from send_app import build_payload
spec=importlib.util.spec_from_file_location('install_main',Path(__file__).with_name('install-main.py'));helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('command',choices=['install','recover','test','extract','test-launcher','extract-launcher']);p.add_argument('host');p.add_argument('--backup',type=Path);a=p.parse_args()
    e=ROOT/'investigation/evidence';state=helper.wait_idle(a.host)
    if state['mode'] not in ['launcher','terminal']:raise RuntimeError('Close the foreground app first')
    if a.command in ['install','recover']:
        image=read_package(ROOT/'dist/hello.civapp')
        if a.command=='install':
            stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ');backup=ROOT/'build/nanovg/install-backups'/stamp;backup.mkdir(parents=True)
            before=helper.read_report(a.host,"""var b=window.__civhomebrewBoot,s=PayloadCore.createStore(b.native.io);await s.load();var p=await s.read('hello-civswitch');p.icon=await s.icon(p.id);return {package:p,entries:s.list(),core:await b.system.status('core'),launcher:await b.system.status('launcher')};""",'CIV_HELLO_BACKUP',backup/'hello-transfer.txt')
            old=validate(before.pop('package'));(backup/'hello.civapp').write_bytes(wire_json(old)+b'\n');(backup/'hello-state.json').write_text(json.dumps(before,indent=2)+'\n')
            print('Verified Hello backup: '+str(backup),flush=True)
            try:result=rpc(a.host,9027,{'op':'install','package':image})
            except RuntimeError as error:
                (e/'nanovg-hello-install-rejected.json').write_text(json.dumps({'error':str(error),'backup':str(backup),'automaticRetry':False},indent=2)+'\n');raise
        else:
            if not a.backup:raise RuntimeError('Recovery requires the existing verified --backup directory')
            backup=a.backup;read_package(backup/'hello.civapp');before=json.loads((backup/'hello-state.json').read_text())
            body="""var s=PayloadCore.createStore(__civhomebrewBoot.native.io);await s.load();var p=PayloadCore.installPlan(IMAGE),entries=s.list(),next=entries.filter(e=>e.id!==p.id);next.push(p.entry);PayloadCore.catalog({version:2,generation:1,entries:next});return {entries:entries,entry:p.entry,limits:{frame:PayloadCore.maxFrame,quota:PayloadCore.quota},validated:true};""".replace('IMAGE',wire_json(image).decode())
            diagnostic=helper.read_report(a.host,body,'CIV_HELLO_PREFLIGHT',e/'nanovg-hello-install-preflight.txt')
            assert diagnostic['entries']==before['entries'],'Catalog changed since the rejected install'
            (e/'nanovg-hello-install-preflight.json').write_text(json.dumps(diagnostic,indent=2)+'\n')
            source=build_payload(INSTALL_SCRIPTS).decode()+';\n(async function(){var s=PayloadCore.createStore(__civhomebrewBoot.native.io);await s.load();await s.install('+wire_json(image).decode()+');await log("CIV_HELLO_RECOVERY_INSTALLED");})();'
            output=helper.finite(a.host,source,e/'nanovg-hello-install-recovery.txt')
            if 'CIV_HELLO_RECOVERY_INSTALLED' not in output or 'Executed successfully' not in output:raise RuntimeError('Raw-loader install did not complete; do not resend')
            result={'ok':True,'path':'validated raw-loader installer after resident rejection'}
        actual=helper.read_report(a.host,"""var b=window.__civhomebrewBoot,s=PayloadCore.createStore(b.native.io);await s.load();var p=await s.read('hello-civswitch');p.icon=await s.icon(p.id);return {package:p,entries:s.list(),core:await b.system.status('core'),launcher:await b.system.status('launcher')};""",'CIV_HELLO_VERIFY',e/'nanovg-hello-install-transfer.txt')
        assert actual.pop('package')==image,'Installed Hello bytes differ'
        assert actual['core']==before['core'] and actual['launcher']==before['launcher'],'System components changed'
        assert [x for x in actual['entries'] if x['id']!='hello-civswitch']==[x for x in before['entries'] if x['id']!='hello-civswitch'],'Other apps changed'
        actual.update(backup=str(backup),packageSha256=hashlib.sha256(wire_json(image)+b'\n').hexdigest(),response=result,metadata=image['metadata'])
        (e/'nanovg-hello-installed.json').write_text(json.dumps(actual,indent=2)+'\n')
        rpc(a.host,9027,{'op':'launcher'});print(json.dumps(actual,indent=2));return
    if a.command=='test-launcher':
        helper.finite(a.host,(ROOT/'investigation/probes/nanovg-hello-launcher-start.js').read_text(),e/'nanovg-hello-launcher-start-activation.txt')
        print('Started Hello through launcher navigation and Start/A. Do not resend.');return
    if a.command=='test':
        helper.finite(a.host,(ROOT/'investigation/probes/nanovg-hello-roundtrips.js').read_text(),e/'nanovg-hello-roundtrips-start.txt')
        print('Started installed Hello roundtrips. Do not resend; extract after completion.');return
    from_launcher=a.command=='extract-launcher';name='nanovg-hello-launcher-start' if from_launcher else 'nanovg-hello-roundtrips'
    report=helper.read_report(a.host,'return window.'+('__civNanoVGHelloLauncherStart' if from_launcher else '__civNanoVGHelloRoundtrips')+';','CIV_HELLO_RESULT',e/(name+'-transfer.txt'))
    (e/(name+'.json')).write_text(json.dumps(report,indent=2)+'\n');rpc(a.host,9027,{'op':'launcher'});print(json.dumps(report,indent=2))
    if not report.get('complete') or report.get('error'):raise RuntimeError('Hello roundtrips did not pass')
if __name__=='__main__':main()
