#!/usr/bin/env python3
"""Build the persistent native UI launcher with app handoff component; never deploys it."""
from pathlib import Path
import hashlib,json,sys
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'));sys.path.insert(0,str(Path(__file__).resolve().parent))
from package import SCRIPTS,LAUNCHER_SCRIPTS,verify
from payload_menu import system_package
from package_payload import wire_json
from send_app import build_payload
RELEASE='0.4.3-nanovg.12'
def build():
    verify(ROOT)
    paths=SCRIPTS+LAUNCHER_SCRIPTS
    for p in paths+[ROOT/'app/src/nanovg/main-component.js']:
        if not p.is_file():raise ValueError(f'Missing dependency: {p}')
    init=build_payload(paths[:-1]).decode()+'\n;CivNanoVGPrototype.enabled=true;window.__civNanoVGNextMount=true;\n'+paths[-1].read_text()
    adapter=(ROOT/'app/src/nanovg/main-component.js').read_text()
    identity=hashlib.sha256((init+'\n'+adapter).encode()).hexdigest()
    source='''(function(g){"use strict";
var identity=IDENTITY,release=RELEASE,cached=g.__civNanoVGMainLauncher;
if(cached){if(cached.identity!==identity)throw Error('Restart Civ VII before changing the active native launcher build');return cached.factory;}
var adopted=g.__civNanoVGLauncherAdoption,base,ftp,sessions,prototype;
if(adopted){
 if(!adopted.session||adopted.sessions.current!==adopted.session||adopted.session.stats.errors.length)throw Error('Invalid native UI adoption');
 base=adopted.factory;ftp=adopted.ftp;sessions=adopted.sessions;prototype=adopted.prototype;
}else{
 if(g.__civNanoVGVulkan)throw Error('Restart Civ VII before installing a different native UI owner');
 INITIALIZERS
 base=g.CivHomebrewLauncher;ftp=g.CivFtp;sessions=g.CivAppsNativeUI.sessions;prototype=g.CivAppsNativeUI.views;
}
ADAPTER
var component=g.CivNanoVGMainComponent.create({identity:identity,release:release,factory:base,ftp:ftp,sessions:sessions,prototype:prototype,follow:g.CivHomebrewNativeUI.follow});
g.__civNanoVGMainLauncher=component;delete g.__civNanoVGLauncherAdoption;return component.factory;
})(typeof window!=="undefined"?window:globalThis);
'''.replace('IDENTITY',json.dumps(identity)).replace('RELEASE',json.dumps(RELEASE)).replace('INITIALIZERS',init).replace('ADAPTER',adapter)
    image=system_package('launcher',source,RELEASE);out=ROOT/'dist/launcher-nanovg-main.civupdate';out.parent.mkdir(exist_ok=True);out.write_bytes(wire_json(image)+b'\n');(ROOT/'dist/launcher-nanovg-main.js').write_text(source)
    actual=json.loads(out.read_bytes());assert actual==image;assert system_package('launcher',actual['source'],actual['release'])==actual
    manifest={'identity':identity,'release':RELEASE,'packageSha256':hashlib.sha256(out.read_bytes()).hexdigest(),'sourceSha256':hashlib.sha256(source.encode()).hexdigest(),'dependencies':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()for p in paths+[ROOT/'app/src/nanovg/main-component.js']}}
    (ROOT/'build/nanovg').mkdir(parents=True,exist_ok=True)
    (ROOT/'build/nanovg/main-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(f'Built and inspected {out}: {out.stat().st_size:,} bytes; persistent shared UI; {identity[:12]}',flush=True)
    return image,manifest
if __name__=='__main__':build()
