import os
import zipfile

dist_dir = 'dist'
zip_filename = 'public/dist.zip'

if not os.path.exists(dist_dir):
    print("dist directory not found, cannot create zip.")
    exit(1)

if os.path.exists(zip_filename):
    os.remove(zip_filename)

with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk(dist_dir):
        for f in files:
            if f.endswith('.zip'):
                continue
            full_path = os.path.join(root, f)
            rel_path = os.path.relpath(full_path, dist_dir)
            if rel_path.startswith('assets' + os.sep + 'aistudio'):
                continue
            zf.write(full_path, rel_path)

print(f"Created {zip_filename} successfully ({os.path.getsize(zip_filename)} bytes).")
