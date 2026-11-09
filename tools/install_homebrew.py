#!/usr/bin/env python3
"""Install CivHomebrew over an existing Gezine trigger, preserving verified backups.

python3 tools/install_homebrew.py SWITCH_IP
python3 tools/install_homebrew.py SWITCH_IP --restore
The Switch must be at Gezine's loader or CivHomebrew's idle terminal/selector.
Restart Civ VII and open Load Game after installation; no PC is needed at boot.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import socket
import struct
import subprocess
import sys
import zlib

import payload_menu as pm
from send_app import build_payload, LIMIT

ROOT = Path(__file__).resolve().parents[1]
MARKER = b'CIVHOMEBREW:2;'
TRIGGER_LIMIT = 12*1024*1024  # Independent of larger resident app packages.
STAGER = ('<img src=x onerror="eval(document.body.textContent.match(/XSSP:[0-9]+:[0-9a-f]+/g)'
          ".map(x=>x.split(':')[2]).join('').replace(/../g,x=>String.fromCharCode(parseInt(x,16))))\">")


def identity(data):
    return {'bytes':len(data), 'checksum':pm.fnv_hash(data.decode('latin1'))}


def turn_record(data):
    if data[:4] != b'CIV7' or len(data) > TRIGGER_LIMIT:
        raise ValueError('Expected an existing CIV7 trigger below 12 MiB')
    records, start = [], 0
    while True:
        pos = data.find(bytes.fromhex('fe5a61e8'), start)
        if pos < 0: break
        start = pos + 4
        if pos + 20 > len(data): continue
        framing, flag = struct.unpack_from('<II', data, pos + 12)
        length = (framing & 0x1fffffff) - 1
        if framing & 0xe0000000 == 0x60000000 and flag == 1 and length >= 0:
            end = pos + 20 + length
            if end < len(data) and data[end] == 0: records.append((pos, length))
    if len(records) != 1:
        raise ValueError('Trigger currentTurnDate record is missing or ambiguous')
    return records[0]


def is_homebrew(data):
    pos, length = turn_record(data)
    return data[pos+20:pos+20+length].startswith(b'CIVHOMEBREW:')


def patch_trigger(original, stage):
    pos, length = turn_record(original)
    old = original[pos+20:pos+20+length]
    if b'onerror=' not in old or b'XSSP:' not in old:
        raise ValueError('Existing XSTRIG is not the supported Gezine trigger; preserved')
    value = MARKER + STAGER.encode('ascii') + b'XSSP:0:' + stage.encode('utf-8').hex().encode('ascii')
    framing = struct.pack('<I', 0x60000000 | (len(value)+1))
    result = original[:pos+12] + framing + original[pos+16:pos+20] + value + b'\0' + original[pos+21+length:]
    if len(result) > TRIGGER_LIMIT: raise ValueError('Generated trigger exceeds 12 MiB')
    turn_record(result)
    return result


def decode_trigger_source(original):
    import re
    pos,length=turn_record(original)
    parts=re.findall(rb'XSSP:[0-9]+:([0-9a-f]+)',original[pos+20:pos+20+length])
    if not parts:raise ValueError('Original trigger stage is missing')
    stage=bytes.fromhex(b''.join(parts).decode()).decode('utf-8')
    check="const fs=require('node:fs'),vm=require('node:vm'),s={};vm.createContext(s);vm.runInContext('var decoded;eval=x=>decoded=x;'+fs.readFileSync(0,'utf8'),s,{timeout:30000});if(typeof s.decoded!=='string')throw Error('Missing original source');new vm.Script(s.decoded);process.stdout.write(s.decoded);"
    return subprocess.run(['node','-e',check],input=stage,text=True,capture_output=True,check=True).stdout


def startup_source(path, expected):
    return (ROOT/'app/install/startup.js').read_text().replace('__BOOT_PATH__',json.dumps(path)).replace('__BOOT_ID__',json.dumps(expected))


def persistent_source(original_source, path, expected):
    import re
    matches=list(re.finditer(r'async\s+function\s+remote_js_loader\s*\(\s*\)\s*\{',original_source))
    if len(matches)!=1:raise ValueError('Original Gezine loader entry point is unsupported; preserved')
    pos=matches[0].end()
    setup=re.match(r'\s*try\s*\{\s*Network\.resetNetworkCommunication\(\)\s*;?\s*\}\s*catch\s*\([^)]*\)\s*\{\s*\}',original_source[pos:])
    if not setup:raise ValueError('Original network setup is unsupported; trigger preserved')
    pos+=setup.end()
    # Preserve the exact working native initialization from this device. Only
    # the remote loader body gets a small post-initialization file dispatcher.
    hook='try{await eval('+json.dumps(startup_source(path,expected),ensure_ascii=True)+');}catch(civBootError){await log("CivHomebrew startup failed: "+String(civBootError.message).slice(0,120));}'
    return original_source[:pos]+hook+original_source[pos:]


def compressed_stage(source):
    compressor = zlib.compressobj(9, zlib.DEFLATED, -15)
    compressed = compressor.compress(source.encode('utf-8')) + compressor.flush()
    if zlib.decompress(compressed, -15).decode('utf-8') != source:
        raise ValueError('Compression round trip failed')
    decoder = (ROOT/'third_party/CivSwitch/inflate-stage.js').read_text()
    stage = decoder + '\neval(str(inflate(B64('+json.dumps(base64.b64encode(compressed).decode())+'))));'
    # Execute the actual boot decoder offline; never execute the native payload.
    check = '''const vm=require('node:vm'),fs=require('node:fs');
const p=JSON.parse(fs.readFileSync(0,'utf8')),s={};vm.createContext(s);
vm.runInContext('var decoded;eval=x=>decoded=x;'+p.stage,s,{timeout:30000});
if(s.decoded!==p.source)throw Error('Boot decoder mismatch');new vm.Script(s.decoded);'''
    subprocess.run(['node','-e',check], input=json.dumps({'source':source,'stage':stage}), text=True, check=True, capture_output=True)
    return stage


def service_bundle(port):
    scripts = [ROOT/'app/src/core.js',ROOT/'app/src/system.js',ROOT/'app/src/platform/native-buffer.js',ROOT/'app/src/platform/native.js',ROOT/'app/install/service.js']
    code = build_payload(scripts) + ('\n;CivBootInstaller.serve('+str(port)+');').encode()
    if len(code) >= LIMIT: raise ValueError('Installer service exceeds raw wire bound')
    return code


class Session:
    def __init__(self, host, loader_port, installer_port):
        self.host,self.port,self.sock,self.buffer = host,installer_port,None,b''
        self.sock = socket.create_connection((host,loader_port),timeout=10)
        self.sock.settimeout(30)
        self.sock.sendall(service_bundle(installer_port));self.sock.shutdown(socket.SHUT_WR)
        marker = ('CIV_BOOT_INSTALLER_READY '+str(installer_port)).encode()
        while marker not in self.buffer:
            chunk = self.sock.recv(4096)
            if not chunk: raise RuntimeError('Installer service did not start: '+self.buffer.decode('utf-8','replace')[-1200:])
            self.buffer += chunk
            if b'Error in payload:' in self.buffer: raise RuntimeError(self.buffer.decode('utf-8','replace')[-1200:])
            if len(self.buffer)>16384: raise RuntimeError('Unexpected installer startup output; inspect console')

    def rpc(self, op, **data):
        return pm.rpc(self.host,self.port,{'op':op,**data})

    def get(self, name):
        reply = self.rpc('get',name=name)
        if reply['data'] is None: return None
        data = base64.b64decode(reply['data'],validate=True)
        if identity(data) != reply['identity']: raise RuntimeError('Downloaded '+name+' identity mismatch')
        return data

    def close(self):
        if not self.sock:return
        try:
            self.rpc('finish')
            self.sock.settimeout(30)
            while True:
                chunk=self.sock.recv(4096)
                if not chunk: break
                self.buffer+=chunk
            if b'Executed successfully' not in self.buffer or b'Error in payload:' in self.buffer:
                raise RuntimeError('Installer session ended without clean completion; inspect console')
        finally:self.sock.close();self.sock=None


def save_backup(directory, original, host):
    directory.mkdir(parents=True, exist_ok=True)
    path = directory/'original-XSTRIG.Civ7Save'
    if path.exists():
        if path.read_bytes() != original: raise ValueError('A different PC backup already exists at '+str(path))
    else:
        with path.open('xb') as f:f.write(original);f.flush();os.fsync(f.fileno())
    if path.read_bytes()!=original: raise RuntimeError('PC backup readback failed')
    receipt = {'version':1,'host':host,'bytes':len(original),'sha256':hashlib.sha256(original).hexdigest()}
    (directory/'original-sha256.json').write_text(json.dumps(receipt,indent=2)+'\n')
    return path


def backup_pairing(session, directory):
    snapshots=[]
    for slot in (0,1):
        data=session.get('pairing'+str(slot))
        if data is None:continue
        digest=hashlib.sha256(data).hexdigest()
        folder=directory/'moonlight-pairing';folder.mkdir(parents=True,exist_ok=True)
        path=folder/('pairing-'+str(slot)+'-'+digest[:16]+'.json')
        if path.exists():
            if path.read_bytes()!=data:raise ValueError('Different pairing backup exists; preserved')
        else:
            with os.fdopen(os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600),'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
        if path.read_bytes()!=data:raise RuntimeError('Pairing backup readback failed')
        snapshots.append({'slot':slot,'file':path.name,'bytes':len(data),'sha256':digest})
    if snapshots:
        (directory/'moonlight-pairing/manifest.json').write_text(json.dumps({'version':1,'slots':snapshots},indent=2)+'\n')
        print('Verified Moonlight pairing backup:',len(snapshots),'slot(s)',flush=True)
    return snapshots


def install(session, directory, host, restore=False):
    backup_pairing(session,directory)
    inspection = session.rpc('inspect')
    current = session.get('current')
    if current is None: raise ValueError('Existing XSTRIG is missing; installer will not create or clear game saves')
    original = session.get('original')
    if original is None:
        if is_homebrew(current): raise ValueError('Original device backup missing; preserve PC backup and inspect before proceeding')
        original = current
    elif not is_homebrew(current) and current != original:
        raise ValueError('Active trigger differs from the saved original; both preserved')
    path = save_backup(directory, original, host)
    print('Verified PC backup:',path,flush=True)
    if inspection['original'] is None: session.rpc('backup',expected=identity(current))
    if session.get('original')!=original: raise RuntimeError('Device original backup readback mismatch')
    bootstrap=None
    if restore:candidate=original
    else:
        body=pm.bundle(boot_integrated=True)
        bootstrap=identity(body)
        path='save:/civhomebrew/boot-install/bootstrap-'+bootstrap['checksum']+'.js'
        source=persistent_source(decode_trigger_source(original),path,bootstrap)
        stage=compressed_stage(source)
        candidate=patch_trigger(original,stage)
        session.rpc('bootstrap',data=base64.b64encode(body).decode(),expected=bootstrap)
        if session.get('bootstrap')!=body:raise RuntimeError('Bootstrap file readback mismatch')
    (directory/('restored-XSTRIG.Civ7Save' if restore else 'installed-XSTRIG.Civ7Save')).write_bytes(candidate)
    session.rpc('stage',data=base64.b64encode(candidate).decode(),expected=identity(candidate))
    if session.get('candidate')!=candidate: raise RuntimeError('Candidate readback mismatch')
    if not restore:
        for name in ('core','launcher'):
            session.rpc('component',package=pm.system_package(name,pm.component_bundle(name)))
    result = session.rpc('publish',current=identity(current),candidate=identity(candidate),original=identity(original),mode='restore' if restore else 'install',bootstrap=bootstrap)
    if session.get('current')!=candidate: raise RuntimeError('Active trigger readback mismatch after publication')
    print('Original Gezine trigger restored.' if restore else 'CivHomebrew boot trigger installed and verified.',flush=True)
    print('Other save files and installed apps were preserved.',flush=True)
    return result


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('host');p.add_argument('--loader-port',type=int,default=9026);p.add_argument('--installer-port',type=int,default=9030)
    p.add_argument('--backup-dir',type=Path);p.add_argument('--restore',action='store_true')
    args=p.parse_args(argv)
    if not 1<=args.loader_port<=65535 or not 1<=args.installer_port<=65535 or args.installer_port in (args.loader_port,9027):p.error('Choose distinct valid loader/installer ports; 9027 is reserved')
    directory=args.backup_dir or ROOT/'backups'/args.host.replace(':','_').replace('/','_')
    session=None
    try:
        print('Opening finite installation service…',flush=True)
        session=Session(args.host,args.loader_port,args.installer_port)
        install(session,directory,args.host,args.restore)
        session.close();session=None
        print('Restart Civ VII, then open Load Game. Hold − while opening it for terminal recovery.',flush=True)
    except (OSError,ValueError,RuntimeError,subprocess.SubprocessError) as error:
        p.exit(1,'Stopped: '+str(error)+'\n')
    finally:
        if session:
            try:session.close()
            except Exception as error:print('Installation service cleanup: '+str(error),file=sys.stderr)


if __name__=='__main__':main()
