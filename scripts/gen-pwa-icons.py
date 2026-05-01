"""Génère les icônes PWA PNG 192x192 et 512x512 sans dépendance externe."""
import struct, zlib, os

def make_png(size, bg=(0, 48, 135)):
    """PNG uni couleur bg, taille size x size."""
    def chunk(tag, data):
        crc = zlib.crc32(tag + data) & 0xffffffff
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', crc)

    sig  = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
    raw  = b''.join(b'\x00' + bytes(bg) * size for _ in range(size))
    idat = chunk(b'IDAT', zlib.compress(raw, 9))
    iend = chunk(b'IEND', b'')
    return sig + ihdr + idat + iend

dest = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
os.makedirs(dest, exist_ok=True)

for size in (192, 512):
    path = os.path.join(dest, f'pwa-{size}.png')
    with open(path, 'wb') as f:
        f.write(make_png(size))
    print(f'Created {path}')
