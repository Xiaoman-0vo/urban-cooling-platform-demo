"""Download or verify the source-data Release assets using Python 3.11+.

This uses the standard library only. Existing files are never overwritten.
No ZIP is extracted and no project input is modified by this utility.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import BinaryIO

CHUNK_BYTES = 1024 * 1024
ASSET_INDEX = Path(__file__).with_name('release_assets.json')
DEFAULT_DIRECTORY = Path(__file__).with_name('downloads')


class IntegrityError(ValueError):
    """A file does not match the expected byte count and SHA256."""


def digest_stream(stream: BinaryIO) -> tuple[int, str]:
    """Calculate byte count and SHA256 without loading a whole file."""
    digest = hashlib.sha256()
    size = 0
    while chunk := stream.read(CHUNK_BYTES):
        digest.update(chunk)
        size += len(chunk)
    return size, digest.hexdigest()


def verify_file(path: Path, asset: dict) -> None:
    """Verify a local file against the recorded expected bytes and SHA256."""
    if not path.is_file():
        raise FileNotFoundError(f'File is missing: {path}')
    with path.open('rb') as stream:
        size, digest = digest_stream(stream)
    if size != asset['bytes'] or digest != asset['sha256']:
        raise IntegrityError(f'Integrity check failed for {path.name}; existing file retained. '
                             f'Expected {asset["bytes"]} bytes / {asset["sha256"]}; '
                             f'got {size} bytes / {digest}.')


def download_asset(asset: dict, directory: Path) -> str:
    """Download to a new temporary file and publish only a verified result."""
    directory.mkdir(parents=True, exist_ok=True)
    destination = directory / asset['name']
    if destination.exists():
        verify_file(destination, asset)
        return f'Already present and verified; skipped: {destination.name}'
    temporary: Path | None = None
    destination_created = False
    try:
        request = urllib.request.Request(asset['url'], headers={
            'User-Agent': 'urban-cooling-data-downloader/1.0',
            'Accept': 'application/octet-stream', 'Accept-Encoding': 'identity'})
        with tempfile.NamedTemporaryFile(mode='wb', prefix='.' + asset['name'] + '.',
                                         suffix='.partial', dir=directory, delete=False) as sink:
            temporary = Path(sink.name)
            with urllib.request.urlopen(request, timeout=60) as response:
                received = 0
                while chunk := response.read(CHUNK_BYTES):
                    received += len(chunk)
                    if received > asset['bytes']:
                        raise IntegrityError(f'Download exceeds expected size for {asset["name"]}')
                    sink.write(chunk)
        verify_file(temporary, asset)
        # Exclusive creation protects against another process creating the final
        # path during the download. Copying avoids platform-specific hard links.
        with destination.open('xb') as final_file:
            destination_created = True
            with temporary.open('rb') as source:
                shutil.copyfileobj(source, final_file, CHUNK_BYTES)
        verify_file(destination, asset)
        return f'Downloaded and SHA256 verified: {destination.name}'
    except BaseException:
        if destination_created and destination.exists():
            destination.unlink()
        raise
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def load_index(path: Path = ASSET_INDEX) -> dict:
    """Load the committed manifest and reject unsafe filenames or URLs."""
    index = json.loads(path.read_text(encoding='utf-8'))
    expected_prefix = (index['repository'].rstrip('/') + '/releases/download/'
                       + index['release_tag'] + '/')
    if index['repository'] != 'https://github.com/Xiaoman-0vo/urban-cooling-platform-demo':
        raise ValueError('Unexpected repository in asset index')
    names = set()
    for asset in index['assets']:
        name = asset['name']
        if Path(name).name != name or '/' in name or '\\' in name or name in ('', '.', '..'):
            raise ValueError('Unsafe asset filename')
        if name in names:
            raise ValueError('Duplicate asset filename')
        names.add(name)
        if asset['url'] != expected_prefix + name:
            raise ValueError('Unexpected asset URL')
        if not isinstance(asset['bytes'], int) or asset['bytes'] <= 0:
            raise ValueError('Invalid asset byte count')
        digest = asset['sha256']
        if len(digest) != 64 or any(char not in '0123456789abcdef' for char in digest):
            raise ValueError('Invalid SHA256')
    return index


def main(argv: list[str] | None = None) -> int:
    """List expected assets, explicitly download them, or verify local files."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('list', 'download', 'verify'))
    parser.add_argument('assets', nargs='*', help='Exact ZIP asset filenames')
    parser.add_argument('--all', action='store_true', help='Select all four assets')
    parser.add_argument('--directory', type=Path, default=DEFAULT_DIRECTORY,
                        help='Local ZIP directory; defaults to datasets/downloads')
    args = parser.parse_args(argv)
    try:
        index = load_index()
        by_name = {asset['name']: asset for asset in index['assets']}
        if args.all and args.assets:
            raise ValueError('Choose asset filenames or --all, not both')
        unknown = set(args.assets) - set(by_name)
        if unknown:
            raise ValueError('Unknown asset: ' + ', '.join(sorted(unknown)))
        if args.action == 'download' and not args.all and not args.assets:
            raise ValueError('Specify one or more ZIP filenames, or use --all')
        selected = [by_name[name] for name in dict.fromkeys(args.assets)] if args.assets else list(by_name.values())
        if args.action == 'list':
            print(f'Release status: {index["status"]}; tag: {index["release_tag"]}')
            for asset in selected:
                print(f'{asset["name"]}\t{asset["bytes"]} bytes\t{asset["sha256"]}')
            return 0
        if args.action == 'download' and index.get('status') == 'pending':
            print('Release is marked pending in this checkout; a download may return 404. '
                  'Only a completed SHA256 check is reported as verified.', file=sys.stderr)
        for asset in selected:
            if args.action == 'verify':
                verify_file(args.directory / asset['name'], asset)
                print(f'Local SHA256 verified: {asset["name"]}')
            else:
                print(download_asset(asset, args.directory))
        return 0
    except (OSError, ValueError, urllib.error.URLError) as error:
        print(f'Error: {error}', file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print('Interrupted; incomplete download removed.', file=sys.stderr)
        return 130


if __name__ == '__main__':
    raise SystemExit(main())
