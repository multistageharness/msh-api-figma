# Caching in `msh-api-figma/v100/packages/py`

**Verified: 2026-08-11.** See [Verification method](#7-verification-date-and-method) for how every
claim below was checked.

---

## 1. Current state

**Nothing in this workspace caches anything, and the recommended action for every existing code
path is to add no cache.**

`aiocache` was declared as a production dependency in two packages — `figma-comments` and
`figma-projects` — and imported by **zero lines of code**. It was removed by the
`drop-aiocache-dependency-20260811-l4t0u8wojc8d` plan, which deleted four manifest lines and
changed no Python file:

| File | Declaration removed |
| --- | --- |
| `comments/pyproject.toml:36` | `aiocache = "^0.12.2"` |
| `comments/requirements.txt:9` | `aiocache>=0.12.2,<1.0.0` |
| `projects/pyproject.toml:32` | `aiocache = "^0.12.0"` |
| `projects/requirements.txt:9` | `aiocache>=0.12.0,<1.0.0` |

The only `cache`-named object in live code is `_sdk_cache` in
`components/src/figma_components/server.py:93` — a plain `Dict[str, FigmaComponentsSDK]` used to
reuse SDK instances per token. It is an object pool, not a response cache, and involves no
caching library.

This document exists so that the next person who needs caching reaches for a current, maintained,
correctly-placed tool instead of re-adding the one that was just removed.

## 2. Why not just re-add `aiocache`

Two reasons, and the second generalizes.

**It was chosen once and never used.** A dependency that sat in two manifests for the life of the
packages without a single import is evidence that the need was speculative, not measured. Adding
it back reproduces the original mistake.

**It caches at the wrong altitude.** `aiocache` is a decorator-plus-backend framework that sits
*above* the HTTP layer. It stores whatever a function returned, under a TTL you guessed, and knows
nothing about `Cache-Control`, `ETag`, or `If-None-Match`. For an API client that is the wrong
place to cache: the HTTP protocol already carries freshness semantics, and a decorator cache
throws them away and substitutes a number someone picked.

There is a second, concrete cost specific to these packages. Both clients route every request
through a rate limiter and `tenacity` retries (`comments/.../client.py:277`,
`projects/.../client.py:179`). A decorator cache on an SDK method sits *above* that machinery and
bypasses the rate limiter's accounting entirely — which looks like a feature until a burst of
cache misses arrives all at once and the limiter has no record of the traffic it was supposed to
be shaping.

## 3. The option matrix

Pick by use case. Every row's first question is whether you need a cache at all.

| Use case | Recommended | Why over `aiocache` |
| --- | --- | --- |
| **Nothing needs caching** *(default)* | none | No dependency, no staleness, no invalidation surface. A cache inside an SDK is invisible to the caller, who then cannot reason about freshness. |
| Memoize a pure, **synchronous** computation | stdlib `functools.cache` / `functools.lru_cache`; `cachetools` (`TTLCache`, `LRUCache`, `LFUCache`) when you need a size or TTL policy | The stdlib costs nothing to add and nothing to maintain. `aiocache` is an async framework; using it to memoize pure computation buys a dependency in exchange for nothing. |
| Memoize an **`async def`** in-process | `async-lru` (`@alru_cache`) — the direct async analogue of `lru_cache`; `cashews` when a decorator cache genuinely needs multiple backends, locking, or rate-limiting features | `cashews` is the closest like-for-like to `aiocache`'s decorator-plus-backend model and is the actively maintained option in that niche. |
| Cache **HTTP responses** from the Figma API | `hishel` — an httpx-native caching transport | The right altitude. It implements the HTTP caching specification (RFC 9111) rather than guessing a TTL, sits *below* the rate limiter and retries so it composes with them, and changes no method signature in `sdk.py` or `cli.py`. |
| Share a cache **across processes or instances** | `redis-py`'s `redis.asyncio` client used directly; `diskcache` when the need is persistence across CLI runs rather than sharing | `aiocache` is a thin abstraction over these same backends. Using the maintained client directly keeps cache semantics visible at the call site instead of hidden behind a decorator. |

### When NOT to use each

- **No cache (the default) — when not to:** when a measured, reproducible cost exists (a profiled
  hot path, a documented rate-limit ceiling being hit, a user-visible latency budget being missed).
  "It might be slow" is not that measurement.
- **`functools` / `cachetools` — when not to:** never on an `async def` (see the trap below), never
  on a function whose arguments are unhashable, and never on anything whose correctness depends on
  freshness — `functools.lru_cache` has no TTL at all and will hold a value for the process
  lifetime.
- **`async-lru` / `cashews` — when not to:** when the thing you are caching is an HTTP response.
  Cache it at the transport layer instead, where the protocol's own freshness rules apply. Reach
  for `cashews` over `async-lru` only if you actually need its backends or locking; otherwise it is
  a heavier answer than the question.
- **`hishel` — when not to:** when the endpoint sends no usable freshness information and you would
  have to force a TTL anyway (see the unverified header note in §4), or when the data must never be
  stale — mutations especially. A caching transport also makes "did this request hit the network?"
  a harder question during debugging.
- **`redis.asyncio` / `diskcache` — when not to:** when a single process is involved. Cross-process
  caching adds an operational dependency, a serialization format, and a failure mode; do not take
  those on to speed up one CLI invocation. `diskcache` in particular has had no release since
  **2023-08-31** — treat it as stable-but-quiet and verify it still suits you before adopting.

### Two traps worth stating outright

**Never put `functools.lru_cache` on an `async def`.** It caches the *coroutine object*, which can
only be awaited once. The second cache hit raises `RuntimeError: cannot reuse already awaited
coroutine`. This is the single most common bug in this area, and it is precisely why `async-lru`
exists.

**Do not use `aioredis`.** It was merged into `redis-py` and its repository is now
`aio-libs-abandoned/aioredis-py` with GitHub's `archived` flag set to `true`; its last PyPI release
was **2.0.1 on 2021-12-27**. The successor is `redis.asyncio`, shipped inside `redis-py` itself
(verified: the `redis/asyncio/` package exists in the `redis/redis-py` source tree). Anyone
arriving from older guidance needs to see this.

### Verified library status

| Library | Latest version | Released | Requires Python | Newest version installable on 3.9 | on 3.8 |
| --- | --- | --- | --- | --- | --- |
| `cachetools` | 7.1.7 | 2026-08-01 | `>=3.10` | 6.2.6 (2026-01-27) | 5.5.2 (2025-02-20) |
| `async-lru` | 2.3.0 | 2026-03-19 | `>=3.10` | 2.0.5 (2025-03-16) | 2.0.4 (2023-07-27) |
| `cashews` | 7.5.0 | 2026-03-02 | `>=3.10` | 7.4.4 (2025-12-06) | 7.3.2 (2024-09-30) |
| `hishel` | 1.3.1 | 2026-08-10 | `>=3.10` | 1.1.8 (2026-01-11) | 0.0.33 (2024-10-04) |
| `redis` | 8.1.0 | 2026-07-30 | `>=3.10` | 7.0.1 (2025-10-27) | 6.1.1 (2025-06-02) |
| `diskcache` | 5.6.3 | 2023-08-31 | `>=3` | 5.6.3 | 5.6.3 |

**Read the last two columns before adopting anything.** `figma-comments` declares
`python = "^3.8"` and `figma-projects` declares `python = ">=3.9,<3.12"`. Every recommendation
except `diskcache` now requires Python **3.10 or newer** at its latest version, so under the
packages' *declared* floors you would install an older release than the one in the "Latest" column.
Two honest ways out, in preference order: raise the packages' Python floors to match reality (3.8
and 3.9 are both past end-of-life), or pin the older version and accept it. Do not adopt a library
on the strength of its newest release and then silently install a two-year-old one.

Capability claims, each verified against source rather than reputation:

- `async-lru` exports `alru_cache` — confirmed in its `async_lru/__init__.py` `__all__`.
- `cashews` provides an async decorator cache over multiple backends including in-memory, Redis,
  and disk — confirmed from its PyPI project description.
- `hishel` is RFC 9111-compliant and ships first-class httpx integration: `hishel.httpx` exports
  `AsyncCacheTransport` (a subclass of `httpx.AsyncBaseTransport`) and `AsyncCacheClient` (a
  subclass of `httpx.AsyncClient`), and its state machine includes a `NeedRevalidation` state.
  Confirmed from the `hishel` source tree. Note the httpx integration requires the extra:
  `hishel[httpx]`.
- `redis-py` ships `redis.asyncio` — confirmed: `redis/asyncio/` exists in the `redis/redis-py`
  source tree.

## 4. Figma endpoint volatility

A single blanket TTL is wrong across these resources. Cache decisions have to be made per endpoint
class.

| Resource | Churn | Guidance |
| --- | --- | --- |
| Comment listings | Continuous | Do not cache, or seconds at most. This is the primary subject of `figma-comments`; a stale comment list is the failure mode users notice first. |
| Comment create / delete / resolve | Mutating | Never cached. Must invalidate the listing for that file. |
| File metadata (`GET /v1/files/:key`) | Moderate | The response carries a `version` field (documented as file metadata alongside `name`, `lastModified`, `thumbnailUrl`, `editorType`, `linkAccess`). Prefer cheap change detection against `version` over a fixed TTL. |
| Team and project listings | Low | Minutes are defensible; these change on human timescales. |
| Image render results | Special — hard expiry | Rendered image assets **expire after 30 days**, and image *fill* URLs expire after **no more than 14 days**, per Figma's documentation. Caching a response past URL expiry produces a **broken link, not stale data**. Bound any TTL well below the URL lifetime. |

> **UNVERIFIED — HTTP cache headers.** Figma's REST API documentation contains **no mention of
> `ETag`, `If-None-Match`, or `Cache-Control`** on its responses (checked 2026-08-11 against
> `developers.figma.com/docs/rest-api/` and its file-endpoints page). This materially qualifies the
> `hishel` recommendation in §3: `hishel` correctly implements RFC 9111, but a spec-compliant cache
> can only revalidate if the *server* sends validators. **Before adopting `hishel`, inspect actual
> Figma response headers** for `ETag` / `Cache-Control`. If they are absent, `hishel` falls back to
> forced/heuristic TTL behaviour and its main advantage over a decorator cache — honouring the
> protocol's own freshness semantics — does not apply, though it keeps the altitude advantage of
> sitting below the rate limiter. The `version`-field and image-expiry rows above **are** confirmed
> against current documentation.

## 5. HTTP-layer caching: where it would go

> ## ⚠️ NOT IMPLEMENTED
> Nothing in this section is wired in. No manifest gains a dependency from this document. It exists
> so the size of the change is known before anyone commits to it.

### 5.1 The two injection points

Both packages construct exactly one `httpx.AsyncClient`, in `client.py`. Neither `sdk.py` nor
`cli.py` in either package constructs or configures one — verified by grep — which is what makes a
transport swap signature-neutral for callers.

**Anchors re-confirmed 2026-08-11** (these had drifted from the plan's baseline; the numbers below
are current):

| | `figma-comments` | `figma-projects` |
| --- | --- | --- |
| File | `comments/src/figma_comments/core/client.py` | `projects/src/figma_projects/client.py` |
| Client class | `FigmaCommentsClient` — line 147 | `FigmaProjectsClient` — line 76 |
| `__init__` | line 156 | line 79 |
| Rate limiter | `TokenBucketRateLimiter` — line 110 | `RateLimiter` — line 40 |
| `httpx.AsyncClient(...)` | line 206 — **eager**, in `__init__` | line 146 — **lazy**, in `_ensure_client()` (line 138) |
| Timeout argument | `timeout=timeout` — line 209 | `timeout=httpx.Timeout(self.timeout)` — line 148 |
| Close | line 233 | line 153 — sets `self._client = None` |
| Requests issued | line 315 | line 217 |
| `tenacity` retry | `@retry` — line 277 | `@retry` — line 179 |

**The eager-versus-lazy difference is the substantive finding, not the line numbers.**

In `figma-comments` the client is built once in `__init__`, so a transport argument is resolved
exactly once, at construction. A single line changes.

In `figma-projects` the client is built lazily inside `_ensure_client()`, and `close()` resets
`self._client` to `None` — so `_ensure_client()` runs again on the next request after a close. A
transport must therefore be **stored on the instance and re-applied on every rebuild**, not
resolved once. A transport captured only in `__init__`'s local scope, or a cache object whose
lifetime is tied to a single `AsyncClient`, will silently stop caching after the first
close/reopen cycle. That is the bug this note exists to prevent.

### 5.2 Sketch

```python
# figma-comments — client.py, eager construction in __init__ (~line 206)
def __init__(self, ..., cache_transport: httpx.AsyncBaseTransport | None = None) -> None:
    ...
    self._client = httpx.AsyncClient(
        base_url=self.BASE_URL,
        headers=headers,
        timeout=timeout,
        verify=self._verify,
        transport=cache_transport,     # None -> httpx default, i.e. no caching
    )

# figma-projects — client.py, lazy construction (~line 146)
def __init__(self, ..., cache_transport: httpx.AsyncBaseTransport | None = None) -> None:
    ...
    self._cache_transport = cache_transport      # MUST persist across close()/reopen

async def _ensure_client(self) -> None:
    if self._client is None:
        self._client = httpx.AsyncClient(
            headers=headers,
            timeout=httpx.Timeout(self.timeout),
            limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
            verify=self._verify,
            transport=self._cache_transport,
        )

# Caller opts in explicitly; nothing changes for anyone who does not.
import hishel                                    # requires hishel[httpx]
from hishel.httpx import AsyncCacheTransport
client = FigmaProjectsClient(
    api_token,
    cache_transport=AsyncCacheTransport(next_transport=httpx.AsyncHTTPTransport()),
)
```

**Public-signature impact: one optional keyword argument per client class, defaulting to `None`,
meaning no caching.** No existing caller changes. `sdk.py` and `cli.py` need touching only if the
option is to be exposed further up; the transport swap itself does not require it.

Placement matters and is the whole point: the caching transport sits **below** the rate limiter and
`tenacity` retries, so a cache hit returns before the network call while the limiter and retry
policy remain in charge of everything that does reach the network. A decorator cache on an SDK
method would sit above both and bypass them.

### 5.3 The invalidation requirement

Both packages expose mutating operations — creating, deleting, and resolving comments; modifying
projects. **Any adopted cache must guarantee that a caller never reads its own stale write.** A
mutation must invalidate the cached listings it affects, and that path must be documented and
tested before the cache ships.

A cache without a documented invalidation path is not a performance improvement. It is a bug
waiting on a schedule.

## 6. Preventing phantom dependencies

`aiocache` was a *phantom dependency*: declared in a manifest, imported by nothing. The workspace
now has a check for that class of drift:

```bash
./scripts/check-phantom-deps.sh
```

It compares production dependency names declared in each package's `pyproject.toml` against the
top-level modules actually imported under that package's source root, and reports the difference.

**Its non-zero exit on the current tree is expected and correct.** It reports two known findings,
both in `figma-comments`, both deliberately left unfixed by the removal plan because fixing them
changes what `pip install figma-comments` resolves — a package-owner decision:

- **`fastapi`** — declared at `comments/pyproject.toml:34` and `comments/requirements.txt:7`,
  imported nowhere.
- **`uvicorn`** — declared at `comments/pyproject.toml:35` and `comments/requirements.txt:8`,
  imported nowhere.

`figma-comments` is the only package under `msh-api-figma/v100/packages/py/` with no `server.py`; its seven
siblings all have one. The server dependencies came from the shared package template; the server
never did.

Both findings are recorded in the plan's `findings.jsonl` with status `open`. There is no CI in
this workspace to wire the check into — the only workflow files live under `.archives/` — so the
non-zero exit exists so that it *can* gate a future pipeline. If you fix the two findings above,
the check goes green on its own; do not silence it with an exception list.

The distribution-name-to-import-name mapping table (for cases like `python-dateutil` → `dateutil`)
lives in the script's header, which is also where new entries go.

## 7. Verification date and method

**Verified 2026-08-11.** Nothing in this document is stated from memory.

- **Library versions, release dates, and `requires_python` floors:** queried live from the PyPI
  JSON API (`https://pypi.org/pypi/<name>/json`) for `cachetools`, `async-lru`, `cashews`,
  `hishel`, `redis`, and `diskcache`. The per-Python-version columns were computed by walking every
  non-yanked, non-prerelease release of each project and selecting the newest whose
  `requires_python` specifier admits 3.8 and 3.9 respectively.
- **Capability claims:** read from the projects' own source trees via the GitHub contents API —
  `async_lru/__init__.py` for `alru_cache`, `src/hishel/httpx.py` and `src/hishel/_async_httpx.py`
  for the transport class names and their base classes, and `redis/asyncio/` for `redis.asyncio`.
  `cashews`' backend list came from its PyPI project description.
- **`aioredis` status:** GitHub API for `aio-libs/aioredis-py`, which resolves to
  `aio-libs-abandoned/aioredis-py` with `"archived": true`; last PyPI release 2.0.1, 2021-12-27.
- **Figma API claims:** `developers.figma.com/docs/rest-api/` and its file-endpoints page. The
  image-expiry and `version`-field claims are confirmed there. The absence of documented `ETag` /
  `If-None-Match` / `Cache-Control` support is why §4 carries an explicit UNVERIFIED banner rather
  than a freshness claim.
- **Line-number anchors in §5:** re-read from the current files on 2026-08-11, not taken from the
  plan baseline — several had drifted.

Re-verify before acting on this document if significant time has passed. The failure that produced
`aiocache` was a dependency choice made once and never revisited.
