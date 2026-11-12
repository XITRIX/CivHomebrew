#!/usr/bin/env python3
"""Cold-start exact component images in RAM; no backups or installed slot writes.
Start Civ VII with Minus held at Load Game to enter recovery Terminal first.
"""
import argparse, base64, hashlib, importlib.util, json, sys, time
from pathlib import Path
from payload_menu import BOOT_SCRIPTS, ROOT, rpc, system_package
from send_app import build_payload, plan_upload, send_stage, launch

OUT=ROOT/'build/startup-trial'

def build(core,launcher,installed_files=False,installed_bootstrap=False):
    images={name:json.loads(path.read_text()) for name,path in [('core',core),('launcher',launcher)]}
    for name,p in images.items():
        if p!=system_package(name,p['source'],p['release']):raise ValueError('Invalid component: '+name)
    icons={k:'data:image/png;base64,'+base64.b64encode((ROOT/('app/assets/button-'+('minus' if k=='-' else k.lower())+'.png')).read_bytes()).decode() for k in ['A','B','X','Y','-']}
    config={'port':9027,'ftpPort':5000,'terminal':False,'bootIntegrated':True,'buttonIcons':icons,'seeds':images}
    boot='window.__payloadMenuConfig='+json.dumps(config,ensure_ascii=True)+';\n'+build_payload(BOOT_SCRIPTS).decode()+'\n'+(ROOT/'app/boot.js').read_text()
    # Direct eval retains the original loader native bindings and lifetime.
    activation='await eval(g.__startupTrialFileBoot);' if installed_files else 'await eval('+json.dumps(boot,ensure_ascii=True)+');'
    if installed_bootstrap:
        header='window.__payloadMenuConfig='+json.dumps(config,ensure_ascii=True)+';'+chr(10)
        activation='var originalBoot=g.__startupTrialFileBoot;await eval('+json.dumps(header,ensure_ascii=True)+'+originalBoot.slice(originalBoot.indexOf(String.fromCharCode(10))+1));'
    source=(ROOT/'tools/startup-trial.js').read_text().replace('/* STARTUP_TRIAL_BOOT */',activation)
    OUT.mkdir(parents=True,exist_ok=True);(OUT/'trial.js').write_text(source)
    return source.encode()

def run(host,core,launcher,installed_files=False,installed_bootstrap=False,native_state=False):
    source=build(core,launcher,installed_files,installed_bootstrap)
    state=rpc(host,9027,{'op':'status'})['state']
    if state['mode']!='terminal' or state['busy']:raise RuntimeError('Enter an idle recovery Terminal first')
    body=''
    if installed_files or installed_bootstrap:
        body=r'''var b=__civhomebrewBoot,n=b.native,signature=JSON.stringify([b.config.seeds.core.checksum,b.config.seeds.launcher.checksum]),entries=await n.files.list('save:/civhomebrew/boot-install'),match=null;for(var e of entries){if(!/^bootstrap-.*\.js$/.test(e.name))continue;var text=await n.files.read('save:/civhomebrew/boot-install/'+e.name,524288,false),scope={};(function(window){eval(text.slice(0,text.indexOf('\n')));})(scope);var config=scope.__payloadMenuConfig;if(config&&JSON.stringify([config.seeds.core.checksum,config.seeds.launcher.checksum])===signature&&(!match||text.length>match.text.length))match={name:e.name,text:text};}if(!match)throw Error('Installed bootstrap not identified');var memory=new Map();for(var name of ['core','launcher']){var s=await b.system.status(name);if(s.pending!==null)throw Error('An installed update is pending');var candidate=name==='core'?1:0,expected=name==='core'?'9c1bd5fa':'d7489522';if(s.hashes[candidate]!==expected)throw Error('Retained diagnostic candidate differs');s.pending=candidate;s.attempted=false;memory.set(PayloadCore.path('system/'+name+'/state-'+s.generation%2+'.json'),PayloadCore.seal(s));for(var index of [0,1]){var p=PayloadCore.path('system/'+name+'/slot-'+index+'.json');memory.set(p,await n.io.read(p,65536,false));}}window.__startupTrialFileState=memory;window.__startupTrialFileBoot=match.text;await log('RAM_INSTALLED_BOOTSTRAP '+match.name);'''
    if installed_bootstrap:body=body[:body.index('var memory=new Map();')]+'window.__startupTrialFileBoot=match.text;await log("RAM_INSTALLED_BOOTSTRAP "+match.name);'
    if native_state:body+='window.__startupTrialNativeState=true;'
    preflight=('(async function(){if(window.__civNanoVGVulkan||window.CivAppsNativeUI)throw Error("Native UI already initialized; restart with Minus held");'+body+'await log("RAM_PREFLIGHT_COMPLETE");})();').encode()
    with (OUT/'preflight.txt').open('wb') as out:send_stage(host,9026,preflight,out,timeout=20)
    rpc(host,9027,{'op':'shutdown'});time.sleep(.5)
    stages,final=plan_upload(source)
    with (OUT/'transfer.txt').open('wb') as out:
        for i,p in enumerate(stages):
            send_stage(host,9026,p,out,timeout=30)
            print('RAM staging '+str(i+1)+'/'+str(len(stages)),flush=True)
        print('Starting exact component cold-start trial. No component files will be installed.',flush=True)
        launch(host,9026,final,out)
    print((OUT/'transfer.txt').read_text()[-10000:],flush=True)

def stage_qualified(host,core,launcher):
    qualification=json.loads((OUT/'qualification.json').read_text())
    images={name:json.loads(path.read_text()) for name,path in [('core',core),('launcher',launcher)]}
    for name,p in images.items():
        expected=qualification['components'][name]
        if p!=system_package(name,p['source'],p['release']) or p['checksum']!=expected['checksum'] or hashlib.sha256(p['source'].encode()).hexdigest()!=expected['sourceSha256']:raise RuntimeError('Package differs from console-qualified bytes: '+name)
    state=rpc(host,9027,{'op':'status'})['state']
    if state['busy'] or state['mode']not in ['terminal','launcher']:raise RuntimeError('RAM trial is busy')
    prefix='''(async function(){var t=window.__civStartupTrial,r=window.__optimizedLauncherTest;if(!t||!t.ready||t.error||!r||!r.complete||r.error||!__civhomebrewBoot.system.__civswitchSerialized)throw Error('Corrected native trial not qualified');var real=CivResident.serializeSystem(CivSystem.create(t.realNative.io)),images='''
    suffix=''';for(var name of ['core','launcher']){var image=images[name],before=await real.status(name);if(before.pending!==null)throw Error('Installed component already pending');await real.stage(image);var after=await real.status(name),v=await t.realNative.io.read(PayloadCore.path('system/'+name+'/slot-'+after.pending+'.js'),8388608,false);if(after.attempted||after.active!==before.active||after.hashes[after.active]!==before.hashes[before.active]||PayloadCore.hash(v)!==image.checksum||PayloadCore.encode(v).length!==PayloadCore.encode(image.source).length)throw Error('Installed staging readback mismatch');v=null;await log('QUALIFIED_COMPONENT_STAGED '+JSON.stringify({name:name,release:image.release,checksum:image.checksum,activePreserved:true}));}await log('QUALIFIED_STAGING_COMPLETE');})();'''
    source=(prefix+json.dumps(images,ensure_ascii=True,separators=(',',':'))+suffix).encode()
    stages,final=plan_upload(source)
    with (OUT/'qualified-staging.txt').open('wb') as out:
        for p in stages:send_stage(host,9026,p,out,timeout=30)
        send_stage(host,9026,final,out,timeout=60)
    text=(OUT/'qualified-staging.txt').read_text()
    if 'QUALIFIED_STAGING_COMPLETE'not in text:raise RuntimeError('No staging completion marker')
    qualification['deployment']='staged; awaiting full Civ VII restart'
    (OUT/'qualification.json').write_text(json.dumps(qualification,indent=2)+'\n')
    print(text[-2000:],flush=True)

def verify_installed(host):
    qualification=json.loads((OUT/'qualification.json').read_text())
    state=rpc(host,9027,{'op':'status'})['state']
    if state['busy'] or state['mode']!='launcher':raise RuntimeError('Wait for the installed Launcher to become idle')
    sys.path.insert(0,str(ROOT/'tools/nanovg'))
    spec=importlib.util.spec_from_file_location('startup_report',ROOT/'tools/nanovg/install-main.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    body='''if(window.__civStartupTrial)throw Error('Still running the RAM trial');var b=__civhomebrewBoot,components={};if(!b.system.__civswitchSerialized)throw Error('System queue is missing');for(var name of ['core','launcher']){var s=await b.system.status(name),source=await b.native.io.read(PayloadCore.path('system/'+name+'/slot-'+s.active+'.js'),8388608,false);components[name]={state:s,checksum:PayloadCore.hash(source),bytes:PayloadCore.encode(source).length};source=null;}var ui=CivAppsNativeUI.sessions.current;return {components:components,sdk:CivHomebrewSDK.version,release:__civNanoVGMainLauncher.release,identity:__civNanoVGMainLauncher.identity,native:{state:ui.renderer.owner.state,device:String(ui.renderer.owner.display.device),swapchain:String(ui.renderer.owner.display.swapchain),errors:ui.stats.errors}};'''
    result=module.read_report(host,body,'INSTALLED_COLD_START',OUT/'installed-cold-start.txt')
    for name,row in result['components'].items():
        if row['state']['pending']is not None or row['state']['attempted']or row['checksum']!=qualification['components'][name]['checksum']:raise RuntimeError('Installed component did not acknowledge matching bytes: '+name)
    if result['sdk']!='1.3.3' or result['native']['state']!='ready' or result['native']['errors']:raise RuntimeError('Installed native session is not healthy')
    (OUT/'installed-cold-start.json').write_text(json.dumps(result,indent=2)+'\n')
    qualification['deployment']='cold activated; active source readback verified'
    (OUT/'qualification.json').write_text(json.dumps(qualification,indent=2)+'\n')
    rpc(host,9027,{'op':'launcher'})
    print(json.dumps(result,indent=2),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('command',choices=['build','run','stage-qualified','verify']);p.add_argument('--host');p.add_argument('--installed-files',action='store_true');p.add_argument('--installed-bootstrap',action='store_true');p.add_argument('--native-state',action='store_true');p.add_argument('--core',type=Path,default=ROOT/'dist/core.civupdate');p.add_argument('--launcher',type=Path,default=ROOT/'dist/launcher-nanovg-main.civupdate');a=p.parse_args()
    if a.command=='build':print('Built',len(build(a.core,a.launcher,a.installed_files,a.installed_bootstrap)),'bytes')
    else:
        if not a.host:p.error('--host is required')
        if a.command=='stage-qualified':stage_qualified(a.host,a.core,a.launcher)
        elif a.command=='verify':verify_installed(a.host)
        else:run(a.host,a.core,a.launcher,a.installed_files,a.installed_bootstrap,a.native_state)
