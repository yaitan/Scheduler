# Scheduler — Project Instructions for Claude Code

## Documentation Standard

All source files must follow the documentation standard established in
`client/src/components/SessionModal.js`. Apply this standard when writing new
code or when documenting existing code.

---

### 1. File-level header comment

Every component or module file starts with a block comment that covers:

- **What the file is** — one sentence description.
- **Modes / variants** — if the component behaves differently in different
  contexts (e.g. new vs. edit), list them and explain the differences.
- **Key flows** — numbered steps for any multi-stage process (e.g. a
  submit pipeline with validation → warnings → API call).
- **API routes used** — an explicit list of every route the file touches,
  in the format:

  ```
  METHOD  /api/route/path   — plain-English description of what it does
  ```

- **Exports** — for utility/helper modules, list every exported function or
  constant with a one-line description of each. This gives readers a quick
  index without having to scan the whole file.
- **Sub-components** — for component files that define more than one exported
  or internal component, list them here.

---

### 2. Component-level JSDoc

Every component function gets a JSDoc block with:

- A short description of what the component does and why it exists.
- **Props** — name, type, and a sentence describing each prop.
- **States** — every `useState` variable listed with its type and a
  description of what it represents and when it changes. If a state is
  populated by an API call, name the route.

Example format:

```js
/**
 * MyComponent
 *
 * <one-line description>
 *
 * Props:
 *   foo  {string}  — ...
 *   bar  {boolean} — ...
 *
 * States:
 *   items     {Array}   — Fetched from GET /api/items on mount. ...
 *   loading   {boolean} — True while the fetch is in-flight.
 *   error     {string}  — Shown to the user if the fetch fails.
 */
```

---

### 3. Function-level JSDoc

Every named function (including nested helpers) gets a JSDoc comment:

- **Description** — what the function does and why it exists (not just
  what the name already says).
- **API route** — if the function makes a network request, prefix the
  description with the route(s) it calls, e.g.:
  ```
  POST /api/sessions  (new session)
  PUT  /api/sessions/:id  (edit session)
  ```
- **@param** — every parameter with type and description.
- **@returns** — return type and what it contains, if non-obvious.
- **Edge cases / clamping / wrap-around** — call out any non-obvious
  arithmetic or boundary handling inline or in the JSDoc.

One-liner helpers (e.g. `setHours`, `setMins`) may use a single-line
`/** ... */` doc instead of a full block.

---

### 4. Inline comments for dense code

Any line or block that is not immediately obvious to a reader unfamiliar
with the codebase needs an inline comment. Common triggers:

- Timezone / date arithmetic (explain *why* a specific approach is used).
- State resets that happen as a side effect of another action.
- `stopPropagation` / `preventDefault` calls (explain what they guard against).
- Layout or style choices driven by business logic.
- Wrapping / clamping arithmetic.
- Two-step UI flows (e.g. "pause here for user confirmation before API call").

Format: end-of-line `//` comment for short notes; `/* block */` above the
relevant lines for longer explanations.

---

### 5. Section dividers

Use ASCII dividers to separate major rendering branches inside a single
function body:

```js
// ─── Section name ────────────────────────────────────────────────────────────
```

Use these before early-return render branches (e.g. a confirm-delete view
that returns before the main form) and before the main return statement.

---

### 6. Server route documentation

Every route handler must have a JSDoc block that includes:

- **Description** — what the endpoint does, including any non-obvious behaviour
  (e.g. side effects, auto-complete triggers, derived fields).
- **Path / query / body params** — name, type, whether required or optional,
  and a one-line description of each.
- **Example request** — the HTTP method + path, and the request body (if any).
- **Example response** — the HTTP status code and a representative JSON body.
- **Errors** — every non-2xx response the handler can return, with status code
  and the exact error message string.

Example format:

```js
/**
 * POST /api/sessions
 *
 * Creates a new session. Rejects if the time slot overlaps an existing session.
 *
 * Body:
 *   client_id  {integer}  — The client's database ID. Required.
 *   date       {string}   — Session date in YYYY-MM-DD format. Required.
 *
 * Example request:
 *   POST /api/sessions
 *   { "client_id": 1, "date": "2025-04-10", "time": "16:00", "duration": 60, "rate": 150 }
 *
 * Example response (201):
 *   { "id": 14, "client_id": 1, "name": "Alice", ... }
 *
 * Errors:
 *   400  { "error": "client_id, date, time, duration, and rate are required" }
 *   409  { "error": "Session overlaps with an existing session" }
 */
```

---

### 7. File internal order

Within every file, top-level declarations must appear in this order:

1. **Imports** — all `import` statements, grouped together at the very top.
2. **ALL_CAPS constants** — module-level constants whose names are SCREAMING_SNAKE_CASE
   (e.g. `HOUR_PX`, `MONTH_NAMES`, `NAV_ITEMS`). These go before any functions so
   readers can find magic values without scanning function bodies.
3. **Functions** — helpers, sub-components, and the main exported component/function,
   in the order they are first needed (helpers before the things that call them).

---

### 8. What NOT to document

- Boilerplate that is self-evident from the code (e.g. `onChange={e => setFoo(e.target.value)}`
  does not need a comment).
- Re-stating the variable name in prose (avoid `// sets the name` above `setName(x)`).
- Temporary / in-progress state — put that in git commit messages, not comments.
