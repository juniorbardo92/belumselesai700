# Idea source policy

## Purpose

An Idea Inbox stores reusable topic seeds for Ruang Kalyanamitra. It is a planning input, not a factual database, doctrinal source list, content pack, or publishing queue.

Every item must use `usage=inspiration-only`. When an idea later becomes a draft, factual and Dharma claims still require their own evidence under `dharma-policy.md`.

## Accepted source types

- `audience-question`: an anonymized question or recurring confusion from the audience;
- `community-observation`: a summarized pattern observed in a community;
- `internal-note`: an idea written by the user or editorial team;
- `content-performance`: a lesson from the account's own content results;
- `buddhist-calendar`: a possible seasonal topic that still needs date and tradition verification;
- `scripture-topic`: a topic seed, not a quotation or verified locator;
- `teacher-article`: an article proposed for later item-level review;
- `social-trend`: a possible trend that must move through `RISET_VIRAL` before time-sensitive use;
- `current-event`: a current event that must move through `RISET_VIRAL` before time-sensitive use;
- `other`: use only when none of the specific types fit, and explain it in `source_note`.

## Collection rules

- Summarize the idea in fresh language. Do not store full articles, transcripts, copyrighted posts, or long quotations.
- Keep a URL when one exists, but never invent one. A null URL is allowed for user-owned notes or anonymized audience input.
- Remove names, phone numbers, usernames, locations, and details that could identify a private person unless that person explicitly approved public use.
- Do not store raw private chats. Record only the generalized question or pattern and use `privacy_status=anonymized-private-input`.
- Use `privacy_status=needs-review` when safe reuse is uncertain. Such an item cannot be selected for production.
- Do not silently mark an item `reviewed-by-human`. That status requires the actual reviewer and review time.

## Normalization and deduplication

Before adding an item:

1. compare its central audience problem, not only its title;
2. merge duplicate observations into the older active item when meaning is materially the same;
3. preserve the clearest title and summary;
4. update tags, priority, source note, and source date when new evidence adds value;
5. create a separate item only when the audience problem or intended teaching angle is genuinely different.

Never delete an item merely because it was used. Change `status` to `used` and record known content external IDs in `used_in_external_ids`. Use `archived` for ideas that are obsolete or no longer suitable.

## Priority

Priority is an editorial input, not a virality prediction:

| Value | Meaning |
|---:|---|
| 5 | Repeated, urgent, highly relevant audience problem |
| 4 | Strong and clearly relevant topic |
| 3 | Useful supporting topic |
| 2 | Weak, narrow, or insufficiently developed |
| 1 | Parking lot; retain but do not prioritize |

## Time-sensitive routing

An Idea Inbox may record a time-sensitive seed, but it cannot validate that the topic is currently active. Before production, route every active item with `time_sensitive=true` or source type `social-trend`/`current-event` through `RISET_VIRAL`.

## Selection for production

Select only items that satisfy all of these conditions:

- `status=active`;
- `privacy_status` is not `needs-review`;
- the item is not a duplicate of a completed or planned thread;
- any time-sensitive seed has a separate valid Viral Research candidate;
- the idea can be connected naturally to a sourced Dharma lens without exploiting a person or event.

Retain the Idea Inbox file for planning history. Do not upload it to Content OS or the bot importer.
