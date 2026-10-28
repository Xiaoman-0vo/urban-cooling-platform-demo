#!/usr/bin/env python
"""校验契约 schema 自身合法，并校验 examples 里的请求/响应样本。

用法： python contract/validate.py
"""
import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

HERE = Path(__file__).resolve().parent
SCHEMA_PATH = HERE / "weibo-demand.contract.v1.schema.json"


def main() -> int:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    print(f"[ok] schema is valid Draft 2020-12: {SCHEMA_PATH.name}")
    print(f"[ok] $defs: {len(schema.get('$defs', {}))} definitions")

    validator = Draft202012Validator(schema)
    failed = 0
    for i, example in enumerate(schema.get("examples", [])):
        errors = sorted(validator.iter_errors(example), key=lambda e: list(e.path))
        kind = "response" if "status" in example else "request"
        if errors:
            failed += 1
            print(f"[fail] example #{i} ({kind})")
            for e in errors[:5]:
                print(f"       - {list(e.path)}: {e.message}")
        else:
            print(f"[ok] example #{i} ({kind}) matches contract")

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
