#!/usr/bin/env python3
"""Generate font-independent A/B/Minus footer glyphs as antialiased transparent PNGs."""
from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1]
SIZE = 100
SAMPLES = 4


def polygon(x, y, points):
    inside = False
    previous = points[-1]
    for point in points:
        x1, y1 = previous
        x2, y2 = point
        if (y1 > y) != (y2 > y) and x < (x2-x1)*(y-y1)/(y2-y1)+x1:
            inside = not inside
        previous = point
    return inside


def glyph(letter, x, y):
    if letter == 'minus':
        return 25 <= x <= 75 and 45 <= y <= 55
    if letter == 'A':
        outline = [(25,78),(44,22),(56,22),(75,78),(63,78),(58,64),(42,64),(37,78)]
        hole = [(46,54),(54,54),(50,39)]
        return polygon(x,y,outline) and not polygon(x,y,hole)
    if letter == 'Y':
        return polygon(x,y,[(24,22),(38,22),(50,43),(62,22),(76,22),(56,56),(56,78),(44,78),(44,56)])
    outer = (29 <= x <= 50 and 22 <= y <= 78)
    outer |= x >= 50 and ((x-50)/21)**2+((y-36)/14)**2 <= 1
    outer |= x >= 50 and ((x-50)/22)**2+((y-63)/15)**2 <= 1
    upper_hole = (41 <= x <= 50 and 32 <= y <= 42)
    upper_hole |= x >= 50 and ((x-50)/10)**2+((y-37)/5)**2 <= 1
    lower_hole = (41 <= x <= 50 and 57 <= y <= 68)
    lower_hole |= x >= 50 and ((x-50)/11)**2+((y-62.5)/5.5)**2 <= 1
    return outer and not (upper_hole or lower_hole)


def chunk(kind, data):
    return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)


def render(letter):
    rows = []
    for y in range(SIZE):
        row = bytearray(b'\0')
        for x in range(SIZE):
            covered = white = 0
            for sy in range(SAMPLES):
                for sx in range(SAMPLES):
                    px, py = x+(sx+.5)/SAMPLES, y+(sy+.5)/SAMPLES
                    if (px-50)**2+(py-50)**2 <= 50**2:
                        covered += 1
                        white += not glyph(letter,px,py)
            color = round(245*white/covered) if covered else 0
            row.extend((color,color,color,round(255*covered/(SAMPLES*SAMPLES))))
        rows.append(row)
    header = struct.pack('>IIBBBBB',SIZE,SIZE,8,6,0,0,0)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',header)+chunk(b'IDAT',zlib.compress(b''.join(rows),9))+chunk(b'IEND',b'')


if __name__ == '__main__':
    folder = ROOT/'app/assets'
    folder.mkdir(parents=True,exist_ok=True)
    for letter in ('A', 'B', 'Y', 'minus'):
        (folder/f'button-{letter.lower()}.png').write_bytes(render(letter))
