# ══════════════════════════════════════════════════════════════════════
#  TUI TIME TRACKER — DESIGN MOCKUPS
# ══════════════════════════════════════════════════════════════════════

# ─────────────────────────────────────────────────────
#  CONCEPT: Manual week creation (no auto-creation)
# ─────────────────────────────────────────────────────
#
#  - You explicitly start a week with a command (`:week new` or keybind)
#  - If no active week exists, the tracker view shows an empty state
#  - Past weeks are stored and browsable
#  - Git graphs aggregate across all tracked weeks
#    (gaps where no week exists simply show as empty/gray)


# ═══════════════════════════════════════════════════════════════
#  VIEW 9: Time Tracker — No Active Week (Empty State)
# ═══════════════════════════════════════════════════════════════

┌─ VIEWS ──────┬─ [9] Time Tracker ─────────────────────────────────────────┐
│              │                                                            │
│  1 Timer     │  No active week.                                           │
│  2 Tasks     │                                                            │
│  3 Reminders │  Press  n  to start tracking a new week                    │
│  4 Clock     │  Press  b  to browse past weeks                            │
│  5 Sequences │                                                            │
│  6 Stats     │  Last tracked: Week of Feb 17 (5 days ago)                 │
│  7 Config    │                                                            │
│  8 Web Time  │                                                            │
│▐ 9 Tracker   │                                                            │
│ 10 Graphs    │                                                            │
│              │                                                            │
└──────────────┴────────────────────────────────────────────────────────────┘
■ READY  ● Focus  3h 37m  10 Sessions  16d Streak
j/k:Scroll  n:New Week  b:Browse  ::Cmd  ?:Help  q:Quit


# ═══════════════════════════════════════════════════════════════
#  VIEW 9: Time Tracker — Active Week (Grid View)
# ═══════════════════════════════════════════════════════════════

┌─ VIEWS ──────┬─ [9] Time Tracker ─────────────────────────────────────────┐
│              │                                                            │
│  1 Timer     │  Week of Feb 24          [Today: Tue]      Day 2/7        │
│  2 Tasks     │                                                            │
│  3 Reminders │  Time    Mon   Tue   Wed   Thu   Fri   Sat   Sun          │
│  4 Clock     │  ─────  ────  ────  ────  ────  ────  ────  ────          │
│  5 Sequences │  06:00   S     S      ·     ·     ·     ·     ·           │
│  6 Stats     │  06:30   S     S      ·     ·     ·     ·     ·           │
│  7 Config    │  07:00   S     WU     ·     ·     ·     ·     ·           │
│  8 Web Time  │  07:30   WU    E      ·     ·     ·     ·     ·           │
│▐ 9 Tracker   │  08:00   N     E      ·     ·     ·     ·     ·           │
│ 10 Graphs    │  08:30   N     D      ·     ·     ·     ·     ·           │
│              │  09:00   D     D      ·     ·     ·     ·     ·           │
│              │  09:30   D     D      ·     ·     ·     ·     ·           │
│              │  10:00   D     ½D     ·     ·     ·     ·     ·           │
│              │  10:30   D     W      ·     ·     ·     ·     ·           │
│              │  11:00   W     ▌      ·     ·     ·     ·     ·           │
│              │  11:30   D     ·      ·     ·     ·     ·     ·           │
│              │  12:00   N     ·      ·     ·     ·     ·     ·           │
│              │   ...   ...   ...                                          │
│              │                                                            │
│              │  ── Today ──────────────────────────────────               │
│              │  D: 2.0h  W: 0.5h  S: 3.0h  E: 1.0h  N: 1.0h            │
│              │                                                            │
└──────────────┴────────────────────────────────────────────────────────────┘
■ READY  ● Focus  3h 37m  10 Sessions  16d Streak
j/k:Scroll  e:Edit slot  Tab:Day  d:Day summary  ::Cmd  ?:Help


# ═══════════════════════════════════════════════════════════════
#  VIEW 9: Time Tracker — Editing a slot
# ═══════════════════════════════════════════════════════════════
#
#  Cursor lands on a cell. Press Enter or type a code directly.
#  Color fills in the terminal (ANSI colors).

┌─ [9] Time Tracker ────────────────────────────────────────────┐
│                                                                │
│  Week of Feb 24          [Today: Tue]      Day 2/7            │
│                                                                │
│  Time    Mon   Tue   Wed   Thu   Fri   Sat   Sun              │
│  ─────  ────  ────  ────  ────  ────  ────  ────              │
│  06:00   S     S      ·     ·     ·     ·     ·               │
│  06:30   S     S      ·     ·     ·     ·     ·               │
│  07:00   S     WU     ·     ·     ·     ·     ·               │
│  07:30   WU   [E ]    ·     ·     ·     ·     ·               │
│          ┌──────────────────────────┐                          │
│          │ D  Deep Work      ██    │                          │
│          │ ½D ½ Deep Work    ██    │                          │
│          │ E  Exercise       ██    │   ← popup selector       │
│          │ O  Okayish        ██    │     (j/k to pick,        │
│          │ S  Sleep          ██    │      Enter to set,        │
│          │ N  No Deep Work   ██    │      or type code)        │
│          │ W  Wasted         ██    │                          │
│          │ SF Sched. Failed  ██    │                          │
│          │ WU Woke Up        ██    │                          │
│          └──────────────────────────┘                          │
│                                                                │
└────────────────────────────────────────────────────────────────┘
e/Enter:Select  j/k:Navigate  Esc:Cancel  D/W/S/E:Quick set


# ═══════════════════════════════════════════════════════════════
#  VIEW 9: Time Tracker — Colored grid (what it actually looks like)
# ═══════════════════════════════════════════════════════════════
#
#  In the terminal, cells get ANSI background colors.
#  Here's a text approximation:

  Time    Mon   Tue   Wed   Thu   Fri   Sat   Sun
  ─────  ────  ────  ────  ────  ────  ────  ────
  06:00  ░░S░  ░░S░   ·     ·     ·     ·     ·      ← indigo (sleep)
  06:30  ░░S░  ░░S░   ·     ·     ·     ·     ·
  07:00  ░░S░  ▓WU▓   ·     ·     ·     ·     ·      ← purple (woke up)
  07:30  ▓WU▓  ██E█   ·     ·     ·     ·     ·      ← green (exercise)
  08:00  ░░N░  ██E█   ·     ·     ·     ·     ·      ← gray (no deep work)
  08:30  ░░N░  ██D█   ·     ·     ·     ·     ·      ← teal (deep work)
  09:00  ██D█  ██D█   ·     ·     ·     ·     ·
  09:30  ██D█  ██D█   ·     ·     ·     ·     ·
  10:00  ██D█  ▒½D▒   ·     ·     ·     ·     ·      ← light teal (½ deep)
  10:30  ██D█  ▒▒W▒   ·     ·     ·     ·     ·      ← red (wasted)
  11:00  ▒▒W▒   ·     ·     ·     ·     ·     ·
  11:30  ██D█   ·     ·     ·     ·     ·     ·
  12:00  ░░N░   ·     ·     ·     ·     ·     ·

  Color key:  ██ Deep  ▒▒ Wasted  ░░ Sleep  ▓▓ Exercise  ·· Empty


# ═══════════════════════════════════════════════════════════════
#  VIEW 9: Time Tracker — Day Summary (press 'd')
# ═══════════════════════════════════════════════════════════════

┌─ [9] Time Tracker ─── Day Summary ────────────────────────────┐
│                                                                │
│  Monday, Feb 24                                                │
│                                                                │
│  Deep Work     ████████████████░░░░░░░░░░  3.5h               │
│  Wasted        ████░░░░░░░░░░░░░░░░░░░░░░  1.0h               │
│  Sleep         ██████████████████░░░░░░░░  4.5h  (06:00-08:30)│
│  Exercise      ░░░░░░░░░░░░░░░░░░░░░░░░░░  0.0h               │
│  No Deep Work  ██████░░░░░░░░░░░░░░░░░░░░  1.5h               │
│  Okayish       ████░░░░░░░░░░░░░░░░░░░░░░  1.0h               │
│                                                                │
│  Total tracked: 11.5h / 18h                                    │
│  Deep Work ratio: 30.4%                                        │
│  Wasted ratio: 8.7%                                            │
│                                                                │
│  Notes: _______________                   (press 'a' to add)   │
│                                                                │
└────────────────────────────────────────────────────────────────┘


# ═══════════════════════════════════════════════════════════════
#  VIEW 9: Time Tracker — Week Summary (press 'w')
# ═══════════════════════════════════════════════════════════════

┌─ [9] Time Tracker ─── Week Summary ───────────────────────────┐
│                                                                │
│  Week of Feb 24                                                │
│                                                                │
│         Mon  Tue  Wed  Thu  Fri  Sat  Sun  │ Total             │
│  ─────  ───  ───  ───  ───  ───  ───  ───  ┤ ─────             │
│  Deep   3.5  2.0   ·    ·    ·    ·    ·   │  5.5h             │
│  Waste  1.0  0.5   ·    ·    ·    ·    ·   │  1.5h             │
│  Sleep  4.5  3.0   ·    ·    ·    ·    ·   │  7.5h             │
│  Exer   0.0  1.0   ·    ·    ·    ·    ·   │  1.0h             │
│  Other  2.5  1.0   ·    ·    ·    ·    ·   │  3.5h             │
│                                                                │
│  DW/Waste ratio: 3.7x  ✓ good                                 │
│  Avg deep work: 2.75h/day                                      │
│                                                                │
└────────────────────────────────────────────────────────────────┘


# ═══════════════════════════════════════════════════════════════
#  VIEW 10: Graphs — Main (git-style contribution graphs)
# ═══════════════════════════════════════════════════════════════

┌─ VIEWS ──────┬─ [10] Graphs ──────────────────────────────────────────────┐
│              │                                                             │
│  1 Timer     │  Exercise  Deep Work  Writing  All                         │
│  2 Tasks     │  ─────────────────────────────────                         │
│  3 Reminders │                                                             │
│  4 Clock     │  ── Exercise ─────────────────────────────────────          │
│  5 Sequences │                                                             │
│  6 Stats     │       Jan                Feb                  Mar          │
│  7 Config    │  Mon  ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░               │          │
│  8 Web Time  │  Tue  ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░               │          │
│  9 Tracker   │  Wed  ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░               │          │
│▐10 Graphs    │  Thu  ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░               │          │
│              │  Fri  ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░               │          │
│              │  Sat  ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░               │          │
│              │  Sun  ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░               │          │
│              │                                                             │
│              │  less ░ ▒ ▓ █ more        Total: 0h  Streak: 0d           │
│              │                                                             │
│              │  No exercise tracked yet. Start a week to begin.           │
│              │                                                             │
└──────────────┴─────────────────────────────────────────────────────────────┘


# ═══════════════════════════════════════════════════════════════
#  VIEW 10: Graphs — With Data (Exercise)
# ═══════════════════════════════════════════════════════════════

┌─ [10] Graphs ──────────────────────────────────────────────────┐
│                                                                 │
│  Exercise  Deep Work  Writing  All                              │
│  ─────────────────────────────────                              │
│                                                                 │
│  ── Exercise ──────────────────────────────────────             │
│                                                                 │
│       Jan                Feb                                    │
│  Mon  ░ ░ ▓ ░ ░ ░ █ ░ ▓ ░ ░ █ ░                               │
│  Tue  ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░                               │
│  Wed  ░ ▓ ░ █ ░ ▓ ░ █ ░ ▓ ░ █ ░                               │
│  Thu  ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░                               │
│  Fri  ░ █ ░ ░ █ ░ ░ █ ░ ░ █ ░ ░                               │
│  Sat  █ ░ █ ░ █ ░ █ ░ █ ░ █ ░ █                               │
│  Sun  ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░                               │
│                                                                 │
│  less ░ ▒ ▓ █ more       Total: 22h  Streak: 3d  Best: 12d    │
│                                                                 │
│  This week: 3/7 days  │  Last week: 4/7 days                   │
│  Avg duration: 1.1h   │  Most common: Sat (100%)               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
Tab:Switch graph  t:Today  w:Week  m:Month  y:Year  ?:Help


# ═══════════════════════════════════════════════════════════════
#  VIEW 10: Graphs — Deep Work
# ═══════════════════════════════════════════════════════════════

┌─ [10] Graphs ──────────────────────────────────────────────────┐
│                                                                 │
│  Exercise  Deep Work  Writing  All                              │
│           ──────────                                            │
│                                                                 │
│  ── Deep Work ─────────────────────────────────────             │
│                                                                 │
│       Jan                Feb                                    │
│  Mon  ▒ ▓ █ ▓ ▒ ░ █ ▓ █ ▒   █                                 │
│  Tue  ▒ ▓ ░ ▓ █ ░ ▓ █ ▓ ▒ ▒ ▓                                 │
│  Wed  ░ ▓ ▓ █ ▓ ▓ ░ █ ▓ ░   ·                                 │
│  Thu  ▒ ░ ▓ ▓ ▒ ▓ ▓ ░ █ ▓   ·                                 │
│  Fri  ░ ▒ ░ ▓ ░ ▒ ▓ ▒ ░ ▒   ·                                 │
│  Sat  ░ ░ ░ ░ ░ ░ ░ ░ ▒ ░   ·                                 │
│  Sun  ░ ░ ░ ░ ░ ░ ░ ░ ░ ░   ·                                 │
│                                                                 │
│  less ░ ▒ ▓ █ more                                              │
│       0h 1h 3h 5h+                                              │
│                                                                 │
│  Total: 87.5h  │  Avg: 2.8h/day  │  Best day: 6.5h (Jan 28)   │
│  This week: 5.5h (2 days tracked)                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘


# ═══════════════════════════════════════════════════════════════
#  VIEW 10: Graphs — Gaps where weeks weren't tracked
# ═══════════════════════════════════════════════════════════════
#
#  This is critical — since you manually create weeks,
#  untracked periods just show as empty (·) not zero (░)

       Jan                Feb
  Mon  ▓ █ ▓ · · · █ ▓ █ ▒   █
  Tue  ▓ ▓ ░ · · · ▓ █ ▓ ▒ ▒ ▓
  Wed  ░ ▓ ▓ · · · ░ █ ▓ ░   ·      ← no data yet
  Thu  ▒ ░ ▓ · · · ▓ ░ █ ▓   ·         (future)
  Fri  ░ ▒ ░ · · · ▓ ▒ ░ ▒   ·
  Sat  ░ ░ ░ · · · ░ ░ ▒ ░   ·
  Sun  ░ ░ ░ · · · ░ ░ ░ ░   ·
              ^^^^^
              gap — you didn't create a week here
              shown as · (dot) not ░ (zero)

  Legend:  · not tracked  ░ 0h  ▒ low  ▓ medium  █ high


# ═══════════════════════════════════════════════════════════════
#  VIEW 10: Graphs — "All" combined overview
# ═══════════════════════════════════════════════════════════════

┌─ [10] Graphs ─── All ─────────────────────────────────────────┐
│                                                                │
│  Exercise  Deep Work  Writing  All                             │
│                                ───                             │
│                                                                │
│  ── Deep Work ────────────────────────     87.5h total         │
│  Mon ▒ ▓ █ ▓ ▒ ░ █ ▓ █ ▒   █                                  │
│  ... (compressed 2-row view)                                   │
│  Sun ░ ░ ░ ░ ░ ░ ░ ░ ░ ░   ·                                  │
│                                                                │
│  ── Exercise ─────────────────────────     22.0h total         │
│  Mon ░ ░ ▓ ░ ░ ░ █ ░ ▓ ░   █                                  │
│  ...                                                           │
│  Sun ░ ░ ░ ░ ░ ░ ░ ░ ░ ░   ·                                  │
│                                                                │
│  ── Writing ──────────────────────────     4.5h total          │
│  Mon ░ ░ ░ ░ ░ ░ ░ ░ ▒ ░   ·                                  │
│  ...                                                           │
│  Sun ░ ░ ░ ░ ░ ░ ░ ░ ░ ░   ·                                  │
│                                                                │
│  Tracking since: Jan 6  │  Weeks tracked: 6/8  │  75%         │
│                                                                │
└────────────────────────────────────────────────────────────────┘


# ═══════════════════════════════════════════════════════════════
#  VIEW 10: Graphs — Stats sub-view (Today / Week / Project)
# ═══════════════════════════════════════════════════════════════
#
#  This mirrors your existing Stats view [6] but for the tracker

┌─ [10] Graphs ─── Stats ───────────────────────────────────────┐
│                                                                │
│  Today  Week  Month  Year                                      │
│  ─────                                                         │
│                                                                │
│  Tuesday, Feb 25                                               │
│                                                                │
│  Deep Work   ████████████░░░░░░░░  2.0h                       │
│  Exercise    ████████░░░░░░░░░░░░  1.0h                       │
│  Wasted      ███░░░░░░░░░░░░░░░░░  0.5h                       │
│  Sleep       ██████░░░░░░░░░░░░░░  3.0h                       │
│  Other       █████░░░░░░░░░░░░░░░  1.0h                       │
│                                                                │
│  Productive: 3.0h (40%)  │  Wasted: 0.5h (7%)                 │
│  DW/Waste: 4.0x ✓                                              │
│                                                                │
└────────────────────────────────────────────────────────────────┘

# Pressing 'w' for Week view:

┌─ [10] Graphs ─── Stats ───────────────────────────────────────┐
│                                                                │
│  Today  Week  Month  Year                                      │
│         ────                                                   │
│                                                                │
│  Week of Feb 24                                                │
│                                                                │
│  Mon   ██████████░░░░░░  3.5h deep  │  1.0h waste             │
│  Tue   ████████░░░░░░░░  2.0h deep  │  0.5h waste             │
│  Wed   · not tracked                                           │
│  Thu   · not tracked                                           │
│  Fri   · not tracked                                           │
│  Sat   · not tracked                                           │
│  Sun   · not tracked                                           │
│                                                                │
│  Week total: 5.5h deep  │  1.5h waste  │  DW/W: 3.7x         │
│  On pace for: 19.25h/week (if maintained)                      │
│                                                                │
└────────────────────────────────────────────────────────────────┘


# ═══════════════════════════════════════════════════════════════
#  KEYBINDINGS SUMMARY
# ═══════════════════════════════════════════════════════════════
#
#  View 9 (Tracker):
#    n       — Create new week (starts from current Monday)
#    b       — Browse past weeks (j/k to navigate)
#    e/Enter — Edit current slot (opens category picker)
#    D/W/S/E — Quick-set: type code directly on highlighted cell
#    ½       — Set ½ Deep Work
#    Tab     — Jump between days
#    d       — Day summary panel
#    w       — Week summary panel
#    j/k     — Scroll time slots
#    h/l     — Move between days
#    .       — Clear slot
#
#  View 10 (Graphs):
#    Tab     — Cycle: Exercise → Deep Work → Writing → All
#    t       — Today stats
#    w       — Week stats
#    m       — Month stats
#    y       — Year view
#    s       — Toggle stats sub-view
#    j/k     — Scroll
#
#
# ═══════════════════════════════════════════════════════════════
#  DATA STORAGE SUGGESTION
# ═══════════════════════════════════════════════════════════════
#
#  ~/.config/yourapp/tracker/
#  ├── weeks/
#  │   ├── 2026-W09.json        ← Week of Feb 24
#  │   ├── 2026-W08.json        ← Week of Feb 17
#  │   └── ...
#  └── meta.json                ← settings, categories, colors
#
#  Each week file:
#  {
#    "week": "2026-W09",
#    "start": "2026-02-24",
#    "slots": {
#      "2026-02-24": {
#        "06:00": "S", "06:30": "S", "07:00": "S",
#        "07:30": "WU", "08:00": "N", "08:30": "D",
#        "09:00": "D", ...
#      },
#      "2026-02-25": { ... }
#    },
#    "notes": {
#      "2026-02-24": "good focus morning, fell off after lunch"
#    }
#  }
#
#  Git graphs are computed by scanning all week files.
#  No week file = gap (·). Week file with no entry for a day = zero (░).
