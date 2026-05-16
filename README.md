# DIWA — Personal OS for Obsidian

**DIWA** is a professional-grade Personal Operating System plugin for [Obsidian](https://obsidian.md). It transforms your vault into a unified hub for thoughts, tasks, habits, projects, finance, and AI-powered synthesis — across mobile, tablet, and desktop.

Current release: **v3.0.0** · See [CHANGELOG.md](./CHANGELOG.md) for full history.

---

## Features

### 🖥 Desktop Hub
A dedicated popout window (`VIEW_TYPE_DESKTOP_HUB`) for desktop users only. Renders a premium 3-column cockpit:
- **LEFT**: Icon-only nav sidebar that hover-expands to 180 px with group labels
- **CENTER**: Thought capture textarea + live Today's Feed (newest-first)
- **RIGHT**: 5-stat reactive grid (Open Tasks, Overdue, Unsynth Thoughts, Total Dues, Habits ratio) + AI Intelligence briefing

Opens via the ribbon icon or `DIWA: Open Desktop Hub` command. Mobile shows a notice instead.

### 📱 Mobile Hub / Tablet Hub
Responsive hub surfaces for smaller screens. Mobile uses a single-column layout; tablet uses a denser split view. Both reuse the same capture, feed, and context workflows while keeping touch targets and spacing platform-appropriate.

### 🧠 Quick Capture
Capture thoughts and tasks instantly with datetime-stamped YAML notes. Supports inline context tagging (`⌘K`), `@`-mention triggers for people notes, `/`-trigger for people suggestions, and media paste (images saved to the attachments folder).

### ✅ Tasks
High-performance **Tactical Task Ledger** with segmented status filtering (`open` / `done` / `waiting` / `someday`). Each task is a standalone YAML file with support for:
- Priority (`high` / `medium` / `low`)
- Energy level (`high` / `medium` / `low`)
- Due dates (wikilink-formatted `[[YYYY-MM-DD]]`)
- Recurrence rules (`daily` / `weekly` / `biweekly` / `monthly`)
- Project association
- Threaded comments/replies

### 💡 Timeline
Infinite-scroll thought feed with full-body note rendering. Spotlight carousel for pinned and recent items. Date-based navigation. Each entry supports inline editing, pinning, context assignment, and comment threads.

### 🗂 Synthesis
Thought-routing workspace with Zero-Inbox logic.

**How it works:**
1. Thoughts with no context appear in the **Inbox** feed (right panel)
2. Select one or more contexts from the left panel to prime them
3. Click **Assign** on any thought card to map it to the selected contexts
4. Switch to **Mapped** to review contextualised thoughts
5. Click **Done** (or **Done All**) to mark them as synthesised

**Context panel features:**
- Alphabetical sorting with live search/filter
- Multi-select: prime multiple contexts and assign all at once
- Hide/unhide contexts (eye icon) — persisted in settings
- Select mode + Merge: combine multiple thoughts into a single note

**Layout:** 1/3 context panel (left) + 2/3 note feed (right) on desktop/tablet. Single-pane on phone.

### 📊 Finance (Dues)
Professional **Financial Ledger** reading from YAML-fronted markdown files in the PF folder. Tracks due dates, last payment dates, amounts, and active status. Includes burn-rate analytics and a cashflow dashboard powered by `monthlyIncome`.

### 🧭 Weekly Review & Compass
Multi-layered reflection system:
- **Weekly Review**: AI-generated weekly brief (5 sections: Assessment, Top Win, Key Insight, Next Week Priority, North Star Pulse), habit completion matrix, task completion/overdue counts, manual wins/lessons fields
- **Weekly Plan**: AI-generated day-by-day task distribution for the next week
- **Monthly Review**: Monthly retrospective with goals tracking
- **Compass**: Quarterly North Star Goals for long-term direction

### 🤖 AI Chat (Gemini)
Full chat interface powered by Gemini (configurable model). Features:
- Web search toggle (Google Search grounding)
- File and image grounding (drag-and-drop)
- Session history saved to vault as markdown
- Inline source citations (`[1]`, `[2]` → wikilinks)
- Vault-aware system prompt: injects up to 50 recent thoughts as context
- Injection-boundary security: vault data wrapped in `<<SOURCE_START>>` / `<<SOURCE_END>>`

### 🎙 Voice Notes
Record audio directly in the vault with one tap. Auto-transcription via Gemini with configurable target language. Transcripts routed to the standard capture flow.

### 🔍 Global Search
Spotlight-style cross-domain search across all DIWA data types (Thoughts, Tasks, Dues, Projects, Habits). Keyboard-navigable, zero-latency (reads from in-memory indices). Hotkey: `Mod+Shift+F`.

### 📅 Daily Workspace
Configurable daily dashboard surfaced from the hub. Toggleable sections:
- Daily checklist (from the capture file)
- Tasks due today
- Financial dues
- Recent thoughts
- Pinned thoughts
- AI summary

### 📁 Projects
Full project lifecycle management. Each project is a YAML-fronted markdown file with fields: `id`, `name`, `status`, `goal`, `due`, `created`, `color`. Supports milestones and linked thought threads. Project filter available in Timeline and Tasks.

### 🌿 Habits
Daily habit tracker backed by date-keyed YAML files. Configurable habit list with icons. Hourly reminders (quiet hours: 8 AM – 10 PM). Habit completion history feeds into the Weekly Review.

### 📓 Journal
Filtered thought feed surfacing entries tagged with journal-specific keywords.

### 📤 Export
Export thoughts and tasks to various formats for external use.

---

## Architecture

```
Shared Kernel
  ├── src/types.ts
  └── src/constants.ts

Presentation
  ├── src/view.ts
  ├── src/views/*.ts
  ├── src/tabs/*.ts
  └── src/modals/*.ts

Application
  ├── src/application/RefreshCoordinator.ts
  ├── src/utils/task*.ts
  └── UI orchestration / use-case layers

Infrastructure
  ├── src/services/VaultService.ts
  ├── src/services/IndexService.ts
  ├── src/services/AiService.ts
  ├── src/services/TaskLinkService.ts
  └── src/services/TaskReflectionService.ts

DiwaPlugin (main.ts) acts as the composition root that wires the layers together.
```

### Data Model
All thoughts and tasks are individual YAML-fronted markdown files:

**Thought frontmatter:**
```yaml
---
title: "Note title"
created: 2025-01-15 09:30:00
modified: 2025-01-15 09:30:00
day: "[[2025-01-15]]"
area: DIWA
context:
  - work
topic: Meeting
tags:
  - work/Meeting
pinned: false
---
```

**Task frontmatter:**
```yaml
---
title: "Task title"
created: 2025-01-15 09:30:00
modified: 2025-01-15 09:30:00
day: "[[2025-01-15]]"
area: DIWA_TASKS
status: open
due: "[[2025-01-20]]"
context:
  - work
priority: high
energy: medium
recurrence: weekly
---
```

### Reactive Nerve System
Vault events (`create`, `modify`, `delete`, `rename`) and `metadataCache.changed` (for cloud sync reliability) trigger selective re-indexing of the affected file only. `RefreshCoordinator` owns the 400 ms refresh debounce and file-path cooldown, while optimistic UI flags (`_taskTogglePending`, `_capturePending`, etc.) suppress re-renders during interaction.

### State Persistence
UI state that must survive `renderView()` is stored on `DiwaView` fields:
- `tasksViewMode` — active task filter segment
- `synthesisFeedFilter` / `activeSynthesisContexts` / `synthesisShowHidden` — Synthesis panel state
- `chatHistory` / `currentChatFile` / `webSearchEnabled` / `groundedFiles` — AI Chat state
- `calendarViewMonth` / `calendarViewMode` — Calendar state
- `isZenMode` — Zen Mode toggle

---

## Build & Deploy

```bash
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` to your vault's plugin folder:

```
<vault>/.obsidian/plugins/diwa/
```

---

## Settings Reference

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `thoughtsFolder` | `string` | `000 Bin/DIWA` | Folder for thought files |
| `tasksFolder` | `string` | `000 Bin/DIWA Tasks` | Folder for task files |
| `pfFolder` | `string` | `000 Bin/DIWA PF` | Folder for finance/dues files |
| `habitsFolder` | `string` | `000 Bin/DIWA Habits` | Folder for daily habit logs |
| `projectsFolder` | `string` | `Projects` | Folder for project files |
| `reviewsFolder` | `string` | `000 Bin/DIWA Reviews` | Root folder for weekly/monthly/compass review files |
| `voiceMemoFolder` | `string` | `000 Bin/DIWA Voice` | Folder for voice recording clips |
| `attachmentsFolder` | `string` | `000 Bin/DIWA Attachments` | Folder for pasted images and files |
| `peopleFolder` | `string` | `000 Bin/DIWA People` | Folder for people notes |
| `aiChatFolder` | `string` | `000 Bin/DIWA AI Chat` | Folder for saved AI chat sessions |
| `geminiApiKey` | `string` | `''` | Google AI Studio API key (stored masked) |
| `geminiModel` | `string` | `gemini-1.5-pro` | Gemini model ID |
| `maxOutputTokens` | `number` | `65536` | Max tokens per AI response |
| `transcriptionLanguage` | `string` | `English` | Target language for audio transcription |
| `contexts` | `string[]` | `[]` | All registered context tags |
| `hiddenContexts` | `string[]` | `[]` | Contexts hidden from the Synthesis panel |
| `monthlyIncome` | `number` | `0` | Used for the Finance cashflow dashboard |
| `reminderHabitsEnabled` | `boolean` | `true` | Hourly habit reminders |
| `reminderTasksEnabled` | `boolean` | `true` | Hourly task-due reminders |

---

## Tabs Reference

| Tab | File | Description |
|-----|------|-------------|
| Hub Home | `view.ts` / `home` | Primary hub surface — capture, habits, navigation |
| Tasks | `TasksTab.ts` | Tactical Task Ledger with status filters |
| Timeline | `TimelineTab.ts` | Infinite-scroll thought feed |
| Synthesis | `SynthesisTab.ts` | Zero-Inbox context-routing workspace |
| AI Chat | `AiTab.ts` | Gemini chat with vault grounding |
| Voice | `VoiceTab.ts` | Voice recording and transcription |
| Finance | `DuesTab.ts` | Financial dues ledger |
| Finance Analytics | `FinanceAnalyticsTab.ts` | Cashflow and burn-rate dashboard |
| Projects | `ProjectsTab.ts` | Project lifecycle management |
| Habits | `HabitsTab.ts` | Daily habit tracker |
| Journal | `JournalTab.ts` | Keyword-filtered journal feed |
| Weekly Review | `ReviewTab.ts` | AI weekly brief + habit matrix |
| Monthly Review | `MonthlyReviewTab.ts` | Monthly retrospective |
| Compass | `CompassTab.ts` | North Star goals (quarterly) |
| Calendar | `CalendarTab.ts` | Month/week calendar view |
| Timeline (legacy) | `TimelineTab.ts` | Date-based thought navigation |
| Export | `ExportTab.ts` | Data export |
| Manual | `ManualTab.ts` | In-app help (mirrors HelpModal) |
| Settings | `SettingsTab.ts` | Settings tab |

---

## Versioning

Follows `MAJOR.MINOR.PATCH`. See [CHANGELOG.md](./CHANGELOG.md) for full history.
