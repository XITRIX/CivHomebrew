import json, subprocess, sys, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
import install_streamed as streamed

RUNNER=r'''
const fs=require('fs'),vm=require('vm'),spec=JSON.parse(fs.readFileSync(0,'utf8'));
(async()=>{
 const files=new Map(),events=[],g={console};g.window=g;
 const io={ensureDirectory:async p=>events.push(['mkdir',p]),removeDirectory:async p=>{events.push(['remove',p]);for(const k of [...files.keys()])if(k===p||k.startsWith(p+'/'))files.delete(k);},read:async p=>files.has(p)?files.get(p):null,write:async(p,s)=>{events.push(['write',p]);files.set(p,s);},commit:async()=>events.push(['commit']),remove:async p=>files.delete(p)};
 g.__civhomebrewBoot={native:{io}};const c=vm.createContext(g);
 for(const name of ['core','app-metadata','storage'])vm.runInContext(fs.readFileSync('app/src/'+name+'.js','utf8'),c);
 const store=g.PayloadCore.createStore(io);await store.load();await store.install({format:'civswitch-app',version:1,id:'fixture',name:'Old',metadata:{},scripts:[{name:'old.js',source:'old'}],icon:''});
 const start=events.length;let error=null,results=[];
 for(const body of spec.frames){try{results.push(await vm.runInContext('(async()=>{'+body+'})()',c));}catch(e){error=e.message;break;}}
 const check=g.PayloadCore.createStore(io);await check.load();
 process.stdout.write(JSON.stringify({error,results,entries:check.list(),manifest:files.get('save:/civhomebrew/apps/fixture/manifest.json')||null,files:[...files],events:events.slice(start),state:g.__civStreamInstall||null}));
})().catch(e=>{console.error(e);process.exit(1);});
'''

class StreamedInstallTests(unittest.TestCase):
 def setUp(self):
  self.p=streamed.plan(dict(format='civswitch-app',version=1,id='fixture',name='New',metadata={'author':'','release':'1.0.0','description':'','api':1},scripts=[{'name':'a.js','source':"var text='é😀';"},{'name':'nested/b.js','source':'second'}],icon=''))
 def run_frames(self,frames):
  r=subprocess.run(['node','-e',RUNNER],cwd=ROOT,input=json.dumps({'frames':frames}),text=True,capture_output=True,check=True);return json.loads(r.stdout)
 def test_ordered_install_deletes_old_folder_and_publishes_only_verified_files(self):
  p=self.p;frames=[streamed.begin_body(p,'token')]+[streamed.file_body(i,f,'token')for i,f in enumerate(p['files'])]+[streamed.finish_body('token')]
  r=self.run_frames(frames);self.assertIsNone(r['error']);self.assertEqual(r['entries'],[p['entry']]);self.assertEqual(r['manifest'],p['text']);self.assertIsNone(r['state']);self.assertNotIn('save:/civhomebrew/apps/fixture/scripts/old.js',dict(r['files']))
  events=r['events'];remove=next(i for i,e in enumerate(events)if e==['remove','save:/civhomebrew/apps/fixture']);manifest=next(i for i,e in enumerate(events)if e==['write','save:/civhomebrew/apps/fixture/manifest.json']);self.assertLess(remove,manifest)
  for f in p['files']:self.assertLess(next(i for i,e in enumerate(events)if e==['write','save:/civhomebrew/apps/fixture/'+f['name']]),manifest)
 def test_invalid_plan_preserves_previous_installation(self):
  p={**self.p,'entry':{**self.p['entry'],'bytes':1}};r=self.run_frames([streamed.begin_body(p,'t')]);self.assertIn('plan mismatch',r['error']);self.assertEqual(r['entries'][0]['name'],'Old');self.assertFalse(any(e[0]=='remove'for e in r['events']))
 def test_bad_file_stays_unlisted_without_executable_manifest(self):
  f={**self.p['files'][0],'data':'tampered'};r=self.run_frames([streamed.begin_body(self.p,'t'),streamed.file_body(0,f,'t')]);self.assertIn('integrity mismatch',r['error']);self.assertEqual(r['entries'],[]);self.assertIsNone(r['manifest']);self.assertEqual(r['state']['next'],0);self.assertTrue(all('data'not in f for f in r['state']['files']))
 def test_incomplete_or_out_of_order_stream_cannot_publish(self):
  for bad in [streamed.finish_body('t'),streamed.file_body(1,self.p['files'][1],'t')]:
   r=self.run_frames([streamed.begin_body(self.p,'t'),bad]);self.assertIsNotNone(r['error']);self.assertEqual(r['entries'],[]);self.assertIsNone(r['manifest'])

 def test_companion_cli_routes_large_installs_without_large_rpc(self):
  from unittest.mock import patch
  import payload_menu
  package={'id':'fixture','name':'Fixture'}
  with patch.object(payload_menu,'read_package',return_value=package), patch.object(payload_menu,'wire_json',return_value=b'x'*(8*1024*1024+1)), patch.object(streamed,'install_package',return_value={'entry':{}}) as install, patch.object(payload_menu,'rpc') as rpc:
   self.assertEqual(payload_menu.main(['install','host','fixture.civapp','--loader-port','9036']),0)
   install.assert_called_once_with('host',package,ROOT/'build/streamed-install/fixture',port=9027,raw_port=9036);rpc.assert_not_called()

if __name__=='__main__':unittest.main()
