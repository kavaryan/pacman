#!/usr/bin/env python3

"""Validate PACMan theorem JSON before catalogue/browser checks."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path


REQUIRED_RESULT_KEYS = {
    "id",
    "type",
    "number",
    "title",
    "section",
    "proofOrganization",
    "dependencies",
    "statementHtml",
    "proofHtml",
    "pdfStart",
}
FORBIDDEN_RESULT_KEYS = {"images", "sourcePages"}


def fail(path: Path, message: str) -> None:
    raise ValueError(f"{path}: {message}")


def read_page_count(pdf_path: Path) -> int:
    try:
        output = subprocess.check_output(
            ["pdfinfo", str(pdf_path)], text=True, errors="replace"
        )
    except FileNotFoundError as error:
        raise RuntimeError("pdfinfo is required for --pdf-dir validation") from error
    except subprocess.CalledProcessError as error:
        raise ValueError(f"{pdf_path}: pdfinfo failed") from error
    match = re.search(r"^Pages:\s+(\d+)$", output, re.MULTILINE)
    if not match:
        raise ValueError(f"{pdf_path}: pdfinfo did not report a page count")
    return int(match.group(1))


def check_fragment(path: Path, result_id: str, field: str, fragment: str) -> None:
    if fragment.count(r"\(") != fragment.count(r"\)"):
        fail(path, f"{result_id}.{field} has unbalanced inline MathJax delimiters")
    if fragment.count(r"\[") != fragment.count(r"\]"):
        fail(path, f"{result_id}.{field} has unbalanced display MathJax delimiters")
    HTMLParser().feed(fragment)


def validate_target(
    path: Path, result_id: str, kind: str, target: object, page_count: int | None
) -> None:
    if not isinstance(target, dict) or set(target) != {"page", "y"}:
        fail(path, f"{result_id}.pdfStart.{kind} must contain exactly page and y")
    page = target["page"]
    y = target["y"]
    if isinstance(page, bool) or not isinstance(page, int) or page < 1:
        fail(path, f"{result_id}.pdfStart.{kind}.page must be a positive integer")
    if isinstance(y, bool) or not isinstance(y, (int, float)) or y < 0:
        fail(path, f"{result_id}.pdfStart.{kind}.y must be a non-negative number")
    if page_count is not None and page > page_count:
        fail(path, f"{result_id}.pdfStart.{kind}.page exceeds PDF page count {page_count}")


def validate_file(
    path: Path, metadata_ids: set[str] | None, pdf_dir: Path | None
) -> int:
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(path, f"cannot parse JSON: {error}")
    if not isinstance(document, list) or len(document) != 1:
        fail(path, "expected a one-element JSON array")
    paper = document[0]
    if not isinstance(paper, dict) or set(paper) != {"id", "theorems"}:
        fail(path, "paper object must contain exactly id and theorems")
    paper_id = paper["id"]
    if not isinstance(paper_id, str) or path.stem != paper_id:
        fail(path, f"filename must match paper id {paper_id!r}")
    if metadata_ids is not None and paper_id not in metadata_ids:
        fail(path, "paper id has no unique metadata record")
    if not isinstance(paper["theorems"], list):
        fail(path, "theorems must be an array")

    page_count = None
    if pdf_dir is not None:
        pdf_path = pdf_dir / f"{paper_id}.pdf"
        if not pdf_path.is_file():
            fail(path, f"missing PDF {pdf_path}")
        page_count = read_page_count(pdf_path)

    result_ids: list[str] = []
    dependencies: list[tuple[str, str]] = []
    for index, result in enumerate(paper["theorems"]):
        if not isinstance(result, dict):
            fail(path, f"theorems[{index}] must be an object")
        result_id = result.get("id")
        if not isinstance(result_id, str) or not result_id:
            fail(path, f"theorems[{index}] has an invalid id")
        missing = REQUIRED_RESULT_KEYS - set(result)
        if missing:
            fail(path, f"{result_id} is missing fields: {', '.join(sorted(missing))}")
        forbidden = FORBIDDEN_RESULT_KEYS & set(result)
        if forbidden:
            fail(path, f"{result_id} has legacy fields: {', '.join(sorted(forbidden))}")
        result_ids.append(result_id)

        for field in ("type", "number", "title", "section", "proofOrganization"):
            if not isinstance(result[field], str):
                fail(path, f"{result_id}.{field} must be a string")
        if not isinstance(result["dependencies"], list) or not all(
            isinstance(item, str) for item in result["dependencies"]
        ):
            fail(path, f"{result_id}.dependencies must be an array of strings")
        dependencies.extend((result_id, item) for item in result["dependencies"])
        if not isinstance(result["statementHtml"], str) or not isinstance(
            result["proofHtml"], str
        ):
            fail(path, f"{result_id} HTML fields must be strings")
        if not result["type"] or not result["title"] or not result["statementHtml"].strip():
            fail(path, f"{result_id} has an empty type, title, or statement")
        check_fragment(path, result_id, "statementHtml", result["statementHtml"])
        check_fragment(path, result_id, "proofHtml", result["proofHtml"])

        starts = result["pdfStart"]
        if not isinstance(starts, dict) or "statement" not in starts:
            fail(path, f"{result_id}.pdfStart must contain statement")
        if not set(starts) <= {"statement", "proof"}:
            fail(path, f"{result_id}.pdfStart contains unsupported targets")
        has_proof = bool(result["proofHtml"].strip())
        if has_proof != ("proof" in starts):
            fail(path, f"{result_id} proofHtml/pdfStart.proof presence does not match")
        for kind, target in starts.items():
            validate_target(path, result_id, kind, target, page_count)

    if len(result_ids) != len(set(result_ids)):
        fail(path, "result ids are not unique")
    known_ids = set(result_ids)
    unresolved = [(owner, dep) for owner, dep in dependencies if dep not in known_ids]
    if unresolved:
        fail(path, f"unresolved dependencies: {unresolved}")
    return len(result_ids)


def metadata_ids(path: Path) -> set[str]:
    records = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(records, list):
        raise ValueError(f"{path}: expected a JSON array")
    ids = [Path(item["pdf_path"]).stem for item in records if item.get("pdf_path")]
    duplicates = {paper_id for paper_id in ids if ids.count(paper_id) > 1}
    if duplicates:
        raise ValueError(f"{path}: duplicate paper ids: {sorted(duplicates)}")
    return set(ids)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("json_files", nargs="+", type=Path)
    parser.add_argument("--metadata", type=Path)
    parser.add_argument("--pdf-dir", type=Path)
    args = parser.parse_args()
    known_metadata_ids = metadata_ids(args.metadata) if args.metadata else None
    total = 0
    for path in args.json_files:
        count = validate_file(path, known_metadata_ids, args.pdf_dir)
        total += count
        print(f"OK {path}: {count} results")
    print(f"Validated {len(args.json_files)} paper JSON file(s), {total} result(s).")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, RuntimeError) as error:
        print(error, file=sys.stderr)
        raise SystemExit(1)
