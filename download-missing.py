# Run from the root of the extracted website folder: python3 download-missing.py
# Downloads only the 108 asset URLs listed in MISSING_FILES.csv.
import csv, pathlib, urllib.request, urllib.error, time
root=pathlib.Path(__file__).resolve().parent
rows=list(csv.DictReader((root/'MISSING_FILES.csv').open(newline='',encoding='utf-8')))
ok=failed=0
for i,row in enumerate(rows,1):
    target=(root/row['path']).resolve()
    if not target.is_relative_to(root):
        print('Unsafe path:',row['path']);failed+=1;continue
    if target.exists() and target.stat().st_size>0:
        print(f'[{i}/{len(rows)}] Already exists: {row["path"]}');ok+=1;continue
    try:
        req=urllib.request.Request(row['url'],headers={'User-Agent':'Mozilla/5.0'})
        with urllib.request.urlopen(req,timeout=25) as response:
            data=response.read()
            if not data.startswith(b'\x89PNG\r\n\x1a\n'):
                raise ValueError('Response is not a PNG image')
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(data)
        ok+=1;print(f'[{i}/{len(rows)}] Saved {row["path"]} ({len(data)} bytes)')
    except Exception as exc:
        failed+=1;print(f'[{i}/{len(rows)}] FAILED {row["url"]}: {exc}')
print(f'Finished: {ok} present/downloaded, {failed} missing.')
if failed: raise SystemExit(1)
