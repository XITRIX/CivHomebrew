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

    def test_package_drop_installs_without_leaving_any_listable_or_readable_upload(self):
        data = self.package()
        self.ftp.storbinary('STOR sample.civapp', io.BytesIO(data))
        self.assertEqual(self.ftp.nlst(), ['drop civapp here'])
        self.assertEqual(set(dict(self.ftp.mlsd())), {'drop civapp here'})
        for command in ('SIZE sample.civapp', 'MLST sample.civapp', 'DELE sample.civapp'):
            with self.assertRaises(ftplib.error_perm):
                self.ftp.sendcmd(command)
        with self.assertRaises(ftplib.error_perm):
            self.ftp.retrbinary('RETR sample.civapp', lambda _: None)
        hint = io.BytesIO(); self.ftp.retrbinary('RETR drop civapp here', hint.write)
        self.assertIn(b'Drop a .civapp', hint.getvalue())
        state = self.command('status')
        self.assertEqual(state['entries'][0]['name'], 'FTP 雪')
        self.assertEqual(state['packageCopies'], [])
        self.assertFalse(state['uploadWritten'])
        # A second upload uses STOR again without a stale remote-file conflict.
        self.ftp.storbinary('STOR sample.civapp', io.BytesIO(data))
        self.assertEqual(len(self.command('status')['entries']), 1)
        self.assertEqual(self.ftp.nlst(), ['drop civapp here'])

    def test_startup_cleans_legacy_and_orphan_uploads_and_ftp_hides_internal_inbox(self):
        state = self.command('status')
        self.assertEqual(state['packageCopies'], [])
        self.assertFalse(state['inboxIndex'])
        self.assertTrue(state['legacyNotePreserved'])
        self.ftp.cwd('/Root/civhomebrew')
        self.assertNotIn('inbox', self.ftp.nlst())
        for path in ('/Root/civhomebrew/inbox', '/Root/CivHomebrew/INBOX/old.civapp', '/Root/example/../civhomebrew/inbox/orphan.civapp'):
            with self.assertRaises(ftplib.error_perm):
                self.ftp.sendcmd('MLST '+path)
            with self.assertRaises(ftplib.error_perm):
                self.ftp.retrbinary('RETR '+path, lambda _: None)

    def transfer_client(self):
        client = ftplib.FTP()
        self.addCleanup(client.close)
        # The browser connection remains logged in and idle, just as in FileZilla.
        client.connect('127.0.0.1', self.port, timeout=2)
        client.login()
        client.cwd('/Install civapp')
        return client

    def test_separate_filezilla_transfer_connections_greet_and_upload_while_browser_stays_open(self):
        transfer = self.transfer_client()
        other = self.transfer_client()
        self.assertTrue(transfer.welcome.startswith('220 '))
        self.assertTrue(other.welcome.startswith('220 '))
        other.cwd('/Root/example')
        transfer.storbinary('STOR separate.civapp', io.BytesIO(self.package()))
        self.assertEqual(self.ftp.nlst(), ['drop civapp here'])
        self.assertEqual(self.ftp.pwd(), '/Install civapp')
        self.assertEqual(other.pwd(), '/Root/example')
        transfer.quit()
        self.assertIn('original.txt', other.nlst())
        self.assertEqual(len(self.command('status')['entries']), 1)

    def test_concurrent_upload_gets_temporary_busy_response_without_stalling_browser(self):
        transfer = self.transfer_client()
        data = transfer.transfercmd('STOR partial.civapp')
        self.addCleanup(data.close)
        data.sendall(b'{"format":')
        with self.assertRaisesRegex(ftplib.error_temp, '^450 '):
            self.ftp.storbinary('STOR competing.civapp', io.BytesIO(self.package()))
        self.assertIn('drop civapp here', self.ftp.nlst())
        data.close()
        with self.assertRaises(ftplib.error_perm):
            transfer.voidresp()
        self.ftp.storbinary('STOR retry.civapp', io.BytesIO(self.package()))
        self.assertEqual(len(self.command('status')['entries']), 1)

    def test_launcher_unload_closes_browsing_and_transfer_connections(self):
        transfer = self.transfer_client()
        data = transfer.transfercmd('STOR partial.civapp')
        data.sendall(b'{"format":')
        result = self.command('terminal')
        data.close()
        self.assertFalse(result['state']['ftp'])
        self.assertEqual(self.command('status')['entries'], [])
        for client in (self.ftp, transfer):
            with self.assertRaises((EOFError, OSError, ftplib.Error)):
                client.voidcmd('NOOP')

    def test_control_session_limit_releases_slots_after_disconnect(self):
        clients = [self.transfer_client() for _ in range(3)]
        with socket.create_connection(('127.0.0.1', self.port), timeout=2) as excess:
            self.assertEqual(excess.recv(1024), b'')
        clients.pop().quit()
        replacement = self.transfer_client()
        self.assertTrue(replacement.voidcmd('NOOP').startswith('200 '))

    def test_launcher_unload_waits_for_an_already_accepted_install(self):
        self.command('delay-install')
        transfer = self.transfer_client()
        data = transfer.transfercmd('STOR accepted.civapp')
        data.sendall(self.package())
        data.shutdown(socket.SHUT_WR)
        for _ in range(100):
            if self.command('status')['installWriting']:
                break
            time.sleep(0.01)
        else:
            self.fail('Installer never reached the delayed write')
        self.assertEqual(self.ftp.nlst(), ['drop civapp here'], 'An accepted install must not expose its source package')
        result = self.command('terminal')
        data.close()
        self.assertFalse(result['state']['ftp'])
        self.assertFalse(result['state']['busy'])
        self.assertEqual(self.command('status')['entries'][0]['id'], 'ftp-test')

    def test_upload_progress_reports_received_bytes_with_optional_size_hint(self):
        raw = self.package()
        for hinted in (True, False):
            if hinted:
                self.assertTrue(self.ftp.sendcmd('ALLO '+str(len(raw))).startswith('200 '))
            start = len(self.command('uploads'))
            data = self.ftp.transfercmd('STOR progress.civapp')
            data.sendall(raw[:40])
            for _ in range(100):
                events = self.command('uploads')[start:]
                if any(e['event']=='progress' and e['bytes']==40 for e in events):
                    break
                time.sleep(0.01)
            else:
                self.fail('No incremental upload progress')
            self.assertEqual(events[0], dict(event='start', path='/Install civapp/progress.civapp', total=len(raw) if hinted else None))
            self.assertEqual(events[-1]['total'], len(raw) if hinted else None)
            data.sendall(raw[40:]); data.close()
            self.assertTrue(self.ftp.voidresp().startswith('226 '))
            events = self.command('uploads')[start:]
            self.assertEqual(events[-2], dict(event='progress', bytes=len(raw), total=len(raw)))
            self.assertEqual(events[-1], dict(event='close', error=''))
        for value in ('-1', '4097', 'not-a-size'):
            with self.assertRaises(ftplib.error_perm):
                self.ftp.sendcmd('ALLO '+value)

    def test_invalid_package_dismisses_upload_progress_and_root_uploads_do_not_show_it(self):
        with self.assertRaises(ftplib.error_perm):
            self.ftp.storbinary('STOR invalid.civapp', io.BytesIO(b'{}'))
        events = self.command('uploads')
        self.assertEqual(events[-1]['event'], 'close')
        self.assertTrue(events[-1]['error'])
        self.ftp.storbinary('STOR /Root/example/upload.bin', io.BytesIO(b'bytes'))
        self.assertEqual(self.command('uploads'), events)

    def test_epsv_data_mode(self):
        def epsv():
            _, port = ftplib.parse229(self.ftp.sendcmd('EPSV'), ('127.0.0.1', self.port))
            return '127.0.0.1', port
        self.ftp.makepasv = epsv
        self.ftp.storbinary('STOR epsv.civapp', io.BytesIO(self.package()))
        self.assertEqual(self.ftp.nlst(), ['drop civapp here'])

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
        self.assertEqual(self.ftp.nlst(), ['drop civapp here'])
        self.assertEqual(self.command('status')['packageCopies'], [])

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
        self.assertEqual(self.command('uploads')[-1], dict(event='close', error='Transfer cancelled.'))
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
