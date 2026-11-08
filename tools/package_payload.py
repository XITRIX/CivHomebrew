#!/usr/bin/env python3
"""Package a CivSwitch payload directory interactively or from CI arguments."""
import argparse
import json
import os
from pathlib import Path
import re
import sys
import tempfile

import payload_menu as pm


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix='.'+path.name+'.', delete=False) as f:
            temporary = Path(f.name)
            f.write(data)
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def build(args):
    interactive = not args.non_interactive and sys.stdin.isatty()

    def ask(label, flag, default=None, optional=False):
        if not interactive:
            raise ValueError(f'Missing {label}; supply {flag} (non-interactive input)')
        while True:
            value = input(label+(f' [{default}]' if default is not None else '')+': ').strip()
            if value:
                return value
            if default is not None:
                return default
            if optional:
                return ''
            print(label+' is required.')

    if args.directory is not None and args.directory_option is not None:
        raise ValueError('Use either the directory argument or --directory, not both')
    directory = args.directory_option or args.directory
    root = Path(directory or ask('Payload directory', '--directory')).expanduser().resolve()
    if not root.is_dir():
        raise ValueError(f'Payload directory does not exist: {root}')
    manifest_path = root/'payload.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {}
    if not isinstance(manifest, dict):
        raise ValueError('payload.json must contain an object')
    manifest = dict(manifest)
    for key, option, label, flag in (
        ('name', args.name, 'App name', '--name'),
        ('id', args.id, 'Stable app ID', '--id'),
        ('author', args.creator, 'Creator', '--creator'),
        ('release', args.version, 'Version', '--version'),
    ):
        if option is not None:
            manifest[key] = option
        elif not isinstance(manifest.get(key), str) or not manifest[key].strip():
            default = None
            if key == 'id':
                default = re.sub(r'[^a-z0-9]+', '-', manifest['name'].lower()).strip('-')[:48] or 'my-app'
            manifest[key] = ask(label, flag, default=default)
        if not manifest[key].strip():
            raise ValueError(label+' must not be empty')
    if args.description is not None:
        manifest['description'] = args.description
    elif 'description' not in manifest:
        manifest['description'] = ask('Description (optional)', '--description', optional=True) if interactive else ''
    manifest['api'] = args.api if args.api is not None else manifest.get('api', 1)
    if args.script is not None:
        manifest['scripts'] = args.script
    elif 'scripts' not in manifest:
        candidates = sorted(p.name for p in root.glob('*.js') if p.is_file())
        if (root/'app.js').is_file():
            default = 'app.js'
        else:
            default = candidates[0] if len(candidates) == 1 else None
        # Even a plausible app.js can depend on other scripts: confirm launch order.
        print('List dependencies first and the app entry script last.')
        manifest['scripts'] = [s.strip() for s in ask('Ordered scripts (comma separated)', '--script (repeat in launch order)', default=default).split(',')]
    if args.no_icon:
        manifest['icon'] = None
    elif args.icon is not None:
        # A typo in an explicit CI input must fail, rather than silently dropping artwork.
        if not pm.inside(root, args.icon).is_file():
            raise ValueError(f'Icon does not exist: {args.icon}')
        manifest['icon'] = args.icon
    elif manifest.get('icon', 'icon.png') is not None:
        candidate = manifest.get('icon', 'icon.png')
        if pm.inside(root, candidate).is_file():
            manifest['icon'] = candidate
        else:
            print(f'No icon found at {candidate}. Expected a 256×256 PNG.')
            if not interactive:
                raise ValueError('Missing icon; supply --icon PATH or explicitly allow no icon with --no-icon')
            answer = ask('Continue without an icon? (y/N)', '--no-icon', default='n')
            if answer.lower() not in ('y', 'yes'):
                raise ValueError('Packaging cancelled; add an icon and run again')
            manifest['icon'] = None
    package = pm.pack_directory(root, manifest=manifest)
    output = (args.output.expanduser().resolve() if args.output else root/'dist'/(manifest['id']+'.civapp'))
    if output.suffix != '.civapp':
        raise ValueError('Output filename must end in .civapp')
    inputs = [manifest_path.resolve()]+[pm.inside(root, s) for s in manifest['scripts']]
    if manifest.get('icon') is not None:
        inputs.append(pm.inside(root, manifest['icon']))
    if output in inputs:
        raise ValueError('Output would overwrite a package input')
    # Validate everything before publishing output or updating reusable metadata.
    atomic_write(output, pm.wire_json(package)+b'\n')
    if not args.no_save_metadata:
        atomic_write(manifest_path, (json.dumps(manifest, ensure_ascii=False, indent=2)+'\n').encode('utf-8'))
        print(f'Metadata saved: {manifest_path}')
    print(f"Packed {package['name']}: {output} ({output.stat().st_size:,} bytes, {len(package['scripts'])} scripts)")
    return output


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', nargs='?', help='Existing payload directory (prompted when omitted)')
    parser.add_argument('--directory', dest='directory_option', help='CI alternative to the directory argument')
    parser.add_argument('-o', '--output', type=Path, help='Output .civapp; default: PAYLOAD/dist/ID.civapp')
    parser.add_argument('--id', help='Stable installation ID, reused for updates')
    parser.add_argument('--name', help='App display name')
    parser.add_argument('--creator', '--author', dest='creator', help='App creator')
    parser.add_argument('--version', '--release', dest='version', help='App release version, not the package format version')
    parser.add_argument('--description', help='Optional short description')
    parser.add_argument('--api', type=int, choices=[1], help='Launcher API version (default: 1)')
    parser.add_argument('--script', action='append', help='Relative JS path; repeat in launch order, entry script last')
    icons = parser.add_mutually_exclusive_group()
    icons.add_argument('--icon', help='Relative path to a 256×256 PNG inside the payload directory')
    icons.add_argument('--no-icon', action='store_true', help='Explicitly package without artwork; remember this choice')
    parser.add_argument('--non-interactive', action='store_true', help='Never prompt; missing required settings are errors')
    parser.add_argument('--no-save-metadata', action='store_true', help='Do not create/update payload.json (read-only CI sources)')
    args = parser.parse_args(argv)
    try:
        build(args)
    except (OSError, ValueError, KeyError, TypeError, EOFError) as error:
        parser.exit(1, f'Stopped: {error}\n')
    except KeyboardInterrupt:
        print('\nPackaging cancelled.', file=sys.stderr)
        return 130
    return 0


if __name__ == '__main__':
    sys.exit(main())
