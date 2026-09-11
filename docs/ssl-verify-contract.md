# SSL Verification Contract

**Status:** Normative for every package under `msh-api-figma/v100/packages/py/` that constructs an
`httpx.AsyncClient`.

Every httpx client in this tree exposes one uniform way to control TLS certificate verification:
a keyword-only `verify` parameter that defaults to verification **on**. This document fixes the
parameter's name, type, default, resolution order, environment variable, warning behavior, and
error cases, so that eight independently distributed packages end up with one API rather than
eight nearly-identical ones.

It is the descendant of a contract already deployed in the sibling downloader,
`msh-sdk-figma-downloader/v200/packages/figma-downloader-py/figma_downloader/config.py`, which
solves the same problem on `urllib`. Where the two differ, the difference is deliberate and
stated below.

---

## 1. Signature

Paste this fragment into each client's `__init__`, keyword-only where the existing signature
already has a bare `*`:

```python
verify: bool | str | ssl.SSLContext | None = None,
```

Modules that still declare `from __future__ import annotations` and use `Optional[...]`
elsewhere may write the annotation either way; the `X | Y` form is evaluated lazily under that
future import and works on every Python version these packages support.

The parameter is named `verify` — not `ssl_verify`, not `verify_ssl` — because it is forwarded
verbatim to `httpx.AsyncClient(verify=...)`. A caller who knows httpx already knows what it does.

Each client also exposes the resolved value read-only, so surfaces that build their own httpx
clients can reuse it instead of re-resolving (and warning twice), and so tests have a stable
public thing to assert on:

```python
@property
def verify(self) -> bool | str | ssl.SSLContext:
    """The resolved TLS verification setting handed to ``httpx.AsyncClient``."""
    return self._client_kwargs["verify"]
```

Two storage shapes, both valid, chosen by what the client already has:

- **`_client_kwargs["verify"]`** — for clients that already keep a kwargs dict, or that gain one
  cheaply. `figma_files` and `figma_components` do this.
- **`self._verify`**, set in `__init__` and passed as `verify=self._verify` at the construction
  site — for the other six, whose constructors build httpx arguments inline. Restructuring them
  into a kwargs dict would be a larger, riskier edit than the feature warrants.

Either way resolution happens exactly once in `__init__`, and `verify` returns the stored value.

## 2. The sentinel

**`None` means *unspecified*. It does not mean *off*.**

Without the sentinel, `verify: bool = True` cannot distinguish "the caller asked for
verification" from "the caller said nothing at all". Those two cases have to resolve differently:
silence must let `FIGMA_SSL_VERIFY` decide, while an explicit `verify=True` must override the
environment. A `True` default collapses them and makes the environment variable either useless
or dangerous. `None` is what makes the precedence order in §3 expressible at all.

## 3. Resolution order

Highest wins:

1. **Explicit argument** — any `verify` that is not `None`.
2. **Environment** — `FIGMA_SSL_VERIFY`, parsed per §4.
3. **Default** — `True`.

Resolution happens exactly once, at client construction time (in `__init__`), never per request.
The resolved value is stored and reused; see §7.

The source that won is one of `argument`, `env`, or `default`. It is named in the warning (§5).
The downloader's equivalent sources are `cli`, `config`, `env`, `default` — these packages have
no config file, and a CLI flag reaches the client as an ordinary argument, so `cli` and `config`
collapse into `argument`.

### The five cases

| # | Environment | Call | Resolved | Source | Warning |
| --- | --- | --- | --- | --- | --- |
| 1 | *clean* | `Client(api_key=k)` | `True` | `default` | none |
| 2 | *clean* | `Client(api_key=k, verify=False)` | `False` | `argument` | one |
| 3 | *clean* | `Client(api_key=k, verify="/etc/ssl/corp-ca.pem")` | `"/etc/ssl/corp-ca.pem"` | `argument` | none |
| 4 | `FIGMA_SSL_VERIFY=0` | `Client(api_key=k)` | `False` | `env` | one |
| 5 | `FIGMA_SSL_VERIFY=0` | `Client(api_key=k, verify=True)` | `True` | `argument` | none |

Case 5 is the point of the sentinel: **verification is never disabled implicitly.** An explicit
`verify=True` beats a hostile or stale environment.

## 4. Environment parsing

`FIGMA_SSL_VERIFY` is read from `os.environ` only when the argument is `None`. Its value is
stripped of surrounding whitespace and lowercased, then matched against this table — lifted from
the downloader's `_as_bool` (`figma_downloader/config.py:25`) so that an operator configuring
both tools configures them identically:

| Value (stripped, lowercased) | Resolves to |
| --- | --- |
| `false`, `0`, `no`, `off`, `` (empty) | `False` |
| `true`, `1`, `yes`, `on` | `True` |
| anything else | the **original, unmodified** string, treated as a CA-bundle path |

Two consequences worth stating out loud:

- **An empty value disables verification.** `export FIGMA_SSL_VERIFY=` resolves to `False`, and
  the warning in §5 fires. This is sharp, and it is deliberate: the downloader already behaves
  this way, and an operator who gets verification off in one Figma tool and on in the other is
  worse off than one who gets a consistent answer plus a warning.
- **The path fallback keeps the original string**, not the stripped/lowercased one, so a bundle
  at `/etc/ssl/Corp CA.pem` still resolves. Only the *matching* is normalized.

The downloader's `_as_bool` returns `True` for an unrecognized value; this contract returns the
value as a path instead. That is the one intentional divergence, and it is additive — every
string the downloader reads as a boolean is read the same way here.

`NODE_TLS_REJECT_UNAUTHORIZED` is **not** consulted. The downloader honors it because it is the
twin of a Node implementation; nothing in `msh-api-figma/v100/packages/py/` has that lineage.

## 5. Warning

When resolution yields `False`, emit exactly one warning at the point of resolution:

```
TLS certificate verification is DISABLED (from {source}).
```

where `{source}` is `argument` or `env`. (`default` can never produce `False`.)

**Channel:** `warnings.warn(...)` with the dedicated category `InsecureTransportWarning`, a
`UserWarning` subclass — *not* stderr. These packages are libraries. A library that writes to
stderr cannot be silenced by its consumer, cannot be captured by a test without redirecting file
descriptors, and cannot be routed into an application's logging. A dedicated warning category
gives consumers `warnings.filterwarnings("ignore", category=InsecureTransportWarning)` when they
have accepted the risk knowingly, and gives tests `pytest.warns(InsecureTransportWarning)`.

The downloader writes the same sentence to stderr
(`figma_downloader/cli.py:232`, prefixed `[figma-download] WARNING: `) because it is an
application with no consumer to filter it. The wording is kept identical minus the prefix so the
two tools are greppable together.

**Fires exactly once**, because resolution happens once per client construction. Repeated calls
to `start()` / `_ensure_client()` re-use the already-resolved value and must not warn again.

**What does not warn:** a caller-supplied `ssl.SSLContext` with `verify_mode == ssl.CERT_NONE`
disables verification just as thoroughly, and this contract stays silent about it. Constructing
such a context is an unambiguous, deliberate act by the caller; the library does not second-guess
a context object it was handed. Only the two forms it resolves itself — the argument `False` and
the environment variable — are warned about.

## 6. Errors

**Duplicate `verify`.** One package (`figma_components`) forwards `**httpx_kwargs` to the
constructor, so `verify` looks like it could arrive twice. **It cannot, and no hand-written check
is needed** — this was verified against the implementation, not assumed.

Adding `verify` as a named parameter is itself the guard. Python binds a `verify=` keyword to the
named parameter, so it never reaches `**httpx_kwargs`, and passing it twice is a syntax-level
error raised before the function body runs:

```
TypeError: FigmaComponentsClient() got multiple values for keyword argument 'verify'
```

An `if "verify" in httpx_kwargs: raise TypeError(...)` guard is therefore dead code. Do not write
one; it reads as though a reachable path exists. Do write the resolved key **after** the
`**httpx_kwargs` spread in the kwargs dict, so ordering cannot matter:

```python
client_kwargs = {
    "base_url": self.base_url,
    "timeout": timeout,
    "headers": headers,
    **httpx_kwargs,
    "verify": resolve_verify(verify),
}
```

**Bad CA-bundle path.** Not this contract's error to raise. `httpx` raises when the client is
constructed: `OSError: Could not find a suitable TLS CA certificate bundle, invalid path: ...`
on 0.27.x, `FileNotFoundError` (an `OSError` subclass) on 0.28.x. Do not pre-validate the path —
duplicating httpx's check would mean two different error messages for the same mistake, and a
race between the check and the use.

## 7. Reference implementation

The block below is the single source of truth. Copy it verbatim into each package (see §9 for
where it goes). It is self-contained: category, parser, and resolver in one contiguous region.

```python
"""SSL verification resolution.

Contract: msh-api-figma/v100/docs/ssl-verify-contract.md
"""
from __future__ import annotations

import os
import ssl
import warnings

FIGMA_SSL_VERIFY_ENV = "FIGMA_SSL_VERIFY"

_FALSE_VALUES = frozenset({"false", "0", "no", "off", ""})
_TRUE_VALUES = frozenset({"true", "1", "yes", "on"})


class InsecureTransportWarning(UserWarning):
    """Emitted when TLS certificate verification has been turned off."""


def _as_bool(value: str) -> bool | None:
    """Parse a boolean-ish string.

    Returns True or False for a recognized form, or None when the value is
    neither — in which case the caller treats it as a CA-bundle path.
    """
    normalized = value.strip().lower()
    if normalized in _FALSE_VALUES:
        return False
    if normalized in _TRUE_VALUES:
        return True
    return None


def resolve_verify(
    verify: bool | str | ssl.SSLContext | None,
) -> bool | str | ssl.SSLContext:
    """Resolve the effective httpx ``verify`` value.

    Precedence, highest wins:

    1. the explicit ``verify`` argument (anything that is not ``None``)
    2. the ``FIGMA_SSL_VERIFY`` environment variable
    3. ``True``

    ``None`` means *unspecified*, not *off*: it defers to the environment and
    then to ``True``. Passing ``verify=True`` explicitly forces verification on
    even when ``FIGMA_SSL_VERIFY=0`` is set.

    ``FIGMA_SSL_VERIFY`` accepts ``true/false``, ``1/0``, ``yes/no``, ``on/off``
    (case-insensitive, surrounding whitespace ignored); any other value is used
    as a path to a CA bundle.

    Emits exactly one :class:`InsecureTransportWarning` when the resolved value
    is ``False``. Never warns for a CA-bundle path or for ``True``.
    """
    if verify is not None:
        resolved: bool | str | ssl.SSLContext = verify
        source = "argument"
    else:
        raw = os.environ.get(FIGMA_SSL_VERIFY_ENV)
        if raw is None:
            resolved, source = True, "default"
        else:
            parsed = _as_bool(raw)
            resolved = raw if parsed is None else parsed
            source = "env"

    if resolved is False:
        warnings.warn(
            f"TLS certificate verification is DISABLED (from {source}).",
            InsecureTransportWarning,
            stacklevel=3,
        )

    return resolved
```

`stacklevel=3` attributes the warning to the code that constructed the client — frame 1 is
`resolve_verify`, frame 2 is `__init__`, frame 3 is the caller. Module-level callers (the FastAPI
servers, §10) get a shorter stack; `warnings` clamps rather than failing.

Note `resolved is False`, not `not resolved`. The only falsy value this function can produce from
the environment is `False` — an empty `FIGMA_SSL_VERIFY` is parsed to the boolean, never left as
`""`. An explicitly passed `verify=""` stays a string and is rejected by httpx as a missing CA
path, which is the correct error for it.

## 8. httpx version findings

All eight packages pin `httpx>=0.27.0,<1.0.0` (as `^0.27.0` in `pyproject.toml`, spelled out in
`requirements.txt`). As of 2026-08-11 that range admits exactly five releases: 0.27.0, 0.27.1,
0.27.2, 0.28.0, 0.28.1. The endpoints are **0.27.0** and **0.28.1**.

Both endpoints were probed by constructing a real `httpx.AsyncClient` under each — not by reading
changelogs — on CPython 3.12.13 / OpenSSL 3.5.7:

| `verify=` | 0.27.0 | 0.28.1 |
| --- | --- | --- |
| `True` | accepted — `CERT_REQUIRED`, `check_hostname=True` | accepted — `CERT_REQUIRED`, `check_hostname=True` |
| `False` | accepted — `CERT_NONE`, `check_hostname=False` | accepted — `CERT_NONE`, `check_hostname=False` |
| `str` CA-bundle path (valid) | accepted — `CERT_REQUIRED` | accepted — `CERT_REQUIRED`, **`DeprecationWarning`** |
| `str` path (missing file) | `OSError: Could not find a suitable TLS CA certificate bundle, invalid path: /nonexistent/ca-bundle.pem` | `FileNotFoundError: [Errno 2] No such file or directory` |
| `ssl.SSLContext` | accepted — honors the context's `verify_mode` | accepted — honors the context's `verify_mode` |

**The intersection is the full set**, so the annotation stays `bool | str | ssl.SSLContext | None`
with nothing narrowed and no pin change.

The one divergence is a deprecation, captured verbatim from 0.28.1:

```
DeprecationWarning: `verify=<str>` is deprecated. Use `verify=ssl.create_default_context(cafile=...)` or `verify=ssl.create_default_context(capath=...)` instead.
```

**`str` is kept in the public annotation and passed through unconverted.** It is accepted at both
endpoints, and it is the form `FIGMA_SSL_VERIFY=/path/to/ca.pem` naturally produces. Silently
rewriting a `str` into `ssl.create_default_context(cafile=...)` was considered and rejected: it
would guess `cafile` where the operator may have meant `capath` (a directory), it would replace
httpx's error messages with our own, and it would make behavior differ across the supported range
for no gain. Callers on 0.28.x who want the warning gone can build the context themselves and
pass it — which is exactly what httpx is asking for, and which this contract already supports.

Because the deprecation originates in httpx and not in our code, it is not suppressed. If httpx
1.0 removes `str` support, the pin's upper bound already excludes it and revisiting is a separate
change.

The constructed SSL context is reachable at both endpoints as
`client._transport._pool._ssl_context`, which is what makes the deep assertion test in §11
possible. It is private API and version-fragile; use it in exactly one test.

## 9. Where the helper goes, per package

| Package | Import name | Helper lands in | Client construction | Surfaces to thread |
| --- | --- | --- | --- | --- |
| `comments` | `figma_comments` | `core/client.py` — **no `utils.py`** | eager, in `__init__` | client, sdk, cli — **no `server.py`** |
| `components` | `figma_components` | `utils.py` | lazy, in `start()` | client, sdk, cli, server |
| `dev-resources` | `figma_dev_resources` | `utils.py` | lazy, in `start()` | client, sdk, cli, server |
| `files` | `figma_files` | `utils.py` | lazy, in `_ensure_client()` | client, sdk, cli, server |
| `library-analytics` | `figma_library_analytics` | `utils.py` | eager, in `__init__` | client, sdk, cli, server |
| `projects` | `figma_projects` | `utils.py` | lazy, in `start()` | client, sdk, cli, server |
| `variables` | `figma_variables` | `utils.py` | lazy, in `start()` | client, sdk, cli, server |
| `webhooks` | `figma_webhooks` | `utils.py` | lazy, in `start()` | client, sdk, cli, server |

Known exceptions, each of which has bitten someone already:

- **`figma_comments` has no `utils.py` and no `server.py`.** Its layout is
  `core/{client,service,models,exceptions}.py` and `interfaces/{sdk,cli}.py`. The helper goes at
  the top of `core/client.py`.
- **`figma_components` already accepts `**httpx_kwargs`** (`client.py:73`) and forwards it into
  `self._client_kwargs` (`client.py:109`). It is the only package that needs the duplicate-`verify`
  `TypeError` from §6.
- **Eager vs lazy is not a sequencing difference, it is a placement difference.** Either way,
  `resolve_verify()` is called in `__init__`. Eager clients pass the resolved value straight to
  the constructor a few lines later; lazy clients write it into the stored kwargs dict and the
  constructor picks it up on first use. In both cases the warning fires when the caller made the
  choice, not on first request, and fires once no matter how often the client starts.

**Client construction sites outside `client.py`.** `figma_files/cli.py` constructs bare
`httpx.AsyncClient()` instances to download rendered images (lines 250 and 313), and other
packages may do the same. These are outbound TLS connections too and must receive the same
resolved value. Grep each package for `httpx.AsyncClient(` before declaring it done — the client
module is the common case, not the only one.

## 10. Servers

The FastAPI servers resolve `verify` **once, at import/startup**, via `resolve_verify(None)`, and
pass the resolved value to every client they construct. One log line records the value and its
source.

The asymmetry with the API token is the point. The token is per-request because each caller
brings their own credential. Certificate verification is not per-request: a header or query
parameter that could turn it off would let any caller of the server disable TLS checking on the
server's own outbound connection to `api.figma.com` — a credential-bearing hop that the caller
does not own and cannot see. **No request input may influence verification.** Whoever deploys the
process decides, and nobody else.

The prescribed shape, at module scope:

```python
SSL_VERIFY_SOURCE = "env" if os.getenv(FIGMA_SSL_VERIFY_ENV) is not None else "default"
SSL_VERIFY = resolve_verify(None)

# Per-request clients get this, not SSL_VERIFY itself.
if SSL_VERIFY is False:
    _insecure_context = ssl.create_default_context()
    _insecure_context.check_hostname = False
    _insecure_context.verify_mode = ssl.CERT_NONE
    CLIENT_SSL_VERIFY: bool | str | ssl.SSLContext = _insecure_context
else:
    CLIENT_SSL_VERIFY = SSL_VERIFY
```

The substitution matters because these servers construct a client **per request**. Handing
`verify=False` to each one would re-run resolution and re-emit the §5 warning on every request.
An explicit `CERT_NONE` context says exactly the same thing to httpx — it is what httpx builds
internally for `verify=False`, and what the downloader builds at
`figma_downloader/http_fetch.py:48-50` — while falling under the "caller built it deliberately"
rule in §5, so the warning stays at the single one emitted at startup. The startup log line, not
the warning, is the durable record.

## 11. CLI flags

Every command that constructs a client accepts:

```
--ssl-verify / --no-ssl-verify    (alias: --insecure)
```

The flag names match the downloader's exactly (`figma_downloader/cli.py:53-55`, aliases at
`cli.py:81`).

It must be **tri-state**. In Typer that is `Optional[bool] = typer.Option(None, "--ssl-verify/--no-ssl-verify")`:
untouched leaves `None`, so `FIGMA_SSL_VERIFY` still decides. A plain `bool` defaulting to `True`
or `False` would make every invocation an explicit choice and silently defeat the environment
variable — the exact bug §2 exists to prevent.

Help text, used verbatim across all packages:

- `--ssl-verify/--no-ssl-verify`: `Verify TLS certificates (default: on; env FIGMA_SSL_VERIFY).`
- `--insecure`: `Alias for --no-ssl-verify.`

## 12. What the reference implementation revealed

Learned while doing `figma_files` first. Each of these would otherwise be rediscovered seven
times.

- **`ruff check` rewrites your files.** Every package's `pyproject.toml` sets `fix = true` under
  `[tool.ruff]`, so a plain `ruff check .` silently applies fixes — import re-sorting, unused
  import removal, trailing-whitespace stripping — across the whole package, not just the files
  you edited. Use `ruff check --no-fix src tests` to look without touching, and never point it at
  a directory containing a virtualenv.
- **The client method names differ per package.** The plan calls the lazy constructor `start()`;
  in `figma_files` it is `_ensure_client()`. Grep for the `httpx.AsyncClient(` call site rather
  than assuming a name.
- **Not every client has a `_client_kwargs` dict to write into.** `figma_files` built its
  constructor arguments inline at the call site; the resolved value has nowhere to live until you
  introduce the dict. Introducing it is the right move — it is what `figma_components` already
  does, and it is what makes "resolve early, construct late" expressible.
- **`asyncio.run()` inside a synchronous test poisons later tests.** It closes the loop and
  leaves none current, and `RateLimiter.__init__` calls `asyncio.get_event_loop()` at
  construction time, so the next test that builds a rate-limited client dies with a confusing
  error in an unrelated file. Write the test `async` and `await` instead. Where a test must
  invoke a Typer command (which calls `asyncio.run()` itself), restore a loop in a `finally`.
  This is a latent fragility in `RateLimiter`, not in this feature — but this feature's tests are
  what surface it.
- **The suite was not green before this work started.** `msh-api-figma/v100/packages/py/files/` had 9 failing
  tests on a clean checkout (stale assertions in `test_cli.py`, `test_client.py`, `test_sdk.py`,
  and four `test_server.py` token tests that fail on FastAPI dependency serialization). None are
  related to TLS. Record the count before you start on each package, and hold yourself to
  "no new failures" rather than to "green".
- **The warning's `stacklevel=3` is right for `__init__`, not for module scope.** Server modules
  call `resolve_verify(None)` at import; `warnings` clamps the stack rather than erroring, so the
  attribution is just less precise. Nothing to fix, but do not be surprised by it.

## 13. Parity with figma-downloader-py

`msh-sdk-figma-downloader/v200/packages/figma-downloader-py` implements the same feature on
`urllib` and reads the same `FIGMA_SSL_VERIFY`. An operator who runs both tools must be able to
configure them once. This table is the reconciliation; it was produced by **running both
implementations over the same inputs**, not by reading them.

| # | Point | Downloader | httpx packages | Verdict |
| --- | --- | --- | --- | --- |
| 1 | Environment variable | `FIGMA_SSL_VERIFY` | `FIGMA_SSL_VERIFY` | same |
| 2 | Default when unset | `True` | `True` | same |
| 3 | Boolean-false strings | `false`, `0`, `no`, `off`, `""` | identical | same |
| 4 | Boolean-true strings | everything else | `true`, `1`, `yes`, `on` | see #8 |
| 5 | Case and whitespace | stripped, lowercased | stripped, lowercased | same |
| 6 | CLI flags | `--ssl-verify`, `--no-ssl-verify`, `--insecure` | identical, all 8 CLIs | same |
| 7 | `--insecure` vs `--ssl-verify` | `--insecure` wins | `--insecure` wins | same |
| 8 | Unrecognized value | verifies with system CAs | used as a CA-bundle path | **divergence — intended** |
| 9 | Warning when disabled | `[figma-download] WARNING: TLS certificate verification is DISABLED (from {source}).` on stderr | same sentence via `warnings.warn(InsecureTransportWarning)` | **divergence — intended** |
| 10 | Config file (`sslVerify`) | supported | not supported | **divergence — intended** |
| 11 | `NODE_TLS_REJECT_UNAUTHORIZED` | honored | not honored | **divergence — intended** |
| 12 | Client certificates (`cert=`) | not supported | not supported | same (out of scope) |
| 13 | Proxy configuration | `--proxy` / `--no-proxy` | not supported | out of scope, separate plan |

**No input makes one tool verify and the other not.** That is the property that matters, and it
was checked across 26 inputs including `"TRUE"`, `""`, `" 0 "`, `"\tno\t"`, `"2"`, and `"maybe"`.
The four divergences are each deliberate:

- **#8 — unrecognized value.** The downloader's `_as_bool` returns `True` for anything it does not
  recognize, so `FIGMA_SSL_VERIFY=maybe` silently verifies with the system trust store. The httpx
  packages treat it as a CA-bundle path, so the same value raises
  `FileNotFoundError`/`OSError` at client construction. Both keep verification *on*; the httpx
  side fails loudly where the downloader shrugs. This is the price of supporting
  `FIGMA_SSL_VERIFY=/path/to/ca.pem` at all, and failing loudly on what is almost always a typo is
  the better half of the trade. It is additive: every string the downloader reads as a boolean is
  read identically here.
- **#9 — warning channel.** Justified in §5: a library cannot write to stderr and expect its
  consumer to be able to silence, capture, or route it. The sentence is deliberately identical
  minus the application prefix so both tools are greppable together.
- **#10 — no config file.** The downloader is an application with a working directory and a
  natural place for `figma-download.config.json`. These eight are importable libraries; a library
  that reads a config file out of the caller's CWD is a surprise, not a feature.
- **#11 — no `NODE_TLS_REJECT_UNAUTHORIZED`.** The downloader honors it because it is the twin of
  a Node implementation and shares operators with it. Nothing under `msh-api-figma/v100/packages/py/` has that
  lineage, and honoring a Node-specific variable in a Python library would be cargo cult.

`msh-sdk-figma-downloader` is **not modified** by this work. The reconciliation moved the httpx
side to match it, never the reverse.

## 14. Test pattern

Every package carries `tests/test_ssl_verify.py` with the same four classes;
`figma_files` instead extends its existing `test_client.py` / `test_cli.py` / `test_server.py`,
because it also holds the one deep test that the others do not duplicate.

**What to assert on.** The client's public `verify` property (§1). `httpx.AsyncClient` exposes no
readable `verify` attribute, so the alternatives are patching the constructor and reading captured
kwargs — stable across the whole pinned range — or reaching into
`client._transport._pool._ssl_context`, which proves the kwarg is *honored* rather than merely
accepted but is private and version-fragile. **Exactly one test in the monorepo goes that deep**
(`files/tests/test_client.py::test_httpx_honors_verify_in_the_real_ssl_context`), clearly labeled.
Everywhere else, read the property.

**The four classes:**

| Class | Covers |
| --- | --- |
| `TestClientVerifyContract` | the five cases, the boolean table, the path fallback, warn-once, warn-never-when-enabled, and (lazy clients) repeated `start()` |
| `TestSDKForwardsVerify` | explicit value, environment deferral, and default-on through the SDK |
| `TestCLIFlags` | the three flag states, `--insecure` as alias, `--insecure` beating `--ssl-verify` |
| `TestServerVerify` | startup resolution, the `CERT_NONE` substitution, warn-once at import, and that no request input can reach it |

**Five rules learned the hard way:**

1. **`monkeypatch.setenv` / `monkeypatch.delenv(..., raising=False)` for every environment case.**
   A bare `os.environ` write leaks into whatever test runs next, and these tests are all about
   the environment.
2. **`pytest.warns(...)` records *every* warning raised in the block, not only the matched
   category.** `assert len(record) == 1` fails the moment FastAPI emits an unrelated
   `DeprecationWarning`. Always filter:
   `assert len([w for w in record if issubclass(w.category, InsecureTransportWarning)]) == 1`.
3. **Never call `asyncio.run()` from a synchronous test.** See §12 — write the test `async`, or
   restore a loop in a `finally` when driving a Typer command that calls it internally.
4. **Use a real CA bundle (`certifi.where()`), not an empty temp file**, for the CA-path case. The
   eager clients hand the path to httpx inside `__init__`, which loads it there and then; an empty
   file raises `ssl.SSLError: [X509: NO_CERTIFICATE_OR_CRL_FOUND]`.
5. **Give the CLI test a command that really builds a client, with its positional arguments
   filled.** A command that exits early on a missing argument or API key never reaches the
   constructor, and the test passes vacuously with `verify` simply absent. Assert on the captured
   value, never on "no exception raised".

**Server tests reload the module.** Resolution happens at import, so
`importlib.reload(server)` under a `monkeypatch.setenv` is what exercises it. Suppress
`InsecureTransportWarning` on reloads whose purpose is not the warning itself.
