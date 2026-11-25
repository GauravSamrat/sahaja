# AI interchange

Import a UTF-8 JSON file or paste JSON into **Workspace → Import an AI plan**. The top-level object requires `"format": "sahaja-plan"`, `"version": 1` and a `tasks` array. Optionally include a `projects` array whose entries have a unique `title` (120 characters) and optional `goal` (500 characters).

| Task field | Accepted values |
| --- | --- |
| `title` | Required text, up to 200 characters |
| `dim` | Existing dimension name, matched case-insensitively. Defaults to the first dimension |
| `project` | Project label, up to 120 characters |
| `est` | Integer minutes from 0 to 1440. 0 means unknown |
| `energy`, `priority` | Integers from 1 to 3. Default 2 |
| `device` | `any`, `phone` or `computer` |
| `online` | Boolean. True requires an internet connection |
| `rec` | Empty string, `daily` or `weekly` |
| `deadlineKind` | `external` or `flexible`. Default external |
| `deadline`, `start` | Timestamp including Z or an explicit UTC offset |
| `notes` | Text, up to 4000 characters |
| `subtasks` | Up to 50 objects with nonempty `title` and boolean `done` |

Duplicate detection compares the normalized title, dimension and project label with the workspace and earlier plan rows. Projects and tasks have separate selections. Selecting a task can keep its project label without adding the project goal. Existing records are preserved. The importer treats the payload as data and ignores unrecognized plan fields.

See [sample-ai-plan.json](sample-ai-plan.json).
