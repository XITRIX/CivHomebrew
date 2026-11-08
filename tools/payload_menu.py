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

ROOT = Path(__file__).resolve().parents[1]
INSTALL_SCRIPTS = [ROOT/'app/src/core.js', ROOT/'app/src/storage.js', ROOT/'app/src/platform/native-buffer.js', ROOT/'app/src/platform/native.js']
SCRIPTS = [ROOT/'app/src/core.js', ROOT/'app/src/storage.js', ROOT/'app/src/loader-scope.js', ROOT/'app/src/terminal.js',
           ROOT/'app/src/legacy-loader.js', ROOT/'app/src/platform/native-buffer.js', ROOT/'app/src/platform/native.js', ROOT/'app/app.js']
MAX_SOURCE = 8*1024*1024
MAX_FRAME = 12*1024*1024


def text_length(value):
    return len(value.encode('utf-16-le'))//2


def validate(p):
    if not isinstance(p, dict) or p.get('format') != 'civswitch-app' or type(p.get('version')) is not int or p['version'] != 1:
        raise ValueError('Unsupported .civapp format/version')
    if not isinstance(p.get('id'), str) or not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,47}', p['id']):
        raise ValueError('ID must use lowercase letters, digits and hyphens (1–48 characters)')
    name = p.get('name')
    if not isinstance(name, str) or not name.strip() or text_length(name) > 80 or re.search(r'[\x00-\x1f\x7f]', name):
        raise ValueError('Name must be 1–80 printable characters')
    scripts = p.get('scripts')
    if not isinstance(scripts, list) or not 1 <= len(scripts) <= 64:
        raise ValueError('Package requires 1–64 ordered JavaScript scripts')
    total, names, directories = 0, set(), set()
    for s in scripts:
        if not isinstance(s, dict) or not isinstance(s.get('name'), str):
            raise ValueError('Invalid script')
        n = s['name']
        if len(n) > 160 or not re.fullmatch(r'[A-Za-z0-9_./-]+\.js', n) or any(c in ('', '.', '..') for c in n.split('/')) or n.lower() in names or n.lower() in directories:
            raise ValueError('Invalid or duplicate script name')
        names.add(n.lower())
        parts=n.lower().split('/')[:-1]
        while parts:
            parent='/'.join(parts)
            if parent in names: raise ValueError('Script file/directory path conflict')
            directories.add(parent);parts.pop()
        if not isinstance(s.get('source'), str) or not s['source'].strip():
            raise ValueError('Empty script')
        total += len(s['source'].encode('utf-8'))
    if total > MAX_SOURCE:
        raise ValueError('Scripts exceed 8 MiB')
    m = p.get('metadata', {})
    if not isinstance(m, dict):
        raise ValueError('Invalid metadata')
    for key, limit in [('author', 80), ('release', 32), ('description', 500)]:
        v = m.get(key, '')
        if not isinstance(v, str) or text_length(v) > limit or re.search(r'[\x00-\x1f\x7f]', v):
            raise ValueError('Invalid '+key+' metadata')
    if type(m.get('api', 1)) is not int or m.get('api', 1) != 1:
        raise ValueError('Unsupported launcher API')
    icon = p.get('icon', '')
    if not isinstance(icon, str):
        raise ValueError('Invalid PNG icon')
    if icon:
        if not icon.startswith('data:image/png;base64,'):
            raise ValueError('Icon must be a PNG data URL')
        raw = base64.b64decode(icon[22:], validate=True)
        if not 33 <= len(raw) <= 512*1024 or raw[:8] != b'\x89PNG\r\n\x1a\n' or raw[12:16] != b'IHDR' or struct.unpack('>II', raw[16:24]) != (256, 256):
            raise ValueError('Icon must be a 256×256 PNG, at most 512 KiB')
    if len(wire_json(p)) > MAX_FRAME:
        raise ValueError('Package exceeds 12 MiB serialized limit')
    return p


def wire_json(p):
    return json.dumps(p, ensure_ascii=False, separators=(',', ':')).encode('utf-8')


def inside(root, relative):
    if not isinstance(relative, str) or '\\' in relative or ':' in relative or any(x in ('', '.', '..') for x in relative.split('/')):
        raise ValueError('Manifest paths must be canonical relative paths')
    path = (root/relative).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError('Manifest path escapes the package directory')
    return path


def pack_directory(directory, manifest=None):
    if manifest is None:
        manifest = json.loads((directory/'payload.json').read_text(encoding='utf-8'))
    if not isinstance(manifest, dict):
        raise ValueError('payload.json must contain an object')
    scripts = manifest.get('scripts', ['app.js'])
    if not isinstance(scripts, list) or not scripts or len(scripts) > 64:
        raise ValueError('Manifest scripts must be an ordered list')
    icon_path = manifest.get('icon', 'icon.png')
    icon = inside(directory, icon_path) if icon_path is not None else None
    if icon is not None and 'icon' in manifest and not icon.is_file():
        raise ValueError('Manifest icon is missing')
    metadata = {k: manifest.get(k, '') for k in ('author', 'release', 'description')}
    metadata['api'] = manifest.get('api', 1)
    p = {'format':'civswitch-app', 'version':1, 'id':manifest['id'], 'name':manifest['name'],
         'metadata':metadata, 'scripts':[], 'icon':''}
    for name in scripts:
        path = inside(directory, name)
        if path.stat().st_size > MAX_SOURCE:
            raise ValueError('Script exceeds 8 MiB')
        p['scripts'].append({'name':name, 'source':path.read_text(encoding='utf-8')})
    if icon is not None and icon.is_file():
        if icon.stat().st_size > 512*1024:
            raise ValueError('Icon exceeds 512 KiB')
        p['icon'] = 'data:image/png;base64,'+base64.b64encode(icon.read_bytes()).decode('ascii')
    return validate(p)


def read_package(path, app_id=None, name=None):
    if path.is_dir():
        return pack_directory(path)
    if path.stat().st_size > MAX_FRAME:
        raise ValueError('Input exceeds 12 MiB')
    if path.suffix == '.civapp':
        return validate(json.loads(path.read_text(encoding='utf-8')))
    if path.suffix != '.js':
        raise ValueError('Use a .civapp package, package directory, or .js file')
    return validate({'format':'civswitch-app','version':1,'id':app_id or path.stem.lower().replace('_','-'),
                     'name':name or path.stem,'metadata':{'api':1},'icon':'',
                     'scripts':[{'name':'app.js','source':path.read_text(encoding='utf-8')}]})


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
        raise ValueError('Companion request exceeds 12 MiB')
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
        print('Keep this terminal open. Use the app’s exit action to return to the loader.', flush=True)
        launch(host, port, final, sys.stdout.buffer)


def bundle(port=9027):
    icons = {letter: 'data:image/png;base64,'+base64.b64encode((ROOT/('app/assets/button-'+('minus' if letter=='-' else letter.lower())+'.png')).read_bytes()).decode('ascii') for letter in ('A', 'B', '-')}
    return ('window.__payloadMenuConfig='+json.dumps({'port':port, 'buttonIcons':icons})+';\n').encode()+build_payload(SCRIPTS)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    subs = parser.add_subparsers(dest='command', required=True)
    p = subs.add_parser('pack', help='Build an inspectable .civapp file from payload.json and scripts')
    p.add_argument('directory', type=Path); p.add_argument('-o','--output', type=Path, required=True)
    p = subs.add_parser('inspect', help='Validate and summarize a .civapp package')
    p.add_argument('package', type=Path)
    p = subs.add_parser('build', help='Build the menu JS payload')
    p.add_argument('-o','--output',type=Path,default=ROOT/'dist/payload-menu.js'); p.add_argument('--menu-port',type=int,default=9027)
    for command in ('menu', 'install', 'list', 'run', 'start'):
        p = subs.add_parser(command)
        p.add_argument('host'); p.add_argument('--menu-port',type=int,default=9027)
        p.add_argument('--loader-port',type=int,default=9026)
        if command in ('install','run'):
            p.add_argument('package', type=Path)
            p.add_argument('--id'); p.add_argument('--name')
            p.add_argument('--via-loader',action='store_true',help='Use idle Gezine loader instead of running menu')
        if command == 'start':
            p.add_argument('id')
    args = parser.parse_args(argv)
    try:
        for key in ('menu_port','loader_port'):
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
            data = bundle(args.menu_port)
            args.output.parent.mkdir(parents=True,exist_ok=True); args.output.write_bytes(data)
            print(f'Built {args.output} ({len(data)} bytes)')
        elif args.command == 'menu':
            upload(args.host,args.loader_port,bundle(args.menu_port))
        elif args.command == 'list':
            reply = rpc(args.host,args.menu_port,{'op':'list'})
            for e in reply['entries']:
                print(f"{e['id']}\t{e['name']}\t{e['bytes']} bytes")
            if not reply['entries']: print('No payloads installed.')
        elif args.command == 'start':
            reply = rpc(args.host,args.menu_port,{'op':'run','id':args.id})
            print('Launch accepted: '+reply['name']+'. Open the on-device terminal with Minus to view app output.')
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
                print('Installed '+p['name'] if args.command=='install' else 'Launch accepted: '+p['name']+'. Open the on-device terminal with Minus to view app output.')
    except KeyboardInterrupt:
        print('\nCompanion stopped. Close the active app on the console before another loader upload.')
        return 130
    except (OSError, ValueError, KeyError, TypeError, RuntimeError) as e:
        parser.exit(1, 'Stopped: '+str(e)+'\nNo automatic retry. For menu operations, start the menu first; use --via-loader only while Gezine’s loader is idle.\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
