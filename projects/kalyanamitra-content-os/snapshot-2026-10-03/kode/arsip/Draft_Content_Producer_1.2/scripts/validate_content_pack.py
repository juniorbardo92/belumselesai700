#!/usr/bin/env python3
"""Validate Kalyanamitra content-pack JSON without calling any external service."""

from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any


EXACT_VALUES = {
    "schema_version": "kalyanamitra-content-pack.v1",
    "namespace": "ruang-kalyanamitra",
    "brand": "Ruang Kalyanamitra",
    "brand_id": "brand-ruang-kalyanamitra",
    "platform": "threads",
    "language": "id-ID",
    "timezone": "Asia/Jakarta",
    "content_status": "draft",
    "publisher_mode": "draft-only",
    "automatic_publish": False,
    "human_approval_required": True,
}

EXTERNAL_ID_RE = re.compile(r"^rk-(\d{8})-(0[1-5])$")
SOURCE_ID_RE = re.compile(r"^src-[a-z0-9][a-z0-9-]{2,63}$")


def parse_date(value: Any, label: str, errors: list[str]) -> date | None:
    if not isinstance(value, str):
        errors.append(f"{label}: expected ISO date string")
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        errors.append(f"{label}: invalid ISO date {value!r}")
        return None


def parse_datetime(value: Any, label: str, errors: list[str]) -> None:
    if not isinstance(value, str):
        errors.append(f"{label}: expected ISO date-time string")
        return
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        errors.append(f"{label}: invalid ISO date-time {value!r}")


def load_provider_ids(skill_root: Path, warnings: list[str]) -> set[str]:
    path = skill_root / "references" / "source-providers.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return {
            item["provider_id"]
            for item in data.get("providers", [])
            if isinstance(item, dict) and isinstance(item.get("provider_id"), str)
        }
    except (OSError, json.JSONDecodeError, KeyError) as exc:
        warnings.append(f"provider registry unavailable: {exc}")
        return set()


def optional_jsonschema_validation(
    data: dict[str, Any], skill_root: Path, errors: list[str], warnings: list[str]
) -> None:
    try:
        import jsonschema  # type: ignore
    except ImportError:
        warnings.append("jsonschema package not installed; deterministic checks still ran")
        return

    schema_path = skill_root / "references" / "content-pack.schema.json"
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
    stats = {"drafts": 0, "posts": 0, "sources": 0, "dates": 0}

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
    approved_providers = load_provider_ids(skill_root, warnings)

    for field, expected in EXACT_VALUES.items():
        if data.get(field) != expected:
            errors.append(f"{field}: expected {expected!r}, got {data.get(field)!r}")

    package_flags = data.get("package_risk_flags")
    if not isinstance(package_flags, list) or "do-not-publish" not in package_flags:
        errors.append("package_risk_flags must contain 'do-not-publish'")

    parse_datetime(data.get("generated_at"), "generated_at", errors)

    part = data.get("part")
    if not isinstance(part, dict):
        errors.append("part must be an object")
        part = {}
    part_number = part.get("number")
    part_total = part.get("total")
    if not isinstance(part_number, int) or not isinstance(part_total, int):
        errors.append("part.number and part.total must be integers")
    elif not (1 <= part_number <= part_total):
        errors.append("part.number must be between 1 and part.total")

    period = data.get("period")
    if not isinstance(period, dict):
        errors.append("period must be an object")
        period = {}
    package_start = parse_date(period.get("start_date"), "period.start_date", errors)
    package_end = parse_date(period.get("end_date"), "period.end_date", errors)
    part_start = parse_date(part.get("start_date"), "part.start_date", errors)
    part_end = parse_date(part.get("end_date"), "part.end_date", errors)
    if package_start and package_end and package_start > package_end:
        errors.append("period.start_date must not be after period.end_date")
    if part_start and part_end and part_start > part_end:
        errors.append("part.start_date must not be after part.end_date")
    if package_start and package_end and part_start and part_end:
        if not (package_start <= part_start <= part_end <= package_end):
            errors.append("part date range must be inside package period")

    counts = data.get("expected_counts")
    if not isinstance(counts, dict):
        errors.append("expected_counts must be an object")
        counts = {}
    threads_per_day = counts.get("threads_per_day")
    posts_min = counts.get("posts_min_per_thread")
    posts_max = counts.get("posts_max_per_thread")
    if not isinstance(threads_per_day, int) or not 1 <= threads_per_day <= 5:
        errors.append("expected_counts.threads_per_day must be an integer from 1 to 5")
        threads_per_day = 0
    if not isinstance(posts_min, int) or not 6 <= posts_min <= 8:
        errors.append("expected_counts.posts_min_per_thread must be from 6 to 8")
        posts_min = 6
    if not isinstance(posts_max, int) or not 6 <= posts_max <= 8:
        errors.append("expected_counts.posts_max_per_thread must be from 6 to 8")
        posts_max = 8
    if posts_min > posts_max:
        errors.append("posts_min_per_thread must not exceed posts_max_per_thread")

    if package_start and package_end:
        actual_days = (package_end - package_start).days + 1
        if counts.get("days_total_package") != actual_days:
            errors.append(
                f"days_total_package must equal period length {actual_days}"
            )
        if threads_per_day and counts.get("drafts_total_package") != actual_days * threads_per_day:
            errors.append(
                "drafts_total_package must equal days_total_package × threads_per_day"
            )

    drafts = data.get("drafts")
    if not isinstance(drafts, list) or not drafts:
        errors.append("drafts must be a non-empty array")
        return errors, warnings, stats

    stats["drafts"] = len(drafts)
    if counts.get("drafts_in_this_part") != len(drafts):
        errors.append("drafts_in_this_part does not match the drafts array length")

    external_ids: set[str] = set()
    date_slots: set[tuple[str, int]] = set()
    drafts_by_date: defaultdict[str, list[int]] = defaultdict(list)

    for draft_index, draft in enumerate(drafts):
        prefix = f"drafts[{draft_index}]"
        if not isinstance(draft, dict):
            errors.append(f"{prefix}: expected object")
            continue

        external_id = draft.get("external_id")
        publish_date = draft.get("publish_date")
        slot = draft.get("slot")
        if not isinstance(external_id, str):
            errors.append(f"{prefix}.external_id: expected string")
        else:
            match = EXTERNAL_ID_RE.fullmatch(external_id)
            if not match:
                errors.append(f"{prefix}.external_id: invalid format {external_id!r}")
            else:
                expected_date = match.group(1)
                expected_slot = int(match.group(2))
                if isinstance(publish_date, str) and publish_date.replace("-", "") != expected_date:
                    errors.append(f"{prefix}.external_id date does not match publish_date")
                if isinstance(slot, int) and slot != expected_slot:
                    errors.append(f"{prefix}.external_id slot does not match slot")
            if external_id in external_ids:
                errors.append(f"{prefix}.external_id: duplicate {external_id!r}")
            external_ids.add(external_id)

        draft_date = parse_date(publish_date, f"{prefix}.publish_date", errors)
        if draft_date and part_start and part_end and not (part_start <= draft_date <= part_end):
            errors.append(f"{prefix}.publish_date is outside this part's date range")
        if not isinstance(slot, int) or not 1 <= slot <= 5:
            errors.append(f"{prefix}.slot must be an integer from 1 to 5")
        elif isinstance(publish_date, str):
            key = (publish_date, slot)
            if key in date_slots:
                errors.append(f"{prefix}: duplicate publish_date + slot {key}")
            date_slots.add(key)
            drafts_by_date[publish_date].append(slot)

        scope = draft.get("tradition_scope")
        covered = draft.get("traditions_covered")
        if not isinstance(covered, list) or not covered:
            errors.append(f"{prefix}.traditions_covered must be a non-empty array")
            covered = []
        if scope == "cross-tradition" and len(set(covered)) < 2:
            errors.append(f"{prefix}: cross-tradition content must cover at least two traditions")
        if scope in {"theravada", "mahayana", "vajrayana"} and scope not in covered:
            errors.append(f"{prefix}: tradition_scope must appear in traditions_covered")

        risk_flags = draft.get("risk_flags")
        if not isinstance(risk_flags, list):
            errors.append(f"{prefix}.risk_flags must be an array")
            risk_flags = []

        sources = draft.get("sources")
        if not isinstance(sources, list):
            errors.append(f"{prefix}.sources must be an array")
            sources = []
        stats["sources"] += len(sources)
        if not sources and "source-unverified" not in risk_flags:
            errors.append(f"{prefix}: no sources; add risk flag 'source-unverified'")

        source_ids: set[str] = set()
        human_verified_sources = 0
        for source_index, source in enumerate(sources):
            source_prefix = f"{prefix}.sources[{source_index}]"
            if not isinstance(source, dict):
                errors.append(f"{source_prefix}: expected object")
                continue
            source_id = source.get("source_id")
            if not isinstance(source_id, str) or not SOURCE_ID_RE.fullmatch(source_id):
                errors.append(f"{source_prefix}.source_id: invalid format")
            elif source_id in source_ids:
                errors.append(f"{source_prefix}.source_id: duplicate {source_id!r}")
            else:
                source_ids.add(source_id)

            provider_id = source.get("provider_id")
            status = source.get("verification_status")
            if approved_providers and provider_id not in approved_providers:
                warnings.append(f"{source_prefix}: provider {provider_id!r} is not in registry")
                if status == "provider-approved-needs-item-review":
                    errors.append(
                        f"{source_prefix}: unregistered provider cannot use provider-approved status"
                    )
            url = source.get("url")
            if not isinstance(url, str) or not url.startswith(("https://", "http://")):
                errors.append(f"{source_prefix}.url must be an HTTP(S) URL")
            if not isinstance(source.get("locator"), str) or not source.get("locator", "").strip():
                errors.append(f"{source_prefix}.locator must be non-empty")
            if not isinstance(source.get("claim_supported"), str) or not source.get("claim_supported", "").strip():
                errors.append(f"{source_prefix}.claim_supported must be non-empty")
            if status == "verified-by-human":
                human_verified_sources += 1
                if not source.get("checked_at") or not source.get("checked_by"):
                    errors.append(
                        f"{source_prefix}: verified-by-human requires checked_at and checked_by"
                    )

        if draft.get("source_review_status") == "verified-by-human":
            if not sources or human_verified_sources != len(sources):
                errors.append(
                    f"{prefix}: source_review_status verified-by-human requires every source to be human-verified"
                )

        posts = draft.get("posts")
        if not isinstance(posts, list):
            errors.append(f"{prefix}.posts must be an array")
            continue
        stats["posts"] += len(posts)
        if not posts_min <= len(posts) <= posts_max:
            errors.append(
                f"{prefix}.posts: expected {posts_min}–{posts_max} posts, got {len(posts)}"
            )
        sequences = [post.get("sequence") for post in posts if isinstance(post, dict)]
        if sequences != list(range(1, len(posts) + 1)):
            errors.append(f"{prefix}.posts sequences must be consecutive from 1")
        cta_indices: list[int] = []
        for post_index, post in enumerate(posts):
            post_prefix = f"{prefix}.posts[{post_index}]"
            if not isinstance(post, dict):
                errors.append(f"{post_prefix}: expected object")
                continue
            text = post.get("text")
            if not isinstance(text, str) or not text.strip():
                errors.append(f"{post_prefix}.text must be non-empty")
            elif len(text) > 500:
                errors.append(f"{post_prefix}.text exceeds 500 characters ({len(text)})")
            if post.get("role") == "cta":
                cta_indices.append(post_index)
            refs = post.get("source_ids")
            if not isinstance(refs, list):
                errors.append(f"{post_prefix}.source_ids must be an array")
            else:
                for ref in refs:
                    if ref not in source_ids:
                        errors.append(f"{post_prefix}: unknown source_id {ref!r}")

        if posts:
            first = posts[0] if isinstance(posts[0], dict) else {}
            if first.get("role") != "hook":
                errors.append(f"{prefix}: first post role must be 'hook'")
            if draft.get("selected_hook") != first.get("text"):
                errors.append(f"{prefix}: selected_hook must exactly match first post text")
        if len(cta_indices) > 1:
            errors.append(f"{prefix}: at most one CTA post is allowed")
        if cta_indices and cta_indices[0] != len(posts) - 1:
            errors.append(f"{prefix}: CTA must be the final post")

    stats["dates"] = len(drafts_by_date)
    if part_start and part_end and threads_per_day:
        current = part_start
        expected_slots = list(range(1, threads_per_day + 1))
        while current <= part_end:
            key = current.isoformat()
            actual_slots = sorted(drafts_by_date.get(key, []))
            if actual_slots != expected_slots:
                errors.append(
                    f"date {key}: expected slots {expected_slots}, got {actual_slots}"
                )
            current += timedelta(days=1)

    title_counts = Counter(
        draft.get("title") for draft in drafts if isinstance(draft, dict) and draft.get("title")
    )
    for title, count in title_counts.items():
        if count > 1:
            errors.append(f"duplicate title appears {count} times: {title!r}")

    if "cross-part-duplicate-check-pending" in package_flags:
        warnings.append("cross-part duplicate checking is still pending")

    return errors, warnings, stats


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("Usage: validate_content_pack.py FILE [FILE ...]", file=sys.stderr)
        return 2

    overall_ok = True
    for raw_path in argv[1:]:
        path = Path(raw_path).resolve()
        errors, warnings, stats = validate(path)
        status = "VALID" if not errors else "INVALID"
        print(f"{status}: {path}")
        print(
            f"  drafts={stats['drafts']} posts={stats['posts']} "
            f"sources={stats['sources']} dates={stats['dates']}"
        )
        for warning in warnings:
            print(f"  WARNING: {warning}")
        for error in errors:
            print(f"  ERROR: {error}")
        overall_ok = overall_ok and not errors

    return 0 if overall_ok else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
