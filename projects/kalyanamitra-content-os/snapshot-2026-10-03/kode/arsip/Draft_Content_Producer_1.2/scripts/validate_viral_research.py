#!/usr/bin/env python3
"""Validate a Kalyanamitra Viral Research Pack without external calls."""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


EXACT_VALUES = {
    "schema_version": "kalyanamitra-viral-research.v1",
    "region": "Indonesia",
    "platform": "threads",
    "language": "id-ID",
    "timezone": "Asia/Jakarta",
    "human_review_required": True,
}

RESEARCH_ID_RE = re.compile(r"^rk-viral-(\d{8})-(\d{8})$")
TREND_ID_RE = re.compile(r"^trend-[a-z0-9][a-z0-9-]{2,63}$")
SOURCE_ID_RE = re.compile(r"^trend-src-[a-z0-9][a-z0-9-]{2,63}$")
POSITIVE_COMPONENTS = (
    "recency",
    "velocity",
    "audience_fit",
    "dharma_bridge",
    "source_quality",
    "novelty",
)
NULL_URL_TYPES = {"threads-insights", "audience-signal", "user-provided"}
SOURCE_TYPES = {
    "threads-topic",
    "threads-insights",
    "google-trends",
    "official-newsroom",
    "official-agency",
    "primary-reporting",
    "audience-signal",
    "creator-observation",
    "user-provided",
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
    if not isinstance(value, str):
        errors.append(f"{label}: expected ISO date string")
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        errors.append(f"{label}: invalid ISO date {value!r}")
        return None


def parse_compact_date(value: str) -> date | None:
    try:
        return datetime.strptime(value, "%Y%m%d").date()
    except ValueError:
        return None


def valid_http_url(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def expected_score(components: dict[str, Any], label: str, errors: list[str]) -> int | None:
    values: dict[str, int] = {}
    for field in POSITIVE_COMPONENTS:
        value = components.get(field)
        if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= 5:
            errors.append(f"{label}.{field} must be an integer from 0 to 5")
        else:
            values[field] = value
    risk = components.get("risk_penalty")
    if not isinstance(risk, int) or isinstance(risk, bool) or not 0 <= risk <= 10:
        errors.append(f"{label}.risk_penalty must be an integer from 0 to 10")
    if len(values) != len(POSITIVE_COMPONENTS) or not isinstance(risk, int) or isinstance(risk, bool):
        return None
    return max(0, min(30, sum(values.values()) - risk))


def decision_for(score: int, risk_level: Any) -> str:
    if risk_level == "high" or score <= 13:
        return "reject"
    if score <= 19:
        return "monitor"
    return "use-now"


def optional_jsonschema_validation(
    data: dict[str, Any], skill_root: Path, errors: list[str], warnings: list[str]
) -> None:
    try:
        import jsonschema  # type: ignore
    except ImportError:
        warnings.append("jsonschema package not installed; deterministic checks still ran")
        return

    schema_path = skill_root / "references" / "viral-research.schema.json"
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
    stats = {"candidates": 0, "use-now": 0, "monitor": 0, "reject": 0, "sources": 0}

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

    flags = data.get("research_risk_flags")
    if not isinstance(flags, list) or "do-not-treat-as-fact" not in flags:
        errors.append("research_risk_flags must contain 'do-not-treat-as-fact'")

    generated = parse_datetime(data.get("generated_at"), "generated_at", errors)

    period = data.get("research_period")
    if not isinstance(period, dict):
        errors.append("research_period must be an object")
        period = {}
    period_start = parse_date(period.get("start_date"), "research_period.start_date", errors)
    period_end = parse_date(period.get("end_date"), "research_period.end_date", errors)
    if period_start and period_end and period_start > period_end:
        errors.append("research_period.start_date must not be after end_date")

    research_id = data.get("research_id")
    match = RESEARCH_ID_RE.fullmatch(research_id) if isinstance(research_id, str) else None
    if not match:
        errors.append("research_id must match rk-viral-YYYYMMDD-YYYYMMDD")
    elif period_start and period_end:
        id_start = parse_compact_date(match.group(1))
        id_end = parse_compact_date(match.group(2))
        if id_start != period_start or id_end != period_end:
            errors.append("research_id dates must match research_period")

    queries = data.get("query_summary")
    if not isinstance(queries, list) or not queries:
        errors.append("query_summary must be a non-empty array")
    elif len(queries) != len(set(queries)):
        errors.append("query_summary contains duplicates")

    candidates = data.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        errors.append("candidates must be a non-empty array")
        return errors, warnings, stats
    stats["candidates"] = len(candidates)

    trend_ids: list[str] = []
    all_source_ids: list[str] = []
    source_statuses: list[str] = []

    for index, candidate in enumerate(candidates):
        prefix = f"candidates[{index}]"
        if not isinstance(candidate, dict):
            errors.append(f"{prefix}: expected object")
            continue

        trend_id = candidate.get("trend_id")
        if not isinstance(trend_id, str) or not TREND_ID_RE.fullmatch(trend_id):
            errors.append(f"{prefix}.trend_id: invalid format")
        else:
            trend_ids.append(trend_id)

        for field in ("topic", "summary", "audience_problem", "possible_dharma_bridge"):
            value = candidate.get(field)
            if not isinstance(value, str) or not value.strip():
                errors.append(f"{prefix}.{field} must be non-empty")
        if candidate.get("tradition_hint") not in TRADITION_HINTS:
            errors.append(f"{prefix}.tradition_hint is invalid")

        observed = parse_datetime(candidate.get("observed_at"), f"{prefix}.observed_at", errors)
        expires = parse_datetime(candidate.get("expires_at"), f"{prefix}.expires_at", errors)
        if observed and expires and observed.tzinfo and expires.tzinfo:
            if expires <= observed:
                errors.append(f"{prefix}.expires_at must be later than observed_at")
            elif expires - observed > timedelta(days=14):
                warnings.append(f"{prefix}: expiry is more than 14 days after observation")
        if generated and observed and generated.tzinfo and observed.tzinfo and observed > generated:
            errors.append(f"{prefix}.observed_at must not be later than generated_at")

        if candidate.get("time_sensitive") is not True:
            errors.append(f"{prefix}.time_sensitive must be true")
        if candidate.get("usage") != "inspiration-only":
            errors.append(f"{prefix}.usage must be 'inspiration-only'")

        components = candidate.get("score_components")
        if not isinstance(components, dict):
            errors.append(f"{prefix}.score_components must be an object")
            score = None
        else:
            score = expected_score(components, f"{prefix}.score_components", errors)

        declared_score = candidate.get("viral_opportunity_score")
        if score is not None and declared_score != score:
            errors.append(
                f"{prefix}.viral_opportunity_score must equal recalculated score {score}"
            )

        risk_level = candidate.get("risk_level")
        if risk_level not in {"low", "medium", "high"}:
            errors.append(f"{prefix}.risk_level is invalid")
        risk_notes = candidate.get("risk_notes")
        if not isinstance(risk_notes, list):
            errors.append(f"{prefix}.risk_notes must be an array")
        elif len(risk_notes) != len(set(risk_notes)):
            errors.append(f"{prefix}.risk_notes contains duplicates")
        elif risk_level in {"medium", "high"} and not risk_notes:
            errors.append(f"{prefix}: medium/high risk requires at least one risk note")
        if score is not None and risk_level in {"low", "medium", "high"}:
            expected_decision = decision_for(score, risk_level)
            if candidate.get("decision") != expected_decision:
                errors.append(
                    f"{prefix}.decision must be {expected_decision!r} for score {score} and risk {risk_level}"
                )

        decision = candidate.get("decision")
        if decision in {"use-now", "monitor", "reject"}:
            stats[decision] += 1
        else:
            errors.append(f"{prefix}.decision is invalid")

        status = candidate.get("status")
        if status not in {"active", "expired"}:
            errors.append(f"{prefix}.status must be active or expired")
        if decision == "use-now" and status != "active":
            errors.append(f"{prefix}: use-now candidates must have status=active")
        if generated and expires and generated.tzinfo and expires.tzinfo:
            expected_status = "expired" if expires <= generated else "active"
            if status != expected_status:
                errors.append(
                    f"{prefix}.status must be {expected_status!r} at generated_at"
                )

        review_status = candidate.get("review_status")
        reviewed_at = candidate.get("reviewed_at")
        reviewed_by = candidate.get("reviewed_by")
        if review_status == "reviewed-by-human":
            parse_datetime(reviewed_at, f"{prefix}.reviewed_at", errors)
            if not isinstance(reviewed_by, str) or not reviewed_by.strip():
                errors.append(f"{prefix}.reviewed_by is required for reviewed-by-human")
        elif review_status == "needs-review":
            if reviewed_at is not None or reviewed_by is not None:
                errors.append(f"{prefix}: needs-review candidates must keep reviewer fields null")
        else:
            errors.append(f"{prefix}.review_status is invalid")

        sources = candidate.get("sources")
        if not isinstance(sources, list) or not sources:
            errors.append(f"{prefix}.sources must be a non-empty array")
            continue
        stats["sources"] += len(sources)

        candidate_privacy_needs_review = False
        for source_index, source in enumerate(sources):
            source_prefix = f"{prefix}.sources[{source_index}]"
            if not isinstance(source, dict):
                errors.append(f"{source_prefix}: expected object")
                continue

            source_id = source.get("source_id")
            if not isinstance(source_id, str) or not SOURCE_ID_RE.fullmatch(source_id):
                errors.append(f"{source_prefix}.source_id: invalid format")
            else:
                all_source_ids.append(source_id)

            source_type = source.get("source_type")
            if source_type not in SOURCE_TYPES:
                errors.append(f"{source_prefix}.source_type is invalid")
            url = source.get("url")
            if url is not None and not valid_http_url(url):
                errors.append(f"{source_prefix}.url must be an http(s) URL or null")
            if url is None and source_type not in NULL_URL_TYPES:
                errors.append(f"{source_prefix}: source type {source_type!r} requires a URL")

            source_observed = parse_datetime(
                source.get("observed_at"), f"{source_prefix}.observed_at", errors
            )
            if generated and source_observed and generated.tzinfo and source_observed.tzinfo:
                if source_observed > generated:
                    errors.append(f"{source_prefix}.observed_at must not be later than generated_at")

            observed_signal = source.get("observed_signal")
            if not isinstance(observed_signal, str) or not observed_signal.strip():
                errors.append(f"{source_prefix}.observed_signal must be non-empty")

            title = source.get("title")
            if not isinstance(title, str) or not title.strip():
                errors.append(f"{source_prefix}.title must be non-empty")
            metric_value = source.get("metric_value")
            if metric_value is not None and not isinstance(metric_value, str):
                errors.append(f"{source_prefix}.metric_value must be a string or null")

            source_status = source.get("source_status")
            if source_status not in {"directly-observed", "user-supplied-needs-review"}:
                errors.append(f"{source_prefix}.source_status is invalid")
            else:
                source_statuses.append(source_status)

            privacy_status = source.get("privacy_status")
            if privacy_status not in PRIVACY_STATUSES:
                errors.append(f"{source_prefix}.privacy_status is invalid")
            if privacy_status == "needs-review":
                candidate_privacy_needs_review = True

        if decision == "use-now" and candidate_privacy_needs_review:
            errors.append(f"{prefix}: use-now is not allowed while source privacy needs review")

        tags = candidate.get("tags")
        if not isinstance(tags, list):
            errors.append(f"{prefix}.tags must be an array")
        elif len(tags) != len(set(tags)):
            errors.append(f"{prefix}.tags contains duplicates")
        elif any(not isinstance(tag, str) or not tag.strip() for tag in tags):
            errors.append(f"{prefix}.tags must contain non-empty strings")

    for trend_id, count in Counter(trend_ids).items():
        if count > 1:
            errors.append(f"duplicate trend_id appears {count} times: {trend_id!r}")
    for source_id, count in Counter(all_source_ids).items():
        if count > 1:
            errors.append(f"duplicate source_id appears {count} times: {source_id!r}")

    research_mode = data.get("research_mode")
    statuses = set(source_statuses)
    if research_mode == "web-researched" and statuses - {"directly-observed"}:
        errors.append("web-researched mode cannot contain user-supplied-needs-review sources")
    elif research_mode == "user-supplied-only" and statuses - {"user-supplied-needs-review"}:
        errors.append("user-supplied-only mode cannot contain directly-observed sources")
    elif research_mode == "mixed" and statuses != {"directly-observed", "user-supplied-needs-review"}:
        errors.append("mixed mode requires both directly observed and user-supplied source records")
    elif research_mode not in {"web-researched", "user-supplied-only", "mixed"}:
        errors.append("research_mode is invalid")

    return errors, warnings, stats


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: validate_viral_research.py PATH_TO_VIRAL_RESEARCH_JSON", file=sys.stderr)
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
