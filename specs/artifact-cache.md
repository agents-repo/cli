# Artifact cache (1.0.0)

Normative rules for on-disk caching of registry ZIP artifacts downloaded during install,
update, remove, ci, and doctor flows.

## Normative language

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are to be interpreted as described in
RFC 2119.

## Purpose

Repeated downloads of the same artifact bytes SHOULD be avoided by storing verified ZIP payloads
under the global agents-repo home directory. Cache behavior MUST NOT weaken integrity guarantees
from [`cli-protocol.md`](cli-protocol.md).

## Cache root

The artifact cache root MUST be:

```text
{agentsRepoHome}/cache/
```

where `agentsRepoHome` is the resolved global home directory (default `~/.agents-repo/`, override
with `AGENTS_REPO_HOME`). See [`config-schema.md`](config-schema.md#global-home).

## Content layout (npm-style)

Verified artifact bytes MUST be stored as content-addressed blobs using SHA-256 sharding aligned
with npm `@npmcli/cacache` content stores (algorithm name `sha256` instead of `sha512`):

```text
cache/content-v2/sha256/<first-two-hex>/<remaining-62-hex>
```

- The digest MUST be the bare lowercase SHA-256 hex from the manifest entry or lock slot
  (`integrity` without the `sha256-` prefix).
- `<first-two-hex>` MUST be the first two characters of the digest.
- `<remaining-62-hex>` MUST be the remaining 62 characters (64-character digest total).

Tooling MUST NOT require a separate index file for MVP; callers supply the expected digest before
download.

## Disable and bypass

| Control | Effect |
| --- | --- |
| `AGENTS_REPO_NO_CACHE` | Non-empty value disables artifact cache read and write. |
| `--prefer-online` | Skip cache read; network fetch; write after verify unless NO_CACHE. |

## Read-through download

When cache is enabled and `--prefer-online` is not set:

1. Resolve the content blob path from the expected SHA-256 hex.
2. If the blob exists, read bytes and verify SHA-256 once against the expected digest.
   - On match, return bytes without network fetch.
   - On mismatch, delete the blob and continue to step 3.
3. Fetch artifact bytes from the registry URL. Transient `registry_fetch_error`
   failures (including HTTP 522) MUST be retried up to 3 attempts, with backoff
   of 2s then 4s between failures. Abort (`AbortError` or an aborted `signal`)
   MUST NOT be retried. Tooling MUST NOT retry SHA-256 verification, ZIP security
   scan, lock drift, or schema errors as fetch failures.
4. Verify SHA-256 once against the expected digest.
5. If cache writes are allowed, atomically write the blob (temporary file in the same directory,
   then rename).

When `--prefer-online` is set and cache is not fully disabled, steps 1–2 MUST be skipped; steps
3–5 apply.

When `AGENTS_REPO_NO_CACHE` is set, tooling MUST perform steps 3–4 only (no cache I/O).

## Integrity

SHA-256 verification MUST occur exactly once per successful download path inside the artifact
download layer. Application code MUST NOT repeat verification after `downloadArtifact` returns.

## Dry-run

- `install` / `update` with `--dry-run` MUST NOT download artifacts (per `cli-protocol.md`); no
  cache writes occur.
- Commands that download during `--dry-run` (for example `remove --dry-run`) MAY read and write
  the cache unless disabled by `AGENTS_REPO_NO_CACHE` or `--prefer-online` read bypass.

## Concurrency

Parallel CLI processes MAY race on the same blob path; behavior is best-effort for MVP.

## Cross-references

- [`cli-protocol.md`](cli-protocol.md) — install pipeline steps 8–9
- [`command-contracts.md`](command-contracts.md) — global flags and environment overrides
- [`config-schema.md`](config-schema.md) — global home
