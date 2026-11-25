# Architecture

`model.js` defines validation, migration, recurrence, timer calculations and deterministic recommendations. `repository.js` manages IndexedDB. `app.js` binds the model to the UI. `server.js` serves the same static shell on Windows loopback. `sw.js` precaches only the runtime shell and removes obsolete caches once the replacement worker activates. Worker updates leave browser records in IndexedDB.

## Storage and recovery

Database schema 1 uses task, project, cycle, session and money stores with primary keys, plus metadata for settings, write revision and the previous restore snapshot. Backup format 2 is separate from the physical database version. Valid version 1 backups and localStorage values are upgraded in memory before one atomic commit. Older external deadlines retain their timestamp. Recognizable legacy recurrence rows move from their old earliest-start placeholder to the corrected recurrence gate.

A change is rendered as saved only after its IndexedDB transaction completes. A revision check prevents stale tabs from overwriting newer writes. Close extra tabs and reload after a conflict. Failed restore transactions preserve both the current records and the earlier recovery copy. A successful restore replaces the recovery slot with a snapshot of the prior workspace. Export a separate JSON file for longer-lived history.

Replace uses the incoming workspace including preferences. Merge retains current preferences and existing records by ID, maps dimensions by case-insensitive name, and combines projects by ID or name where possible. If both workspaces have an open cycle, the existing cycle remains open and the incoming one closes at its latest recorded activity boundary, or at its start if it has no activity. If there are competing active timers on different tasks, the existing timer continues and the incoming timer is recorded as a session through the merge time.

## Recommendations and time

Eligibility checks status, time budget, start, recurrence, postponement, energy, device, internet and chosen dimension. A finite budget requires an estimate. Recovery restricts recommendations to low-energy tasks. Project focus and projects with a goal affect ranking, along with urgency, priority, energy match, time fit and bounded waiting time. Ranking uses deterministic age and ID tie-breaking.

Recurrence uses elapsed intervals of 24 hours and 7 days. The first interval is measured from completion. Later intervals use the prior scheduled occurrence and skip missed intervals. A flexible target moves by the same interval count. An external due date belongs to its original occurrence. A completed occurrence keeps its successor marker through reopening and archiving.

The user starts and ends a cycle. A timer keeps its starting cycle ID across midnight or device sleep. Ending an associated cycle records and stops the timer. Timer state contains accumulated milliseconds and a wall-clock timestamp for the running segment. For abrupt clock changes or forgotten timers, enter a corrected total using **Correct duration**. Weekly reporting groups by the last seven local calendar days and prorates sessions that cross the reporting boundary. Task dependencies and goal hierarchies are outside this release.

Task search is debounced and lists use pages of 30 rows. Navigation and timer refresh read the current state without writes. Record-level writes compare changes inside a revision-checked transaction. The timer updates its text only while visible and running.

Activity reports use session durations exclusively. The task actual-duration field remains editable independently and never enters Activity totals. Focus sessions may store the task title, project label and estimate present at recording time. These optional fields are compatible with existing IndexedDB records and backup formats. Older sessions use linked task details where available. Calendar reports prorate sessions that cross a boundary because pause intervals are not retained. The current cycle uses stored cycle associations. A correction replaces one session by ID and adjusts the linked task total by the duration difference.

Prompt generation, outreach and feedback use the existing browser UI and storage. The generated prompt uses the version 1 AI format. The optional feedback link opens the public repository form without including workspace data.
