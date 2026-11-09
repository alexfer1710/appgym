#!/usr/bin/env python3
"""Read a downloaded Xcode .xcappdata; never change the phone or container."""
import argparse,json,plistlib,pathlib
p=argparse.ArgumentParser();p.add_argument('container',type=pathlib.Path);p.add_argument('output',type=pathlib.Path);p.add_argument('--profile',choices=['alex','alba'],default='alex');args=p.parse_args()
key='gym11.sessions.v1' if args.profile=='alex' else 'gym11.sessions.alba.v1'
found=[]
for file in args.container.rglob('*.plist'):
 try:
  with file.open('rb') as f:doc=plistlib.load(f)
  if key in doc:found.append((file,doc))
 except (OSError,plistlib.InvalidFileException):pass
if len(found)!=1:raise SystemExit(f'Se esperaba un único archivo de preferencias con {key}; encontrados: {len(found)}. No se ha escrito nada.')
file,doc=found[0]
def decode(k,default):
 value=doc.get(k)
 if value is None or value==b'':return default
 if isinstance(value,bytes):return json.loads(value)
 if isinstance(value,str):return json.loads(value)
 return value
payload={'format':'gym11-swift','version':1,'sessions':decode(key,[]),'customExercises':decode('gym11.custom-exercises.v1',[]),'gripSettings':decode('gym11.grips.v1',{})}
if args.output.exists():raise SystemExit('El archivo de salida ya existe. Elige otro nombre para conservarlo.')
args.output.write_text(json.dumps(payload,ensure_ascii=False,indent=2))
print(f'{len(payload["sessions"])} entrenos exportados a {args.output}')
