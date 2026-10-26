import json
import sys
from pathlib import Path
from urllib.parse import urlparse

VERSION = "0.2.1"

ALLOWED_TRADITIONS = {
    "THERAVADA",
    "MAHAYANA",
    "VAJRAYANA",
    "GENERAL_BUDDHISM",
}

ALLOWED_CLAIM_TYPES = {
    "DOCTRINAL",
    "SOURCE_METADATA",
    "TRANSLATOR_NOTE",
    "EDITORIAL",
    "PRACTICE",
    "SAFETY",
}

ALLOWED_CLAIM_STATUS = {
    "SUPPORTED",
    "UNSUPPORTED",
    "EDITORIAL",
}

ALLOWED_REVIEW_STATUS = {
    "APPROVED",
    "REVISION_REQUIRED",
    "REJECTED",
}

APPROVED_DOMAINS = {
    "THERAVADA": {
        "suttacentral.net",
    },
    "MAHAYANA": {
        "84000.co",
    },
    "VAJRAYANA": {
        "84000.co",
        "tergar.org",
        "samyeinstitute.org",
    },
    "GENERAL_BUDDHISM": {
        "suttacentral.net",
        "84000.co",
        "tergar.org",
        "samyeinstitute.org",
    },
}


def fail(errors):
    print(f"VALIDATOR_VERSION={VERSION}")
    print("VALIDATION=FAIL")
    for e in errors:
        print(" -", e)
    raise SystemExit(1)


def domain_of(url):
    try:
        domain = urlparse(url).netloc.lower()
        if domain.startswith("www."):
            domain = domain[4:]
        return domain
    except Exception:
        return ""


if len(sys.argv) != 2:
    print("Usage: validate_dharma_json.py FILE")
    raise SystemExit(2)

path = Path(sys.argv[1])

try:
    data = json.loads(path.read_text(encoding="utf-8"))
except Exception as e:
    fail([f"INVALID_JSON:{e}"])

errors = []
warnings = []

required = [
    "content_id",
    "tradition",
    "topic",
    "title",
    "sources",
    "claims",
    "thread",
    "review",
]

for field in required:
    if field not in data:
        errors.append(f"missing:{field}")

tradition = data.get("tradition")

if tradition not in ALLOWED_TRADITIONS:
    errors.append(f"invalid_tradition:{tradition}")

sources = data.get("sources", [])
claims = data.get("claims", [])
thread = data.get("thread", [])
review = data.get("review", {})

# -------------------------
# SOURCES
# -------------------------

if not isinstance(sources, list) or not sources:
    errors.append("no_sources")

verified_sources = []

allowed_domains = APPROVED_DOMAINS.get(tradition, set())

for i, source in enumerate(sources):

    url = source.get("url", "")
    verified = source.get("verified")

    if not source.get("name"):
        errors.append(f"source_{i}:missing_name")

    if not source.get("title"):
        errors.append(f"source_{i}:missing_title")

    if not url:
        errors.append(f"source_{i}:missing_url")
    else:
        domain = domain_of(url)

        if domain not in allowed_domains:
            warnings.append(
                f"source_{i}:unlisted_domain:{domain}"
            )

    if verified is True:
        verified_sources.append(i)

# -------------------------
# CLAIMS
# -------------------------

if not isinstance(claims, list) or not claims:
    errors.append("no_claims")

unsupported = []

for claim in claims:

    cid = claim.get("id", "UNKNOWN")
    ctype = claim.get("claim_type")
    status = claim.get("status")
    indexes = claim.get("source_indexes", [])

    if ctype not in ALLOWED_CLAIM_TYPES:
        errors.append(
            f"{cid}:invalid_claim_type:{ctype}"
        )

    if status not in ALLOWED_CLAIM_STATUS:
        errors.append(
            f"{cid}:invalid_claim_status:{status}"
        )

    if status == "SUPPORTED" and not indexes:
        errors.append(
            f"{cid}:supported_without_source"
        )

    if status == "EDITORIAL" and indexes:
        errors.append(
            f"{cid}:editorial_should_not_require_source"
        )

    if status == "UNSUPPORTED":
        unsupported.append(cid)

    for idx in indexes:

        if not isinstance(idx, int):
            errors.append(
                f"{cid}:invalid_source_index:{idx}"
            )
            continue

        if idx < 0 or idx >= len(sources):
            errors.append(
                f"{cid}:source_index_out_of_range:{idx}"
            )
            continue

        if sources[idx].get("verified") is not True:
            errors.append(
                f"{cid}:uses_unverified_source:{idx}"
            )

# -------------------------
# THREAD
# -------------------------

if not isinstance(thread, list):
    errors.append("thread_not_list")
else:

    if not 6 <= len(thread) <= 8:
        errors.append(
            f"thread_count:{len(thread)}"
        )

    numbers = []

    for post in thread:

        number = post.get("post")
        text = post.get("text", "")

        numbers.append(number)

        if not text or not text.strip():
            errors.append(
                f"post_{number}:empty_text"
            )

    expected = list(range(1, len(thread) + 1))

    if numbers != expected:
        errors.append(
            f"invalid_post_sequence:{numbers}"
        )

# -------------------------
# REVIEW
# -------------------------

status = review.get("status")

if status not in ALLOWED_REVIEW_STATUS:
    errors.append(
        f"invalid_review_status:{status}"
    )

if status == "APPROVED":

    if not verified_sources:
        errors.append(
            "approved_without_verified_source"
        )

    if review.get("source_verified") is not True:
        errors.append(
            "approved_without_source_verification"
        )

    if unsupported:
        errors.append(
            "approved_with_unsupported_claims"
        )

    review_unsupported = review.get(
        "unsupported_claims", []
    )

    if review_unsupported:
        errors.append(
            "approved_with_review_unsupported_claims"
        )

    if (
        tradition == "VAJRAYANA"
        and review.get("restricted_instruction_present") is True
    ):
        errors.append(
            "vajrayana_restricted_instruction_approved"
        )

    if review.get("public_practice_safe") is not True:
        errors.append(
            "approved_unsafe_public_practice"
        )


# -------------------------
# VAJRAYANA RESTRICTION CONSISTENCY
# -------------------------

restriction_warning = review.get(
    "vajrayana_restriction_warning", False
)

restricted_instruction = review.get(
    "restricted_instruction_present", False
)

if restricted_instruction and tradition != "VAJRAYANA":
    errors.append(
        "restricted_instruction_flag_outside_vajrayana"
    )

if restricted_instruction and not restriction_warning:
    errors.append(
        "restricted_instruction_without_warning"
    )

# -------------------------
# FINAL
# -------------------------

if warnings:
    print("WARNINGS:")
    for warning in warnings:
        print(" -", warning)

if warnings:
    print("WARNINGS:")
    for warning in warnings:
        print(" -", warning)

if errors:
    fail(errors)

print(f"VALIDATOR_VERSION={VERSION}")
print("VALIDATION=PASS")
print("CONTENT_ID=", data.get("content_id"))
print("TRADITION=", tradition)
print("POSTS=", len(thread))
print("SOURCES=", len(sources))
print("VERIFIED_SOURCES=", len(verified_sources))
print("CLAIMS=", len(claims))
print("UNSUPPORTED_CLAIMS=", len(unsupported))
print("REVIEW=", status)
