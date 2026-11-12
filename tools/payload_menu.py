#!/usr/bin/env python3
"""CivHomebrew companion: package, install and run CivSwitch JavaScript apps."""
import argparse
import base64
import json
from pathlib import Path
import re
import socket
import struct
import sys

from send_app import build_payload, plan_upload, send_stage, launch
from package_payload import (MAX_SOURCE, MAX_FRAME, text_length, validate,
                             wire_json, inside, pack_directory, read_package)

ROOT = Path(__file__).resolve().parents[1]
BOOT_SCRIPTS = [ROOT/'app/src/core.js', ROOT/'app/src/system.js', ROOT/'app/src/loader-scope.js',
                ROOT/'app/src/platform/native-buffer.js', ROOT/'app/src/platform/native.js']
INSTALL_SCRIPTS = [ROOT/'app/src/core.js', ROOT/'app/src/app-metadata.js', ROOT/'app/src/storage.js', ROOT/'app/src/platform/native-buffer.js', ROOT/'app/src/platform/native.js']
CORE_SCRIPTS = [ROOT/'app/src/app-metadata.js', ROOT/'app/src/platform/native-buffer.js', ROOT/'app/src/platform/native.js', ROOT/'app/src/ftp-settings.js', ROOT/'app/src/ftp-files.js', ROOT/'app/src/storage.js', ROOT/'app/src/terminal.js', ROOT/'app/src/legacy-loader.js',
                ROOT/'app/src/resident.js', ROOT/'app/core.js']
LAUNCHER_SCRIPTS = [ROOT/'app/src/layout.js', ROOT/'app/src/keyboard.js', ROOT/'app/src/options.js', ROOT/'app/src/app-library.js', ROOT/'app/src/versions.js', ROOT/'app/src/http.js', ROOT/'app/src/dns.js', ROOT/'app/src/platform/https-native.js', ROOT/'app/src/sha256.js', ROOT/'app/src/github-releases.js', ROOT/'app/src/update-status.js', ROOT/'app/src/system-updates.js', ROOT/'app/src/system-update-ui.js', ROOT/'app/src/app-updates.js', ROOT/'app/src/app-menu.js', ROOT/'app/src/ftp.js', ROOT/'app/src/catalog.js', ROOT/'app/src/catalog-ui.js', ROOT/'app/app.js']
RELEASE = '0.4.3'


def receive_exact(sock, length):
    parts = []
    while length:
        chunk = sock.recv(min(length, 65536))
        if not chunk:
            raise RuntimeError('Companion closed before a complete response; inspect console before retrying')
        parts.append(chunk)
        length -= len(chunk)
    return b''.join(parts)


def rpc(host, port, request):
    request = {'protocol':1, **request}
    data = wire_json(request)
    if not 0 < len(data) <= MAX_FRAME:
        raise ValueError('Companion request exceeds 48 MiB')
    with socket.create_connection((host, port), timeout=10) as sock:
        sock.settimeout(180)
        sock.sendall(struct.pack('>I', len(data))+data)
        size, = struct.unpack('>I', receive_exact(sock, 4))
        if not 0 < size <= MAX_FRAME:
            raise RuntimeError('Invalid companion response length')
        reply = json.loads(receive_exact(sock, size).decode('utf-8'))
    if not isinstance(reply, dict) or reply.get('ok') is not True:
        raise RuntimeError(reply.get('error', 'Invalid response') if isinstance(reply, dict) else 'Invalid response')
    return reply


def upload(host, port, source, finite=False):
    stages, final = plan_upload(source)
    for stage in stages:
        send_stage(host, port, stage, sys.stdout.buffer)
    if finite:
        send_stage(host, port, final, sys.stdout.buffer, timeout=180)
    else:
        print('Keep this terminal open. Use the core terminal’s + action or the shutdown command to return to Gezine.', flush=True)
        launch(host, port, final, sys.stdout.buffer)


def fnv_hash(source):
    value = 2166136261
    raw = source.encode('utf-16-le')
    for i in range(0, len(raw), 2):
        value = ((value ^ (raw[i] | raw[i+1] << 8))*16777619) & 0xffffffff
    return f'{value:08x}'


def system_package(component, source, release=RELEASE):
    if component not in ('core', 'launcher') or not source.strip() or len(source.encode()) > 8*1024*1024:
        raise ValueError('Invalid system component source')
    if not release.strip() or text_length(release) > 32 or re.search(r'[\x00-\x1f\x7f]', release):
        raise ValueError('Invalid system component release')
    return {'format':'civswitch-system','version':1,'api':1,'component':component,
            'release':release,'source':source,'checksum':fnv_hash(source)}


def component_bundle(component):
    if component == 'launcher':
        return build_payload(LAUNCHER_SCRIPTS).decode('utf-8')
    return build_payload(CORE_SCRIPTS).decode('utf-8')+'\n;(async function(){return await CivResidentEntry.start(window.__civhomebrewBoot);})();'


def release_manifest(images, release=RELEASE):
    def semver(value):
        match = re.fullmatch(r'v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?', value)
        return match and not any(p.isdigit() and len(p) > 1 and p[0] == '0' for p in (match[4] or '').split('.'))
    if not semver(release) or set(images) != {'core', 'launcher'}:
        raise ValueError('Release manifest requires SemVer and both components')
    components = {}
    for name, image in images.items():
        if image['component'] != name or not semver(image['release']) or image['checksum'] != fnv_hash(image['source']):
            raise ValueError('Invalid component release target')
        components[name] = {'release': image['release'], 'asset': name+'.civupdate', 'checksum': image['checksum']}
    return {'format': 'civhomebrew-release', 'version': 1, 'release': release, 'components': components}


def bundle(port=9027, ftp_port=5000, terminal=False, boot_integrated=False, releases=None):
    icons = {letter: 'data:image/png;base64,'+base64.b64encode((ROOT/('app/assets/button-'+('minus' if letter=='-' else letter.lower())+'.png')).read_bytes()).decode('ascii') for letter in ('A', 'B', 'X', 'Y', '-')}
    config = {'port':port,'ftpPort':ftp_port,'terminal':terminal,'bootIntegrated':boot_integrated,'buttonIcons':icons,
              'upstreamLauncherChecksum':'ed8d0465','seeds':{name:system_package(name,component_bundle(name),(releases or {}).get(name,RELEASE)) for name in ('core','launcher')}}
    return ('window.__payloadMenuConfig='+json.dumps(config,ensure_ascii=False)+';\n').encode()+build_payload(BOOT_SCRIPTS+[ROOT/'app/boot.js'])


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    subs = parser.add_subparsers(dest='command', required=True)
    p = subs.add_parser('pack', help='Build an inspectable .civapp file from payload.json and scripts')
    p.add_argument('directory', type=Path); p.add_argument('-o','--output', type=Path, required=True)
    p = subs.add_parser('inspect', help='Validate and summarize a .civapp package')
    p.add_argument('package', type=Path)
    p = subs.add_parser('build', help='Build the menu JS payload')
    p.add_argument('-o','--output',type=Path,default=ROOT/'dist/payload-menu.js'); p.add_argument('--menu-port',type=int,default=9027)
    p.add_argument('--ftp-port',type=int,default=5000); p.add_argument('--terminal',action='store_true')
    p.add_argument('--release',default=RELEASE,help='Overall GitHub release version')
    p.add_argument('--core-release',help='Core component version (defaults to overall release)')
    p.add_argument('--launcher-release',help='Launcher component version (defaults to overall release)')
    for command in ('menu', 'install', 'list', 'run', 'start', 'status', 'terminal', 'launcher', 'shutdown', 'update', 'rollback'):
        p = subs.add_parser(command)
        p.add_argument('host'); p.add_argument('--menu-port',type=int,default=9027)
        p.add_argument('--loader-port',type=int,default=9026)
        if command in ('install','run'):
            p.add_argument('package', type=Path)
            p.add_argument('--id'); p.add_argument('--name')
            p.add_argument('--via-loader',action='store_true',help='Use idle Gezine loader instead of running menu')
        if command == 'start':
            p.add_argument('id')
        if command == 'menu':
            p.add_argument('--ftp-port',type=int,default=5000); p.add_argument('--terminal',action='store_true')
        if command == 'rollback':
            p.add_argument('component',choices=['core','launcher'])
        if command == 'update':
            p.add_argument('component',choices=['core','launcher']); p.add_argument('--source',type=Path); p.add_argument('--release',default=RELEASE)
    args = parser.parse_args(argv)
    try:
        for key in ('menu_port','loader_port','ftp_port'):
            if hasattr(args,key) and not 1 <= getattr(args,key) <= 65535:
                raise ValueError('Ports must be 1–65535')
        if args.command == 'pack':
            p = pack_directory(args.directory)
            args.output.parent.mkdir(parents=True,exist_ok=True)
            args.output.write_bytes(wire_json(p)+b'\n')
            print(f"Packed {p['name']}: {args.output}")
        elif args.command == 'inspect':
            p = read_package(args.package)
            print(json.dumps({k:v for k,v in p.items() if k not in ('scripts','icon')},indent=2,ensure_ascii=False))
            print('Scripts: '+', '.join(s['name'] for s in p['scripts']))
            print('Icon: '+('256×256 PNG' if p['icon'] else 'letter fallback'))
        elif args.command == 'build':
            releases={'core':args.core_release or args.release,'launcher':args.launcher_release or args.release}
            images={name:system_package(name,component_bundle(name),releases[name]) for name in ('core','launcher')}
            manifest=release_manifest(images,args.release)
            data = bundle(args.menu_port,args.ftp_port,args.terminal,releases=releases)
            args.output.parent.mkdir(parents=True,exist_ok=True); args.output.write_bytes(data)
            for component, image in images.items():
                (args.output.parent/(component+'.civupdate')).write_bytes(wire_json(image)+b'\n')
            (args.output.parent/'civhomebrew-release.json').write_bytes(wire_json(manifest)+b'\n')
            print(f'Built {args.output} ({len(data)} bytes), core/launcher.civupdate and civhomebrew-release.json')
        elif args.command == 'menu':
            upload(args.host,args.loader_port,bundle(args.menu_port,args.ftp_port,args.terminal))
        elif args.command == 'rollback':
            reply = rpc(args.host,args.menu_port,{'op':'rollback','component':args.component})
            print('Core rollback selected for next start.' if reply['update']['restartRequired'] else 'Launcher rollback accepted.')
        elif args.command == 'update':
            source = args.source.read_text(encoding='utf-8') if args.source else component_bundle(args.component)
            package = system_package(args.component,source,args.release)
            reply = rpc(args.host,args.menu_port,{'op':'update','package':package})
            print('Core staged for next start; restart Civ VII, or shutdown and relaunch the regular boot payload.' if reply['update']['restartRequired'] else 'Launcher update accepted; the core will reload it and retain the previous version.')
        elif args.command in ('status','terminal','launcher','shutdown'):
            reply = rpc(args.host,args.menu_port,{'op':args.command})
            print(json.dumps(reply.get('state',reply),indent=2))
        elif args.command == 'list':
            reply = rpc(args.host,args.menu_port,{'op':'list'})
            for e in reply['entries']:
                print(f"{e['id']}\t{e['name']}\t{e['bytes']} bytes")
            if not reply['entries']: print('No payloads installed.')
        elif args.command == 'start':
            reply = rpc(args.host,args.menu_port,{'op':'run','id':args.id})
            print('Launch accepted: '+reply['name']+'. Close the app, then press Minus to view its output.')
        else:
            p = read_package(args.package,args.id,args.name)
            if args.via_loader:
                if args.command == 'run':
                    source = '\n;\n'.join(s['source'] for s in p['scripts']).encode('utf-8')
                    upload(args.host,args.loader_port,source)
                else:
                    source = build_payload(INSTALL_SCRIPTS)+b';\n'+('(async function(){var store=PayloadCore.createStore(PayloadNative.create().io);await store.load();await store.install('+wire_json(p).decode()+');await log("CIVHOME_BREW_INSTALLED");})();').encode('utf-8')
                    upload(args.host,args.loader_port,source,finite=True)
            else:
                reply = rpc(args.host,args.menu_port,{'op':'install' if args.command=='install' else 'run-source','package':p})
                print('Installed '+p['name'] if args.command=='install' else 'Launch accepted: '+p['name']+'. Close the app, then press Minus to view its output.')
    except KeyboardInterrupt:
        print('\nCompanion stopped. Close the active app on the console before another loader upload.')
        return 130
    except (OSError, ValueError, KeyError, TypeError, RuntimeError) as e:
        parser.exit(1, 'Stopped: '+str(e)+'\nNo automatic retry. For menu operations, start the menu first; use --via-loader only while the raw receiver is idle.\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
