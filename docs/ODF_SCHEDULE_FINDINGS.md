# ODF XML Schedule Data – Findings

## Summary
ODF XML **does** contain schedule-like data that can be used to auto-update the OBS event list. It does **not** contain broadcast-specific fields (channels, Tx run-up, video feed, etc.).

---

## ODF Schedule Message Types

| Message | Provider | Description |
|---------|----------|-------------|
| **DT_SCHEDULE** | Central | Full competition schedule (bulk), sent before Games |
| **DT_SCHEDULE_UPDATE** | OVR (venue) | Incremental updates when schedule changes |

Both use the same structure: `Competition` → `Session` (optional) → `Unit`. Each **Unit** is one event/session.

---

## ODF Unit Fields vs schedule.csv

| schedule.csv | ODF Unit / Session | Notes |
|--------------|-------------------|-------|
| Es Code | Unit `@Code` | e.g. C06-MCF.2, SBD18 |
| Title | Unit `ItemName` | Event name |
| Es Date | Unit `StartDate` | ISO date-time |
| Es Start Time | Unit `StartDate` | ISO includes time |
| Es End Time | Unit `EndDate` | ISO includes time |
| Es Venue | Unit `VenueDescription/VenueName` or Session `Venue` | Venue name |
| Fields of Play | Unit `Location` or `VenueDescription/LocationName` | Sheet/court |
| Es is Finals | Unit `Medal` | Medal session flag |

### Fields ODF does **not** have (broadcast-only)
- `ChannelName`, `Tx Start/End Time`, `Tx Run Up/Out`
- `VideoFeed`, `Source`, `Original Source`
- `Coverage Start/End`, `As Run Start/End`
- `Id` (CBC row ID) – use Unit `Code` instead

---

## Where Schedule XML Files Live on M:

From the codebase and ODF docs:

1. **Per-sport folders**  
   `M:\Incoming\{SPORT}\YYYY-MM-DD\HH\`  
   - `DT_SCHEDULE_UPDATE` appears in SBD (and likely other sports) in their date/hour folders.  
   - Current code: [backend/index.js](backend/index.js) line 857 – `listSBDScheduleFiles` finds `DT_SCHEDULE_UPDATE` in SBD holder paths only.

2. **GEN folder**  
   `M:\Incoming\GEN\`  
   - Central (non-sport) data. DT_SCHEDULE bulk messages are typically from Central, so GEN may hold full-schedule XML.  
   - Worth scanning for `DT_SCHEDULE` and `DT_SCHEDULE_UPDATE`.

3. **OBS folder**  
   `M:\Incoming\OBS\`  
   - Broadcast-related; may have schedule or derived schedule exports.  
   - Worth scanning for any schedule-like XML.

4. **Other skipped folders**  
   `IOC`, `OLV`, `PCO`, `ART`, `CER` – less likely to contain competition schedule; lower priority.

---

## Event Format Compatibility

`transformRow` requires: `id`, `date`, `txStartTime`, `txEndTime`. ODF mapping:

- `id` ← Unit `@Code`
- `date` ← `StartDate` (date part)
- `txStartTime` / `txEndTime` ← `StartDate` / `EndDate` (time parts)
- `title` ← `ItemName`

Broadcast fields (`channelName`, `txType`, etc.) can be defaulted (e.g. `''`).

---

## Suggested Implementation

1. **Scan for schedule XML**
   - GEN: `M:\Incoming\GEN\` (and subdirs if any)
   - OBS: `M:\Incoming\OBS\`
   - Sport folders: IHO, CUR, SBD, SSK, STK, LUG, FRS, etc., under `M:\Incoming\{SPORT}\YYYY-MM-DD\HH\`
   - Look for: `DT_SCHEDULE`, `DT_SCHEDULE_UPDATE`

2. **Generic ODF schedule parser**
   - Parse `Competition` → `Session` → `Unit`
   - Extract: `Code`, `ItemName`, `StartDate`, `EndDate`, `VenueDescription`, `Location`, `Medal`
   - Map to the event format used by the app (including required CSV-like fields above)

3. **Deduplication**
   - Use Unit `@Code` as key
   - Prefer newer `DT_SCHEDULE_UPDATE` over older data when the same unit appears multiple times

4. **Merge with CSV (optional)**
   - If CSV is still manually maintained for broadcast metadata, merge ODF-derived events with CSV rows by Unit Code / Es Code where possible.

---

## Implementation (ODF Schedule Merge)

### Overview
The backend merges ODF schedule updates into the CSV-loaded events **by Es Code** (or VideoFeed). Broadcast metadata (Id, ChannelName, Tx times) stays from the CSV; event timing (Es Start/End, Es Date, Title, Es Venue) is updated from ODF.

### Behaviour
- **Runs hourly** (configurable via `ODF_SCHEDULE_MERGE_INTERVAL_MIN`).
- **First run** 2 minutes after startup.
- **Lightweight scan**: Only the newest `YYYY-MM-DD` + newest `HH` folder per sport (plus GEN/OBS root). Max 5 files per folder.
- **Match key**: `Es Code` or `VideoFeed` in CSV row → Unit `@Code` in ODF.
- **Merge**: Updates `rawData` and `event.title`; preserves `id`, channel, Tx times.

### Env vars
| Variable | Default | Description |
|----------|---------|-------------|
| `ODF_SCHEDULE_MERGE_ENABLED` | `true` | Set to `false` to disable. |
| `ODF_SCHEDULE_MERGE_INTERVAL_MIN` | `60` | Minutes between runs. |
| `INCOMING_BASE` | `M:\Incoming` | Base path for M: drive. |

### Supabase sync (base + updates)
- Base: Deployed API always loads from bundled `schedule.csv` or `events.json`.
- Updates: `obs_schedule_updates` table stores ODF merge deltas only (`id='default'`, `updates` JSONB keyed by Es Code).
- Backend pushes to Supabase when ODF merge runs (not on CSV load). Smaller payload, faster fetch.
- Deployed API loads base, fetches updates from Supabase, applies updates over base, returns merged.
- Run `supabase-obs-schedule-updates.sql` to create the table.

### Files
- `backend/index.js`: `runOdfScheduleMerge`, `pushScheduleUpdatesToSupabase`, `collectOdfScheduleUnits`, `mergeOdfScheduleIntoEvents`
