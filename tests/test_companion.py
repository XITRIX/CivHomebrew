import base64
import importlib.util
import io
import json
from pathlib import Path
import socket
import struct
import sys
import tempfile
import threading
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
import payload_menu as pm
import send_app
import send_js


class CompanionTests(unittest.TestCase):
    def test_pack_roundtrip(self):
        p = pm.pack_directory(ROOT/'examples/hello')
        self.assertEqual(p['scripts'][0]['name'], 'app.js')
        self.assertEqual(base64.b64decode(p['icon'][22:])[16:24], struct.pack('>II', 256, 256))
        with tempfile.TemporaryDirectory() as d:
            target = Path(d)/'hello.civapp'
            self.assertEqual(pm.main(['pack',str(ROOT/'examples/hello'),'-o',str(target)]),0)
            self.assertEqual(pm.read_package(target), p)

    def test_escape_and_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)/'pkg'; root.mkdir()
            (root/'escape.js').symlink_to(ROOT/'app/app.js')
            for name in ('../x.js','/tmp/x.js','a//x.js','a\\x.js','escape.js'):
                with self.assertRaises(ValueError): pm.inside(root,name)

    def test_bad_version_and_icon(self):
        p=pm.pack_directory(ROOT/'examples/hello')
        p['version']=True
        with self.assertRaises(ValueError): pm.validate(p)
        p['version']=1;p['icon']='data:image/png;base64,AA=='
        with self.assertRaises(ValueError): pm.validate(p)

    def test_metadata_limits_match_javascript_utf16(self):
        p=pm.pack_directory(ROOT/'examples/hello')
        p['name']='😀'*40
        pm.validate(p)
        p['name']+='x'
        with self.assertRaises(ValueError): pm.validate(p)

    def test_upload_boundaries_and_non_bmp(self):
        for size in (send_app.LIMIT-1, send_app.LIMIT, send_app.LIMIT+1):
            stages,final=send_app.plan_upload(b' '*(size-1)+b'1')
            self.assertEqual(bool(stages),size>=send_app.LIMIT)
            self.assertTrue(all(len(x)<send_app.LIMIT for x in stages+[final]))
        stages,final=send_app.plan_upload(('/*'+'😀'*150000+'*/\n(async()=>42)();').encode())
        self.assertTrue(stages)
        self.assertTrue(all(len(x)<send_app.LIMIT for x in stages+[final]))
        self.assertIn(b'await eval(source)',final)

    def test_companion_fragmented_real_tcp(self):
        with socket.socket() as listener:
            listener.bind(('127.0.0.1',0));listener.listen()
            errors=[]
            def server():
                try:
                    with listener.accept()[0] as client:
                        size,=struct.unpack('>I',pm.receive_exact(client,4))
                        request=json.loads(pm.receive_exact(client,size))
                        self.assertEqual(request,{'protocol':1,'op':'list'})
                        data=pm.wire_json({'ok':True,'entries':[{'name':'雪 😀'}]})
                        frame=struct.pack('>I',len(data))+data
                        for byte in frame: client.sendall(bytes([byte]))
                except Exception as e: errors.append(e)
            worker=threading.Thread(target=server);worker.start()
            reply=pm.rpc('127.0.0.1',listener.getsockname()[1],{'op':'list'})
            worker.join(3);self.assertFalse(worker.is_alive());self.assertFalse(errors)
            self.assertEqual(reply['entries'][0]['name'],'雪 😀')

    def test_unmodified_gezine_sender_raw_bytes_half_close_and_logs(self):
        with socket.socket() as listener:
            listener.bind(('127.0.0.1',0));listener.listen()
            received=[]
            def server():
                with listener.accept()[0] as client:
                    chunks=[]
                    while True:
                        chunk=client.recv(4096)
                        if not chunk: break
                        chunks.append(chunk)
                    received.append(b''.join(chunks))
                    for part in [b'Executing payload...\n', '雪 😀\n'.encode(), b'Executed successfully\n']:
                        client.sendall(part)
            worker=threading.Thread(target=server);worker.start()
            source='(async()=>{await log("雪 😀");})();'
            result=send_js.send('127.0.0.1',listener.getsockname()[1],source)
            worker.join(3)
            self.assertFalse(worker.is_alive())
            self.assertEqual(received,[source.encode()])
            self.assertEqual(result,'Executing payload...\n雪 😀\nExecuted successfully\n')

    def test_bundle_excludes_preview_and_preserves_lifetime(self):
        source=pm.bundle().decode()
        self.assertNotIn('Browser-only adapter',source)
        self.assertTrue(source.rstrip().endswith('})();'))
        self.assertIn('await lifetime;',source)
        self.assertNotIn('XSTRIG',source)


if __name__ == '__main__': unittest.main()
