# Tal’s Whiteboard — revised build prompt

Build a simple classroom whiteboard with one permanent URL, one continuing gallery, and a fixed instructor password. **Use `the_secret_word` as a browser-side convenience gate.** No instructor account, email, password registration, or recovery flow is needed.

## Student and instructor experience

Build with React, TypeScript, and Vite. Deploy to GitHub Pages at `https://talgross-bu.github.io/whiteboard/`, using repository `whiteboard`.

**Student page**

- Show “Tal’s Whiteboard,” a required spokesperson name field, a large blank whiteboard, drawing tools, and Submit.
- Provide pen, straight line, arrow, typed labels, eraser, undo/redo, and Clear board. Include black, blue, red, and green ink and three thicknesses.
- Support mouse, finger, and stylus. Prevent page scrolling while drawing. Use large touch targets and accessible control labels.
- Start completely blank, with no instructions, activity names, axes, or grid.
- Use a responsive 4:3 board with a 1200 × 900 export resolution. Preserve drawings when resizing or rotating the device.
- Save the name and editable draft locally across refreshes. Confirm before clearing a nonempty board and allow undo.
- Submit a PNG snapshot. Display success only after the database confirms receipt; preserve work on errors and offer Retry.
- Allow edits after submission. “Update submission” replaces that browser’s previous submission. Changes remain local until submitted.
- Keep separate submissions for different browsers, even when names match. Prevent duplicates from double clicks and retries.

**Instructor access**

- Put a small, accessible padlock button at the bottom of the page.
- Clicking it opens a password field. Compare the entered value with a single configurable constant, initially `the_secret_word`.
- A correct password opens the instructor view; an incorrect password shows a short error.
- Remember the unlocked state in `sessionStorage`. Provide “Lock instructor view” to return to the student page.
- The password is intentionally visible in the website code. This gate does not protect gallery data or operations against direct API access; that is an accepted design choice.

**Instructor gallery**

- Show all submitted drawings with prominent spokesperson names and a submission count.
- Order drawings newest first by initial submission time; replacements retain their position.
- Clicking a thumbnail opens a large presentation view with the name, previous/next controls, keyboard navigation, Escape to close, and fullscreen support with a viewport-filling fallback.
- Refresh every five seconds while the gallery is visible and submissions are open. Include manual Refresh. Preserve the current selection during updates.
- Provide Open/Close submissions and Clear all drawings.
- Start with submissions closed. Persist the open/closed setting.
- Closing prevents new submissions and replacements; reopening permits them.
- Drawings remain until cleared. Clearing requires confirmation showing the number being deleted, preserves the open/closed setting, and never erases students’ local drafts.

There are no named activities, archives, stars, downloads, student accounts, uploads, or shared live editing. Students use their existing meeting software for screen sharing.

## Technical implementation

Use Neon Postgres and its Data API. Keep the static site on GitHub Pages; require no additional hosting service.

Use Neon’s documented anonymous-access SDK configuration, `allowAnonymous: true`. Neon manages anonymous tokens automatically; neither students nor the instructor sign into a Neon account through this app. [Neon anonymous-access documentation](https://neon.com/docs/data-api/access-control).

- Store board state and submitted PNGs, thumbnails, names, and timestamps in Neon.
- Give each browser a persistent random submission identifier. Combine it with an internal gallery generation to identify the replaceable submission.
- Clearing deletes submissions and changes the generation. Reject stale requests so an in-flight save cannot restore cleared work. Preserve the draft and invite deliberate resubmission.
- Expose narrowly scoped database functions for status, submission replacement, gallery listing, image retrieval, opening/closing, and clearing. Permit anonymous execution of these app operations.
- Keep underlying tables unavailable for arbitrary direct modification. Database functions must enforce open/closed state, generation checks, and input limits transactionally. Fix the search path of privileged functions.
- Validate trimmed names of 1–100 characters and bounded PNG payloads. Render names and labels as plain text.
- Limit full PNGs to 1 MiB and thumbnails to 100 KiB. Store editable drawing data locally.
- Poll lightweight metadata and retrieve changed thumbnails. Fetch full images when opened.
- Keep the instructor password in one clearly named frontend configuration constant. Changing it requires rebuilding the site.
- Keep Postgres credentials and Neon management API keys out of the browser and repository. Only public endpoint URLs belong in frontend environment variables.
- Configure Vite’s `/whiteboard/` base path and use navigation that works on GitHub Pages without server routing.

Do not add instructor identity tables, account provisioning, password hashing, authentication sessions, or password-reset features. The automatic anonymous token used by Neon is separate from the simple padlock interaction.

## Verification and deliverables

Verify:

- Drawing, labels, erasing, undo/redo, resizing, touch input, and local draft recovery.
- Submission replacement, identical names, double clicks, network failures, and retries.
- Closing/reopening and clearing while a submission is in flight.
- Correct/incorrect passwords, refresh while unlocked, and locking the instructor view.
- Gallery refresh, presentation navigation, and fullscreen fallback.
- 250 page visitors and approximately 65 simultaneous submissions using synthetic test data.
- The deployed GitHub Pages site, including Safari and mobile layouts. Identify any physical-device checks that remain untested.

Provide source code, reproducible database setup SQL, `.env.example`, a GitHub Actions deployment workflow, and a concise setup guide. Pin tested dependencies and verify Neon’s anonymous access early.

## Your simplified Neon setup

1. **Create a free Neon project** named `tals-whiteboard`, using an AWS region near your class and the default database.
2. **Enable the Data API with Managed Better Auth.** This supports automatic anonymous access; you do not create any instructor or student accounts. Leave broad public-schema grants unchecked because the supplied SQL will configure the app’s operations. [Data API setup](https://neon.com/docs/data-api/get-started).
3. **Copy the Auth URL and Data API URL** into the configuration supplied by the building agent.
4. **Run the agent’s setup SQL** in Neon’s SQL Editor, then click **Refresh schema cache** on the Data API page.
5. **Configure the site origin** as `https://talgross-bu.github.io` in Auth’s domain settings and the Data API’s CORS settings. Omit `/whiteboard/` from the origin. [Domain settings](https://neon.com/docs/auth/guides/configure-domains), [Data API settings](https://neon.com/docs/data-api/manage).
6. **Enable GitHub Pages through GitHub Actions** and test a student submission and the padlock on the published site.

The instructor password requires **no Neon configuration**. It lives in the website’s configuration as `the_secret_word`.
