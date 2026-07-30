# Task 2 report — tested responsive web shell

## Scope delivered

- Created a private root npm workspace for `apps/*` and `packages/*`, with Node 22 metadata and one root `package-lock.json`.
- Added `apps/web`: React 19, TypeScript, Vite 8, Tailwind 4 via the Vite plugin, Vitest, Testing Library, and a Radix Dialog privacy disclosure.
- Built the responsive foundation shell only. It contains no `video` element, camera request, camera stream, inference, service worker, photo capture, persistence, or diagnostics functionality.
- Included the existing task-plan refinement in the pending commit.

## Confirmed public test seams

The component suite exercises participant-visible DOM behavior only:

1. The semantic shell, exact privacy introduction, labeled foundation-preview stage, disabled continuation state, and absence of a camera request.
2. The keyboard-accessible Radix privacy disclosure and its participant-visible privacy statements.

`navigator.mediaDevices.getUserMedia` is supplied at the browser boundary and asserted never called during render or an attempted interaction. It is not an internal implementation mock.

## TDD evidence

### Cycle 1 — foundation shell and no camera access

Test written first: `apps/web/src/App.test.tsx`, with a placeholder `App` returning `null`.

RED command:

```bash
npm run test --workspace=@smart-smile/web -- src/App.test.tsx
```

Relevant RED output:

```text
FAIL  src/App.test.tsx > Smart Smile foundation shell > shows the private camera foundation without requesting camera access
TestingLibraryElementError: Unable to find an accessible element with the role "banner"
There are no accessible roles.
Test Files  1 failed (1)
Tests  1 failed (1)
```

Implemented the minimal semantic header, main, footer, exact privacy copy, labeled non-video preview, disabled continuation button and explanatory text. No camera API is referenced by the application.

GREEN command:

```bash
npm run test --workspace=@smart-smile/web -- src/App.test.tsx
```

Relevant GREEN output:

```text
Test Files  1 passed (1)
Tests  1 passed (1)
```

### Cycle 2 — privacy disclosure

Added the interaction test before adding a privacy trigger or disclosure implementation.

RED command:

```bash
npm run test --workspace=@smart-smile/web -- src/App.test.tsx
```

Relevant RED output:

```text
FAIL  src/App.test.tsx > Smart Smile foundation shell > opens an accessible privacy disclosure
TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "How privacy works"
Test Files  1 failed (1)
Tests  1 failed | 1 passed (2)
```

Implemented a Radix Dialog trigger, modal disclosure, labelled title, four privacy statements, and close control.

GREEN command:

```bash
npm run test --workspace=@smart-smile/web -- src/App.test.tsx
```

Relevant GREEN output:

```text
Test Files  1 passed (1)
Tests  2 passed (2)
```

## Visual and accessibility implementation

- Uses the approved canvas, camera surround, surface, strong/muted text, action, status, guidance, danger, and focus token values from the approved UX specification.
- Uses safe-area-aware shell padding, 48 px minimum control sizing, a 3 px visible focus ring, and reduced-motion overrides.
- Uses a mobile single-column layout and a two-column layout from 768 CSS px, with the camera stage dominant and the coach card capped at 28 rem reading width.
- The privacy trigger has an accessible name; the Radix dialog provides modal focus behavior and an accessible title.

## Final verification

```bash
npm run web:test && npm run web:typecheck && npm run web:build && make python-test
```

Relevant output:

```text
Test Files  1 passed (1)
Tests  2 passed (2)

tsc -b --pretty false

vite v8.1.5 building client environment for production...
✓ 70 modules transformed.
✓ built in 47ms

38 passed in 0.41s
```

## Self-review

- Confirmed every mandated direct dependency is exact-pinned to the ticket's compatibility set using `npm ls --workspace=@smart-smile/web --depth=0`.
- Confirmed `git diff --check` is clean.
- Confirmed no generated starter assets are tracked and `node_modules/` is ignored.
- Kept changes separate from the desktop reference; its complete test suite remains green.
