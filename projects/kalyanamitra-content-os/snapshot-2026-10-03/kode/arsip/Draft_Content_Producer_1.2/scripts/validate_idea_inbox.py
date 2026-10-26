#!/usr/bin/env python3
"""Validate a Kalyanamitra Idea Inbox without calling external services."""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from datetime import date, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


EXACT_VALUES = {
    "schema_version": "kalyanamitra-idea-inbox.v1",
    "owner_namespace": "ruang-kalyanamitra",
    "language": "id-ID",
    "timezone": "Asia/Jakarta",
}

INBOX_ID_RE = re.compile(r"^rk-ideas-\d{8}(?:-[a-z0-9][a-z0-9-]{0,39})?$")
IDEA_ID_RE = re.compile(r"^idea-[a-z0-9][a-z0-9-]{2,63}$")
EXTERNAL_ID_RE = re.compile(r"^rk-\d{8}-0[1-5]$")
TIME_SENSITIVE_TYPES = {"social-trend", "current-event"}
SOURCE_TYPES = {
    "audience-question",
    "community-observation",
    "internal-note",
    "content-performance",
    "buddhist-calendar",
    "scripture-topic",
    "teacher-article",
    "social-trend",
    "current-event",
    "other",
}
TRADITION_HINTS = {
    "theravada",
    "mahayana",
    "vajrayana",
    "cross-tradition",
    "general-buddhist",
    "unknown",
}
PRIVACY_STATUSES = {
    "public-source",
    "anonymized-private-input",
    "user-owned",
    "needs-review",
}


def parse_datetime(value: Any, label: str, errors: list[str]) -> datetime | None:
    if not isinstance(value, str):
        errors.append(f"{label}: expected ISO date-time string")
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        errors.append(f"{label}: invalid ISO date-time {value!r}")
        return None
    if parsed.tzinfo is None:
        errors.append(f"{label}: timezone offset is required")
    return parsed


def parse_date(value: Any, label: str, errors: list[str]) -> date | None:
    if value is None:
        return None
    if not isinstance(value, str):
        errors.append(f"{label}: expected ISO date string or null")
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        errors.append(f"{label}: invalid ISO date {value!r}")
        return None


def valid_http_url(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def optional_jsonschema_validation(
    data: dict[str, Any], skill_root: Path, errors: list[str], warnings: list[str]
) -> None:
    try:
        import jsonschema  # type: ignore
    except ImportError:
        warnings.append("jsonschema package not installed; deterministic checks still ran")
        return

    schema_path = skill_root / "references" / "idea-inbox.schema.json"
    try:
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        validator = jsonschema.Draft202012Validator(
            schema, format_checker=jsonschema.FormatChecker()
        )
        for issue in sorted(validator.iter_errors(data), key=lambda item: list(item.path)):
            location = ".".join(str(part) for part in issue.path) or "$"
            errors.append(f"schema {location}: {issue.message}")
    except (OSError, json.JSONDecodeError) as exc:
        warnings.append(f"schema file unavailable: {exc}")


def validate(path: Path) -> tuple[list[str], list[str], dict[str, int]]:
    errors: list[str] = []
    warnings: list[str] = []
    stats = {"items": 0, "active": 0, "used": 0, "archived": 0}

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        return [f"cannot read file: {exc}"], warnings, stats
    except json.JSONDecodeError as exc:
        return [f"invalid JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}"], warnings, stats

    if not isinstance(data, dict):
        return ["top level must be a JSON object"], warnings, stats

    skill_root = Path(__file__).resolve().parents[1]
    optional_jsonschema_validation(data, skill_root, errors, warnings)

    for field, expected in EXACT_VALUES.items():
        if data.get(field) != expected:
            errors.append(f"{field}: expected {expected!r}, got {data.get(field)!r}")

    inbox_id = data.get("inbox_id")
    if not isinstance(inbox_id, str) or not INBOX_ID_RE.fullmatch(inbox_id):
        errors.append("inbox_id must match rk-ideas-YYYYMMDD[-label]")

    created = parse_datetime(data.get("created_at"), "created_at", errors)
    updated = parse_datetime(data.get("updated_at"), "updated_at", errors)
    if created and updated and created.tzinfo and updated.tzinfo and updated < created:
        errors.append("updated_at must not be earlier than created_at")

    items = data.get("items")
    if not isinstance(items, list) or not items:
        errors.append("items must be a non-empty array")
        return errors, warnings, stats
    stats["items"] = len(items)

    idea_ids: list[str] = []
    normalized_titles: list[str] = []
    for index, item in enumerate(items):
        prefix = f"items[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{prefix}: expected object")
            continue

        idea_id = item.get("idea_id")
        if not isinstance(idea_id, str) or not IDEA_ID_RE.fullmatch(idea_id):
            errors.append(f"{prefix}.idea_id: invalid format")
        else:
            idea_ids.append(idea_id)

        title = item.get("title")
        if not isinstance(title, str) or not title.strip():
            errors.append(f"{prefix}.title must be non-empty")
        else:
            normalized_titles.append(" ".join(title.lower().split()))

        summary = item.get("summary")
        if not isinstance(summary, str) or not summary.strip():
            errors.append(f"{prefix}.summary must be non-empty")
        elif len(summary) > 1000:
            errors.append(f"{prefix}.summary exceeds 1000 characters")

        source_url = item.get("source_url")
        if source_url is not None and not valid_http_url(source_url):
            errors.append(f"{prefix}.source_url must be an http(s) URL or null")

        source_date = parse_date(item.get("source_date"), f"{prefix}.source_date", errors)
        parse_datetime(item.get("captured_at"), f"{prefix}.captured_at", errors)

        if item.get("usage") != "inspiration-only":
            errors.append(f"{prefix}.usage must be 'inspiration-only'")

        priority = item.get("priority")
        if not isinstance(priority, int) or isinstance(priority, bool) or not 1 <= priority <= 5:
            errors.append(f"{prefix}.priority must be an integer from 1 to 5")

        source_type = item.get("source_type")
        if source_type not in SOURCE_TYPES:
            errors.append(f"{prefix}.source_type is invalid")
        if item.get("tradition_hint") not in TRADITION_HINTS:
            errors.append(f"{prefix}.tradition_hint is invalid")
        time_sensitive = item.get("time_sensitive")
        if not isinstance(time_sensitive, bool):
            errors.append(f"{prefix}.time_sensitive must be boolean")
        elif time_sensitive or source_type in TIME_SENSITIVE_TYPES:
            if source_date is None:
                errors.append(f"{prefix}: time-sensitive ideas require source_date")
            warnings.append(f"{prefix}: route this item through RISET_VIRAL before production")

        if source_type == "other" and not str(item.get("source_note", "")).strip():
            errors.append(f"{prefix}: source_type 'other' requires source_note")

        review_status = item.get("review_status")
        reviewed_at = item.get("reviewed_at")
        reviewed_by = item.get("reviewed_by")
        if review_status == "reviewed-by-human":
            parse_datetime(reviewed_at, f"{prefix}.reviewed_at", errors)
            if not isinstance(reviewed_by, str) or not reviewed_by.strip():
                errors.append(f"{prefix}.reviewed_by is required for reviewed-by-human")
        elif review_status == "needs-review":
            if reviewed_at is not None or reviewed_by is not None:
                errors.append(f"{prefix}: needs-review items must keep reviewer fields null")
        else:
            errors.append(f"{prefix}.review_status is invalid")

        privacy_status = item.get("privacy_status")
        if privacy_status not in PRIVACY_STATUSES:
            errors.append(f"{prefix}.privacy_status is invalid")
        if privacy_status == "needs-review" and item.get("status") == "active":
            warnings.append(f"{prefix}: active item cannot be selected until privacy review is resolved")
        if privacy_status == "public-source" and source_url is None:
            warnings.append(f"{prefix}: public-source item has no source URL")

        status = item.get("status")
        if status in stats:
            stats[status] += 1
        else:
            errors.append(f"{prefix}.status must be active, used, or archived")

        used_ids = item.get("used_in_external_ids")
        if not isinstance(used_ids, list):
            errors.append(f"{prefix}.used_in_external_ids must be an array")
        else:
            if len(used_ids) != len(set(used_ids)):
                errors.append(f"{prefix}.used_in_external_ids contains duplicates")
            for external_id in used_ids:
                if not isinstance(external_id, str) or not EXTERNAL_ID_RE.fullmatch(external_id):
                    errors.append(f"{prefix}: invalid external ID {external_id!r}")
            if status == "used" and not used_ids:
                warnings.append(f"{prefix}: status is used but no external IDs are recorded")

        tags = item.get("tags")
        if not isinstance(tags, list):
            errors.append(f"{prefix}.tags must be an array")
        elif len(tags) != len(set(tags)):
            errors.append(f"{prefix}.tags contains duplicates")
        elif any(not isinstance(tag, str) or not tag.strip() for tag in tags):
            errors.append(f"{prefix}.tags must contain non-empty strings")

    for idea_id, count in Counter(idea_ids).items():
        if count > 1:
            errors.append(f"duplicate idea_id appears {count} times: {idea_id!r}")
    for title, count in Counter(normalized_titles).items():
        if count > 1:
            errors.append(f"duplicate normalized title appears {count} times: {title!r}")

    return errors, warnings, stats


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: validate_idea_inbox.py PATH_TO_IDEA_INBOX_JSON", file=sys.stderr)
        return 2

    path = Path(sys.argv[1]).expanduser().resolve()
    errors, warnings, stats = validate(path)
    if errors:
        print(f"INVALID: {path}")
        for error in errors:
            print(f"  ERROR: {error}")
    else:
        print(f"VALID: {path}")
        print(
            "  " + " ".join(f"{key}={value}" for key, value in stats.items())
        )
    for warning in warnings:
        print(f"  WARNING: {warning}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
