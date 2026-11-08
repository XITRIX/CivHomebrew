import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
import install_homebrew as installer


def trigger(value=b'<img src=x onerror="old">XSSP:0:abcd'):
    return b'CIV7'+b'header'*10+bytes.fromhex('fe5a61e8')+b'tagbytes'+struct.pack('<II',0x60000000|(len(value)+1),1)+value+b'\0'+b'untouched tail'

class BootInstallerTests(unittest.TestCase):
    def test_trigger_patch_preserves_everything_outside_the_selected_value_and_length(self):
        original=trigger();pos,size=installer.turn_record(original)
        result=installer.patch_trigger(original,'eval("hello")')
        self.assertEqual(result[:pos+12],original[:pos+12]);self.assertEqual(result[pos+16:pos+20],original[pos+16:pos+20]);self.assertTrue(result.endswith(b'\0untouched tail'));self.assertTrue(installer.is_homebrew(result));self.assertNotIn('{',installer.STAGER);self.assertNotIn('}',installer.STAGER)
        value=result[pos+20:installer.turn_record(result)[1]+pos+20]
        self.assertTrue(value.endswith(b'XSSP:0:'+b'eval("hello")'.hex().encode()))

    def test_unknown_ambiguous_or_truncated_save_is_preserved(self):
        for raw in [b'bad',trigger()+trigger(),trigger()[:-20]]:
            with self.assertRaises(ValueError):installer.turn_record(raw)
        with self.assertRaises(ValueError):installer.patch_trigger(trigger(b'4000 BCE'),'x')

    def test_actual_inflate_stage_round_trips_non_bmp_unicode_and_source_compiles(self):
        stage=installer.compressed_stage('var example="雪 😀"; (async function(){return 42;})();')
        self.assertIn('eval(str(inflate(B64(',stage)

    def test_persistent_build_preserves_gezine_initialization_and_awaits_homebrew(self):
        original=(ROOT/'third_party/CivSwitch/core.js').read_text()
        source=installer.persistent_source(original,'save:/civhomebrew/boot-install/bootstrap-12345678.js',{'bytes':100,'checksum':'12345678'})
        prefix=original.split('async function remote_js_loader() {')[0]
        self.assertTrue(source.startswith(prefix));self.assertIn('try{await eval(',source);self.assertIn('remote_js_loader();',source)
        self.assertNotIn('buttonIcons',source,'large bootstrap is absent from save trigger')
        installer.compressed_stage(source)
        self.assertLess(len(installer.service_bundle(9030)),500*1024)

    def test_pairing_snapshots_keep_private_key_data_without_overwriting_prior_copies(self):
        class Session:
            def __init__(self):self.data={'pairing0':b'{"version":1,"identity":{"privateKeyPem":"test fixture"}}','pairing1':None}
            def get(self,name):return self.data[name]
        with tempfile.TemporaryDirectory() as d:
            session=Session();saved=installer.backup_pairing(session,Path(d));path=Path(d)/'moonlight-pairing'/saved[0]['file'];self.assertEqual(path.read_bytes(),session.data['pairing0'])
            session.data['pairing0']=None;self.assertEqual(installer.backup_pairing(session,Path(d)),[]);self.assertEqual(path.read_bytes(),b'{"version":1,"identity":{"privateKeyPem":"test fixture"}}');self.assertTrue((Path(d)/'moonlight-pairing/manifest.json').exists())

    def test_pc_backup_never_overwrites_a_different_original(self):
        with tempfile.TemporaryDirectory() as d:
            p=installer.save_backup(Path(d),trigger(),'test');self.assertEqual(p.read_bytes(),trigger());installer.save_backup(Path(d),trigger(),'test')
            with self.assertRaises(ValueError):installer.save_backup(Path(d),trigger(b'changed'),'test')
            self.assertEqual(p.read_bytes(),trigger());self.assertEqual(json.loads((Path(d)/'original-sha256.json').read_text())['bytes'],len(trigger()))

if __name__=='__main__':unittest.main()
