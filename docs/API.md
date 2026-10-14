# TWW Content Writer Hub — API

The GAS web app exposes a single JSON endpoint. The frontend calls it with:

```js
async function callApi(action, payload) {
  const res = await fetch(WEB_APP_URL, {
    method: 'POST',
    // text/plain avoids a CORS preflight; the body is still JSON.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload })
  });
  return res.json(); // { ok: true, data } or { ok: false, error, message? }
}

// Example:
const login = await callApi('auth.login', { username: 'bank', password: '••••••••' });
if (login.ok) {
  const token = login.data.token;
  const me = await callApi('auth.me', { token });
}
```

Every action is a `POST` with `action` (and `token` for `user`/`admin` actions) in the
JSON body. Responses are always `{ ok: true, data }` on success or
`{ ok: false, error: 'CODE', message?: '...' }` on failure. `GET` only returns a
health check: `{ ok: true, app, version }`.

## Common error codes

| code | meaning |
|---|---|
| `BAD_JSON` | request body was not valid JSON |
| `TOO_LARGE` | request body exceeded `MAX_BODY_BYTES` |
| `UNKNOWN_ACTION` | `action` is not in the route table |
| `UNAUTHORIZED` | missing/invalid/expired `token` |
| `FORBIDDEN` | authenticated but not allowed to do this |
| `BAD_INPUT` | a field failed validation (see `message`) |
| `NOT_FOUND` | referenced resource does not exist (or is hidden from you) |
| `LOCKED` | login temporarily locked out after repeated failures |
| `BAD_CREDENTIALS` | login failed (bad username, password, or inactive user) |
| `WEAK_PASSWORD` | new password shorter than 8 characters |
| `DOC_NOT_ACCESSIBLE` | the Google Doc id/URL could not be opened |
| `SERVER_ERROR` | unexpected exception (see `message`) |

## Auth levels

- `none` — no `token` required.
- `user` — any active, logged-in user.
- `admin` — logged-in user with `role === 'admin'`.

---

## `ping`
- Auth: none
- Request: `{}`
- Response `data`: `{ pong: true, version: '0.2.0' }`

## `auth.login`
- Auth: none
- Request: `{ username, password }`
- Response `data`: `{ token, user: PublicUser }` where
  `PublicUser = { user_id, username, display_name, role, playfulness_default, catchphrases, avoid_list }`
- Errors: `LOCKED`, `BAD_CREDENTIALS`

## `auth.me`
- Auth: user
- Request: `{ token }`
- Response `data`: `{ user: PublicUser }`

## `auth.logout`
- Auth: user
- Request: `{ token }`
- Response `data`: `{ ok: true }` (the session's `expires_at` is set to now; the row is kept, not deleted)

## `auth.changePassword`
- Auth: user
- Request: `{ token, oldPassword, newPassword }`
- Response `data`: `{ ok: true }`
- Errors: `BAD_CREDENTIALS` (wrong old password), `WEAK_PASSWORD` (new password < 8 chars)

---

## `users.list`
- Auth: user
- Request: `{ token }`
- Response `data`: `Array<{ user_id, display_name, role }>` (active users only)

## `users.updateProfile`
- Auth: user
- Request: `{ token, playfulness_default?, catchphrases?, avoid_list? }`
  - `playfulness_default`: integer 1..5
  - `catchphrases`, `avoid_list`: strings, ≤ 2000 chars
- Response `data`: updated `PublicUser`
- Errors: `BAD_INPUT`

---

## `posts.list`
- Auth: user
- Request: `{ token, scope: 'all'|'mine'|'friends', q? }`
  - `mine` = your own posts; `friends` = everyone else's; `q` = case-insensitive
    substring match on `project_name` or `location`.
- Response `data`: array of post rows **without** `body`, `inputs_json`,
  `results_json`, `narrative_json`, `tone_json`. Each row adds `author_name`
  and `format_name` (the latest version's name for that format). Sorted by
  `updated_at` desc, max 200 rows.

## `posts.get`
- Auth: user (any logged-in user may read any post)
- Request: `{ token, post_id }`
- Response `data`: full post row with `inputs`, `results`, `narrative`, `tone`
  parsed to objects, plus `author_name`.
- Errors: `NOT_FOUND`

## `posts.save`
- Auth: user
- Request:
  ```
  {
    token,
    post: {
      post_id?,          // omit to create a new post
      format_id, project_name, location?, post_status?, case_summary?,
      inputs?, results?, narrative?, tone?, body?
    },
    createDoc?: boolean,      // create a brand-new Google Doc (never overwrites an existing one)
    saveAsExample?: boolean   // mark as a style example (upserts one Examples row per post)
  }
  ```
  - New post (no `post_id`): appended with `user_id` = you.
  - Existing post: must belong to you, or `FORBIDDEN`.
  - Validation: `format_id` required; `project_name` required, ≤ 200 chars;
    `post_status` ∈ `draft|ready|posted` (default `draft`); `body` ≤ 60000 chars.
  - `createDoc: true` creates a **new** Google Doc titled
    `"<project_name> · <author display name> · <YYYY-MM-DD>"`, moves it into the
    Docs folder, and stores its URL in `doc_url` (a prior `doc_url` is replaced,
    the old Doc itself is left untouched).
  - `saveAsExample: true` sets `is_style_example = TRUE` and appends an Examples
    row (`source: 'post'`, `source_ref: post_id`) — or updates the existing one
    if that post already has an active Example.
- Response `data`: `{ post: <same shape as posts.get> }`
- Errors: `BAD_INPUT`, `FORBIDDEN`, `NOT_FOUND`

---

## `formats.list`
- Auth: user
- Request: `{ token }`
- Response `data`: for each `format_id`, its latest version as
  `{ format_id, name, version, status, updated_at }`. Non-admins only see
  formats whose latest version is `published`; admins see everything.

## `formats.get`
- Auth: user
- Request: `{ token, format_id, version? }` (omit `version` for the latest)
- Response `data`: `{ format_id, name, version, status, spec }` (`spec` parsed from JSON)
- Errors: `NOT_FOUND` (also returned to non-admins if the latest version is a draft)

## `formats.save`
- Auth: admin
- Request: `{ token, spec, status: 'draft'|'published' }`
  - `spec` must be an object with `spec.id` matching `^[a-z0-9][a-z0-9-]*$` and a
    string `spec.name`. Full field/formula validation happens client-side in
    the browser engine; the server only sanity-checks shape and size (≤ 100000
    JSON chars).
  - Always appends a **new** row (`version = latest + 1`, or `1` for a new
    format id). Existing rows are never modified.
- Response `data`: `{ format_id, name, version, status }`
- Errors: `BAD_INPUT`, `FORBIDDEN`

---

## `examples.list`
- Auth: user
- Request: `{ token, format_id?, owner?, include_hidden? }` (`owner` may be a `user_id` or `HOUSE`)
- Response `data`: examples, newest first, `body` included, max 100. Each row includes
  `active` (boolean). By default only active rows. With `include_hidden: true`,
  inactive rows are also returned, but only those the caller may manage (owner is
  the caller, or the caller is admin); other inactive rows stay excluded.

## `examples.add`
- Auth: user
- Request: `{ token, owner?, format_id, title, body, source?, source_ref? }`
  - `owner` defaults to you. `owner: 'HOUSE'` requires admin. Another user's id → `FORBIDDEN`.
  - `source` defaults to `'manual'`, `source_ref` to `''` (used by "promote to House":
    `source: 'promoted', source_ref: <original example_id>`).
- Response `data`: the created Example row.
- Errors: `BAD_INPUT`, `FORBIDDEN`

## `examples.update`
- Auth: user
- Request: `{ token, example_id, active?, format_id?, title? }`
  - Caller must own the example, or be admin (any owner including `HOUSE`), else `FORBIDDEN`.
  - `title`: non-empty, ≤ 200 chars. `format_id`: string ≤ 100 chars (`''` = unspecified).
    `active`: boolean (`false` hides; nothing is ever deleted).
  - Only the given columns of that row are changed.
- Response `data`: the updated Example row (with boolean `active`).
- Errors: `BAD_INPUT`, `FORBIDDEN`, `NOT_FOUND`

## `examples.importDoc`
- Auth: user
- Request: `{ token, doc: '<url or bare doc id>', format_id, owner? }`
  - The doc id is extracted from a `/d/<id>/` style URL, or accepted as a bare
    id (20+ url-safe chars).
- Response `data`: `{ example, duplicate: boolean }`. If an active example
  already exists for that `source_ref` (doc id), it is returned as-is with
  `duplicate: true` and no new row is created.
- Errors: `BAD_INPUT`, `FORBIDDEN`, `DOC_NOT_ACCESSIBLE`

## `examples.importFolder`
- Auth: admin
- Request: `{ token, folder_id, format_id, owner_user_id }`
- Iterates every Google Doc in the Drive folder, importing each like
  `examples.importDoc` (duplicates are skipped), and stops before 5 minutes of
  runtime so it can be safely re-run.
- Response `data`: `{ imported, skipped, remaining: boolean }`

---

## `styledna.get`
- Auth: user
- Request: `{ token, scope }` (`scope` = `'HOUSE'` or a `user_id`)
- Response `data`: latest version
  `{ scope, version, dna, changelog, source_example_ids, created_by, created_at }`
  or `null` if none exists yet.
- Access: any user may read `HOUSE` and their own scope. Reading another
  user's scope → `FORBIDDEN` (unless you are admin).

## `styledna.history`
- Auth: user
- Request: `{ token, scope }`
- Response `data`: all versions (same shape as `styledna.get`, including `dna`), newest first.
- Access: same rule as `styledna.get`.

## `styledna.save`
- Auth: user (writes to `HOUSE` require admin; writes to your own `user_id` scope require you)
- Request: `{ token, scope, dna, changelog, source_example_ids? }`
  - `dna`: object or string, stored as JSON, ≤ 50000 chars.
  - `changelog`: required, non-empty, ≤ 5000 chars.
  - Always appends `version = latest + 1` (append-only, never overwrites).
- Response `data`: the newly created version.
- Errors: `BAD_INPUT`, `FORBIDDEN`

## `styledna.rollback`
- Auth: user (same write rule as `styledna.save`)
- Request: `{ token, scope, to_version }`
- Appends a **new** version that copies `to_version`'s `dna`, with changelog
  `"ย้อนกลับไปใช้ v<to_version>"`.
- Response `data`: the newly created version.
- Errors: `BAD_INPUT`, `FORBIDDEN`, `NOT_FOUND`

---

## `comps.list`
- Auth: user
- Request: `{ token, q? }` (`q` filters `project_name`/`location`, case-insensitive)
- Response `data`: all comps, newest first.

## `comps.add`
- Auth: user
- Request: `{ token, project_name, location?, price_per_sqm, source?, note? }`
  - `price_per_sqm` must be a positive number; strings like `"95,000"` are accepted.
- Response `data`: the created Comp row.
- Errors: `BAD_INPUT`

---

## Editor-only functions (not routed through the API)

These are run manually from the Apps Script editor, using Script Properties for
input, and are not reachable via `doPost`:

- `adminCreateUser()` — reads `NEW_USER_USERNAME`, `NEW_USER_PASSWORD`,
  `NEW_USER_DISPLAY`, `NEW_USER_ROLE`; deletes all four properties when done.
- `adminResetPassword()` — reads `RESET_USERNAME`, `RESET_PASSWORD`; deletes both when done.
- `adminSeedFormats()` — inserts any format from `SEED_FORMATS` (generated by
  `scripts/build-seed.mjs` from `seed/formats/*.json`) that doesn't exist yet.
- `adminImportFolder()` — reads `IMPORT_FOLDER_ID`, `IMPORT_FORMAT_ID`,
  `IMPORT_OWNER_USERNAME`; re-runnable (does not delete its properties).
