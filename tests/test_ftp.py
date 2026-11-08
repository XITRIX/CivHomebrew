import ftplib
import io
import json
from pathlib import Path
import select
import socket
import subprocess
import sys
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
import payload_menu as pm


class FTPTests(unittest.TestCase):
    def setUp(self):
        self.server = subprocess.Popen(['node', str(ROOT/'tests/ftp-host.cjs')], stdin=subprocess.PIPE,
                                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)
        self.port = self.line()['port']
        self.ftp = ftplib.FTP()
        self.ftp.connect('127.0.0.1', self.port, timeout=8)
        self.ftp.login()
        self.ftp.cwd("/Install civapp")
        self.addCleanup(self.cleanup)

    def line(self):
        if not select.select([self.server.stdout], [], [], 10)[0]:
            raise AssertionError('FTP host response timed out')
        value = self.server.stdout.readline()
        if not value:
            raise AssertionError('FTP host ended: '+self.server.stderr.read())
        return json.loads(value)

    def command(self, command):
        self.server.stdin.write(command+'\n')
        self.server.stdin.flush()
        return self.line()

    def cleanup(self):
        self.ftp.close()
        try:
            result = self.command('stop')
            self.assertEqual(result['openServers'], 0)
            self.server.wait(timeout=5)
        finally:
            if self.server.poll() is None:
                self.server.kill()
                self.server.wait()
            for stream in (self.server.stdin, self.server.stdout, self.server.stderr):
                stream.close()

    def package(self, name='FTP 雪'):
        return json.dumps({'format':'civswitch-app','version':1,'id':'ftp-test','name':name,
                           'metadata':{'api':1},'icon':'','scripts':[{'name':'app.js','source':'(async()=>42)();'}]},
                          ensure_ascii=False).encode()

    def test_pasv_binary_upload_installs_via_core_and_supports_list_download_delete(self):
        data = self.package()
        self.ftp.cwd('/Install civapp')
        self.ftp.storbinary('STOR sample.civapp', io.BytesIO(data))
        self.assertIn('sample.civapp', self.ftp.nlst())
        self.assertEqual(self.ftp.size('sample.civapp'), len(data))
        self.assertEqual(dict(self.ftp.mlsd())['sample.civapp']['size'], str(len(data)))
        downloaded = io.BytesIO()
        self.ftp.retrbinary('RETR sample.civapp', downloaded.write)
        self.assertEqual(downloaded.getvalue(), data)
        status = self.command('status')
        self.assertEqual(status['entries'][0]['name'], 'FTP 雪')
        self.ftp.delete('sample.civapp')
        self.assertNotIn('sample.civapp', self.ftp.nlst())
        self.assertEqual(len(self.command('status')['entries']), 1, 'Deleting inbox packages keeps installed apps')

    def test_epsv_data_mode(self):
        def epsv():
            _, port = ftplib.parse229(self.ftp.sendcmd('EPSV'), ('127.0.0.1', self.port))
            return '127.0.0.1', port
        self.ftp.makepasv = epsv
        self.ftp.storbinary('STOR epsv.civapp', io.BytesIO(self.package()))
        self.assertIn('epsv.civapp', self.ftp.nlst())

    def test_invalid_traversal_and_oversized_uploads_do_not_install(self):
        for name, data in [('bad.civapp', b'{}'), ('../escape.civapp', self.package()),
                           ('large.civapp', b'x'*5000)]:
            with self.assertRaises(ftplib.error_perm):
                self.ftp.storbinary('STOR '+name, io.BytesIO(data))
        self.assertEqual(self.command('status')['entries'], [])

    def test_launcher_update_acknowledges_ftp_upload_before_service_restarts(self):
        package = pm.system_package('launcher', '({api:1,mount:makeLauncher})', '2')
        self.ftp.storbinary('STOR launcher.civupdate', io.BytesIO(pm.wire_json(package)))
        status = None
        for _ in range(100):
            status = self.command('status')
            if status['state']['mode'] == 'launcher' and not status['state']['busy'] and status['port'] != self.port:
                break
            time.sleep(0.02)
        self.assertNotEqual(status['port'], self.port)
        self.ftp.close()
        self.ftp = ftplib.FTP()
        self.ftp.connect('127.0.0.1', status['port'], timeout=8)
        self.ftp.login()
        self.ftp.cwd('/Install civapp')
        self.assertIn('launcher.civupdate', self.ftp.nlst())

    def test_unloading_launcher_closes_ftp_and_cancels_partial_upload(self):
        data = self.ftp.transfercmd('STOR partial.civapp')
        data.sendall(b'{"format":')
        status = self.command('terminal')
        data.close()
        self.assertEqual(status['state']['mode'], 'terminal')
        self.assertFalse(status['state']['ftp'])
        with self.assertRaises(OSError):
            socket.create_connection(('127.0.0.1', self.port), timeout=1)
        self.assertEqual(self.command('status')['entries'], [])
        self.ftp.close()
        port = self.command('launcher')['port']
        self.ftp = ftplib.FTP()
        self.ftp.connect('127.0.0.1', port, timeout=8)
        self.ftp.login()
        self.assertEqual(self.ftp.nlst(), ['Install civapp', 'Root'])


    def test_virtual_tree_placeholder_installs_and_save_files_roundtrip(self):
        self.ftp.cwd('/')
        self.assertEqual(self.ftp.nlst(), ['Install civapp', 'Root'])
        self.assertEqual(dict(self.ftp.mlsd())['Root']['type'], 'dir')
        self.ftp.cwd('Install civapp')
        self.assertIn('drop civapp here', self.ftp.nlst())
        self.ftp.storbinary('STOR drop civapp here', io.BytesIO(self.package()))
        self.assertEqual(self.command('status')['entries'][0]['id'], 'ftp-test')
        self.ftp.cwd('/Root')
        self.assertEqual(set(self.ftp.nlst()), {'example', 'civhomebrew'})
        self.ftp.cwd('example')
        self.ftp.mkd('folder')
        self.ftp.cwd('folder')
        data = bytes(range(256))*3
        self.ftp.storbinary('STOR 雪.bin', io.BytesIO(data))
        self.assertIn('雪.bin', self.ftp.nlst())
        self.ftp.rename('雪.bin', 'renamed.bin')
        output = io.BytesIO(); self.ftp.retrbinary('RETR renamed.bin', output.write)
        self.assertEqual(output.getvalue(), data)
        self.ftp.delete('renamed.bin'); self.ftp.cwd('..'); self.ftp.rmd('folder')

    def test_save_protection_blocks_writes_deletes_and_renames(self):
        p = '/Root/civhomebrew/system/launcher/slot-0.js'
        for command in ('STOR '+p, 'STOR /Root/example/../civhomebrew/system/launcher/slot-0.js'):
            with self.assertRaises(ftplib.error_perm): self.ftp.storbinary(command, io.BytesIO(b'bad'))
        with self.assertRaises(ftplib.error_perm): self.ftp.delete(p)
        with self.assertRaises(ftplib.error_perm): self.ftp.rename(p, '/Root/example/moved.js')
        with self.assertRaises(ftplib.error_perm): self.ftp.rename('/Root/example/original.txt', p)
        with self.assertRaises(ftplib.error_perm): self.ftp.rmd('/Root')
        before = io.BytesIO(); self.ftp.retrbinary('RETR '+p, before.write)
        self.assertEqual(before.getvalue(), b'({api:1,mount:makeLauncher})')

    def test_credentials_disable_and_protection_override_persist_across_launcher_reload(self):
        settings = dict(version=1, enabled=True, port=5000, anonymous=False,
                        username='tester', password=' secret ', protect=False)
        result = self.command('settings '+json.dumps(settings)); self.ftp.close()
        self.ftp = ftplib.FTP(); self.ftp.connect('127.0.0.1', result['port'], timeout=8)
        with self.assertRaises(ftplib.error_perm): self.ftp.login()
        with self.assertRaises(ftplib.error_perm): self.ftp.login('tester', 'wrong')
        self.ftp.login('tester', ' secret ')
        self.ftp.storbinary('STOR /Root/civhomebrew/allowed.txt', io.BytesIO(b'allowed'))
        self.ftp.delete('/Root/civhomebrew/allowed.txt')
        old_port = result['port']; settings['enabled'] = False
        result = self.command('settings '+json.dumps(settings)); self.assertFalse(result['state']['ftp'])
        self.ftp.close()
        with self.assertRaises(OSError): socket.create_connection(('127.0.0.1', old_port), timeout=1)
        settings['enabled'] = True; result = self.command('settings '+json.dumps(settings))
        self.ftp = ftplib.FTP(); self.ftp.connect('127.0.0.1', result['port'], timeout=8)
        with self.assertRaises(ftplib.error_perm): self.ftp.login()
        self.ftp.login('tester', ' secret ')


if __name__ == '__main__':
    unittest.main()
