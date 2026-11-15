#!/usr/bin/env python3
"""Build the persistent native UI launcher; never deploys it."""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from native_launcher import build
if __name__=='__main__':build()
