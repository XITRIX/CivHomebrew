#!/usr/bin/env python3
"""Verify the pinned CivApps native UI release (no sibling checkout/toolchain)."""
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
from civapps_native_ui import verify
if __name__=='__main__':print('Verified CivApps native UI',verify(ROOT)['version'])
