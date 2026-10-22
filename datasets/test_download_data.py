"""Focused offline tests for corruption handling and non-overwriting downloads."""

from __future__ import annotations

import hashlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import download_data


class DownloadDataTests(unittest.TestCase):
    """Use small in-memory HTTP responses; never contact an external host."""

    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.directory = Path(self.temporary.name)
        self.payload = b'unchanged-source-data\x00\x01' * 1024
        self.asset = {'name': 'sample.zip', 'bytes': len(self.payload),
                      'sha256': hashlib.sha256(self.payload).hexdigest(),
                      'url': 'https://github.com/example/repository/releases/download/test/sample.zip'}

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_valid_response_is_saved_and_verified(self) -> None:
        with patch('download_data.urllib.request.urlopen', return_value=io.BytesIO(self.payload)):
            result = download_data.download_asset(self.asset, self.directory)
        self.assertIn('SHA256 verified', result)
        self.assertEqual((self.directory / 'sample.zip').read_bytes(), self.payload)
        self.assertEqual(len(list(self.directory.iterdir())), 1)

    def test_existing_valid_file_skips_network(self) -> None:
        target = self.directory / 'sample.zip'
        target.write_bytes(self.payload)
        with patch('download_data.urllib.request.urlopen') as request:
            self.assertIn('skipped', download_data.download_asset(self.asset, self.directory))
            request.assert_not_called()

    def test_existing_wrong_file_is_never_overwritten(self) -> None:
        target = self.directory / 'sample.zip'
        target.write_bytes(b'user file')
        with patch('download_data.urllib.request.urlopen') as request:
            with self.assertRaises(download_data.IntegrityError):
                download_data.download_asset(self.asset, self.directory)
            request.assert_not_called()
        self.assertEqual(target.read_bytes(), b'user file')

    def test_wrong_hash_cleans_only_own_temporary_file(self) -> None:
        other = self.directory / 'other.partial'
        other.write_bytes(b'keep')
        corrupted = b'x' * len(self.payload)
        with patch('download_data.urllib.request.urlopen', return_value=io.BytesIO(corrupted)):
            with self.assertRaises(download_data.IntegrityError):
                download_data.download_asset(self.asset, self.directory)
        self.assertEqual(list(self.directory.iterdir()), [other])

    def test_oversized_response_rejected(self) -> None:
        with patch('download_data.urllib.request.urlopen', return_value=io.BytesIO(self.payload + b'extra')):
            with self.assertRaises(download_data.IntegrityError):
                download_data.download_asset(self.asset, self.directory)
        self.assertEqual(list(self.directory.iterdir()), [])

    def test_network_failure_does_not_leave_partial_zip(self) -> None:
        with patch('download_data.urllib.request.urlopen', side_effect=OSError('offline fixture')):
            with self.assertRaises(OSError):
                download_data.download_asset(self.asset, self.directory)
        self.assertEqual(list(self.directory.iterdir()), [])

    def test_valid_index_matches_known_four_local_assets(self) -> None:
        index = download_data.load_index()
        self.assertEqual(len(index['assets']), 4)
        self.assertEqual(sum(asset['bytes'] for asset in index['assets']), 1934710524)

    def test_unsafe_index_filename_rejected(self) -> None:
        index = download_data.load_index()
        index['assets'][0]['name'] = '../escape.zip'
        target = self.directory / 'unsafe.json'
        target.write_text(json.dumps(index), encoding='utf-8')
        with self.assertRaises(ValueError):
            download_data.load_index(target)


if __name__ == '__main__':
    unittest.main()
