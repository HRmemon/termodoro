#!/usr/bin/env python3
"""Daily productivity report — sent to WhatsApp at 3 AM."""

import argparse
import json
import os
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

DATA_DIR = Path.home() / ".local/share/pomodorocli"
REPORT_PHONE = os.environ.get("REPORT_PHONE", "923033792612")


def yesterday() -> str:
    return (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")


def total_browsing_time(date: str) -> float:
    db = DATA_DIR / "browser.db"
    if not db.exists():
        return 0.0
    conn = sqlite3.connect(str(db))
    row = conn.execute(
        "SELECT COALESCE(SUM(active_seconds), 0) FROM browser_daily_usage WHERE date = ?",
        (date,),
    ).fetchone()
    conn.close()
    return row[0] / 3600


def top_domains(date: str, n: int = 7) -> list[dict]:
    db = DATA_DIR / "browser.db"
    if not db.exists():
        return []
    conn = sqlite3.connect(str(db))
    rows = conn.execute(
        """SELECT domain, active_seconds, audible_seconds
           FROM browser_daily_usage WHERE date = ?
           ORDER BY active_seconds DESC LIMIT ?""",
        (date, n),
    ).fetchall()
    conn.close()
    return [
        {"domain": r[0], "active_m": round(r[1] / 60, 1), "audible_m": round(r[2] / 60, 1)}
        for r in rows
    ]


SOCIAL_DOMAINS = {"www.youtube.com", "www.instagram.com", "www.reddit.com", "www.facebook.com"}


def page_paths(date: str, domain: str) -> list[dict]:
    db = DATA_DIR / "browser.db"
    if not db.exists():
        return []
    conn = sqlite3.connect(str(db))
    rows = conn.execute(
        """SELECT path, COUNT(*) AS visits, SUM(duration_sec) AS total_sec
           FROM page_visits
           WHERE domain = ? AND date(recorded_at) = ?
           GROUP BY path ORDER BY total_sec DESC LIMIT 10""",
        (domain, date),
    ).fetchall()
    conn.close()
    return [{"path": r[0], "visits": r[1], "total_m": round(r[2] / 60, 1)} for r in rows]


def social_summary(date: str, domain: str) -> str:
    """Compact summary for social media domains (not YouTube)."""
    db = DATA_DIR / "browser.db"
    if not db.exists():
        return ""
    conn = sqlite3.connect(str(db))
    rows = conn.execute(
        """SELECT path, SUM(duration_sec) AS total_sec, COUNT(*) AS visits
           FROM page_visits
           WHERE domain = ? AND date(recorded_at) = ?
           GROUP BY path""",
        (domain, date),
    ).fetchall()
    conn.close()
    if not rows:
        return ""
    total_visits = sum(r[2] for r in rows)

    if domain == "www.reddit.com":
        post_rows = [r for r in rows if "/comments/" in r[0]]
        browse_rows = [r for r in rows if r[0] not in ("/", "/media") and "/comments/" not in r[0]]
        post_m = round(sum(r[1] / 60 for r in post_rows), 1)
        browse_m = round(sum(r[1] / 60 for r in browse_rows), 1)
        parts = []
        if post_rows:
            parts.append(f"{len(post_rows)} posts ({fmt_time(post_m)})")
        if browse_rows:
            parts.append(f"{len(browse_rows)} pages ({fmt_time(browse_m)})")
        parts.append(f"{total_visits} clicks")
        return f"  {' · '.join(parts)}"
    else:
        return f"  {len(rows)} pages, {total_visits} clicks"


def youtube_times(date: str) -> dict:
    """
    Returns {
        "visual_m": float,      # time YouTube was active+focused tab
        "background_m": float,  # audio playing while YouTube NOT active/focused
        "videos": [dict]        # per-video audio breakdown (total, visual+bg)
    }
    """
    db = DATA_DIR / "browser.db"
    if not db.exists():
        return {"visual_m": 0, "audio_m": 0, "videos": []}

    dt = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    day_start_ms = int(dt.timestamp() * 1000)
    day_end_ms = day_start_ms + 86400000
    window_start = day_start_ms - 86400000
    window_end = day_end_ms + 86400000

    conn = sqlite3.connect(str(db))
    rows = conn.execute(
        """SELECT timestamp, payload FROM browser_events_log
           WHERE timestamp >= ? AND timestamp < ?
           ORDER BY timestamp ASC""",
        (window_start, window_end),
    ).fetchall()
    conn.close()

    yt_active = False    # youtube.com is active tab AND window focused
    yt_audible = False   # youtube.com /watch tab is in audibleTabs
    prev_ts: int | None = None
    visual_ms = 0
    background_ms = 0
    audio_sessions: dict[str, dict] = {}  # url -> {video_id, title, ms}
    completed_audio: list[dict] = []

    for ts, payload_bytes in rows:
        p = json.loads(payload_bytes)
        event_type = p.get("trigger", "")
        at = p.get("activeTab")
        focused = p.get("windowFocused", False)
        audible_tabs = p.get("audibleTabs", [])

        # Visual state: updated by ALL events
        now_yt_active = bool(at and at.get("domain") == "www.youtube.com" and focused)

        # Audio state: only audible_change events reliably indicate audio start/stop
        is_audio_event = event_type == "audible_change"

        # Attribute time since previous event (day-clipped)
        if prev_ts is not None:
            seg_start = max(prev_ts, day_start_ms)
            seg_end = min(ts, day_end_ms)
            if seg_end > seg_start:
                seg_ms = seg_end - seg_start
                if yt_active:
                    visual_ms += seg_ms
                if yt_audible:
                    if not yt_active:
                        background_ms += seg_ms
                    for sess in list(audio_sessions.values()):
                        sess["ms"] = sess.get("ms", 0) + seg_ms

        # Per-video session management: ONLY from audible_change events
        if is_audio_event:
            yt_watch_tabs = [
                t for t in audible_tabs
                if t.get("domain") == "www.youtube.com" and t.get("path") == "/watch"
            ]
            now_yt_audible = len(yt_watch_tabs) > 0

            audible_urls = {t["url"] for t in yt_watch_tabs}
            for url in list(audio_sessions.keys()):
                if url not in audible_urls:
                    completed_audio.append(audio_sessions.pop(url))
            for t in yt_watch_tabs:
                if t["url"] not in audio_sessions:
                    video_id = "???"
                    vi = t["url"].find("v=")
                    if vi >= 0:
                        after_v = t["url"][vi + 2:]
                        amp = after_v.find("&")
                        video_id = after_v[:amp] if amp >= 0 else after_v
                    audio_sessions[t["url"]] = {
                        "video_id": video_id,
                        "title": t.get("title", "") or "",
                        "ms": 0,
                    }

        yt_active = now_yt_active
        if is_audio_event:
            yt_audible = now_yt_audible
        prev_ts = ts

    # Build per-video summary
    video_ms: dict[str, int] = {}
    video_titles: dict[str, str] = {}
    for sess in completed_audio + list(audio_sessions.values()):
        ms = sess["ms"]
        if ms > 1000:
            vid = sess["video_id"]
            video_ms[vid] = video_ms.get(vid, 0) + ms
            title = sess["title"]
            if title and "youtube.com" not in title.lower() and vid not in video_titles:
                video_titles[vid] = title

    sorted_vids = sorted(video_ms.items(), key=lambda x: -x[1])
    videos = []
    for vid, ms in sorted_vids:
        title = video_titles.get(vid) or f"Video {vid}"
        videos.append({"video_id": vid, "title": title[:60], "total_m": round(ms / 60000, 1)})

    return {
        "visual_m": round(visual_ms / 60000, 1),
        "background_m": round(background_ms / 60000, 1),
        "videos": videos,
    }


def pomodoro_sessions(date: str) -> dict:
    db = DATA_DIR / "sessions.db"
    if not db.exists():
        return {"count": 0, "total_min": 0, "list": []}
    conn = sqlite3.connect(str(db))
    rows = conn.execute(
        """SELECT type, status, label, duration_planned, duration_actual
           FROM sessions WHERE date(started_at) = ?
           ORDER BY started_at""",
        (date,),
    ).fetchall()
    conn.close()
    return {
        "count": len(rows),
        "total_min": round(sum(r[4] for r in rows) / 60, 1),
        "list": [
            {"type": r[0], "status": r[1], "label": r[2] or "",
             "planned": round(r[3] / 60), "actual": round(r[4] / 60)}
            for r in rows
        ],
    }


def fmt_time(m: float) -> str:
    if m >= 60:
        return f"{m/60:.1f}h"
    if m >= 1:
        return f"{m:.0f}m"
    return "<1m"


def build_report(date: str) -> str:
    total_hrs = total_browsing_time(date)
    domains = top_domains(date)
    pomo = pomodoro_sessions(date)
    lines: list[str] = []
    dow = datetime.strptime(date, "%Y-%m-%d").strftime("%A")

    lines.append(f"📊 {date} ({dow})")
    lines.append("")

    # Focus
    lines.append("⏱ Focus")
    if pomo["count"] > 0:
        completed = sum(1 for s in pomo["list"] if s["status"] == "completed")
        lines.append(f"  {pomo['count']} sessions · {pomo['total_min']}m total · {completed} completed")
        for s in pomo["list"]:
            label = f" — {s['label']}" if s["label"] else ""
            lines.append(f"  {s['type']} {s['actual']}/{s['planned']}m {s['status']}{label}")
    else:
        lines.append("  No sessions logged")
    lines.append("")

    # Web
    lines.append("🌐 Web")
    lines.append(f"  Total: {fmt_time(total_hrs * 60)}")
    lines.append("")

    yt = youtube_times(date) if any(d["domain"] == "www.youtube.com" for d in domains) else None

    for i, d in enumerate(domains):
        lines.append("—" * 25)

        if d["domain"] == "www.youtube.com" and yt:
            lines.append(f"👁 {fmt_time(yt['visual_m'])}  🎧 {fmt_time(yt['background_m'])}  youtube.com")
            for v in yt["videos"]:
                    t = v["title"]
                    if len(t) > 35:
                        t = t[:32] + "..."
                    lines.append(f"▸ {fmt_time(v['total_m'])} {t}")
        elif d["domain"] in SOCIAL_DOMAINS:
            time_str = fmt_time(d["active_m"])
            aud_str = f" 🔊{fmt_time(d['audible_m'])}" if d["audible_m"] > 0 else ""
            lines.append(f"{time_str}{aud_str} {d['domain'].removeprefix('www.')}")
            summary = social_summary(date, d["domain"])
            if summary:
                lines.append(summary)
        else:
            time_str = fmt_time(d["active_m"])
            aud_str = f" 🔊{fmt_time(d['audible_m'])}" if d["audible_m"] > 0 else ""
            lines.append(f"{time_str}{aud_str} {d['domain'].removeprefix('www.')}")

    return "\n".join(lines)


def send_whatsapp(phone: str, text: str) -> None:
    lib = str(Path.home() / "python_programs/libraries")
    sys.path.insert(0, lib)
    import whatsapp

    print(f"\nSending to {phone}...")
    result = whatsapp.send_message(phone, text, persistent=True)
    print(f"Sent: {result}")
    whatsapp.close()


def main():
    parser = argparse.ArgumentParser(description="Daily productivity report")
    parser.add_argument("--send", action="store_true", help="Send via WhatsApp")
    parser.add_argument("--date", default=None, help="YYYY-MM-DD")
    parser.add_argument("--phone", default=REPORT_PHONE)
    args = parser.parse_args()

    date = args.date or yesterday()
    report = build_report(date)

    print(report)

    if args.send:
        is_tty = sys.stdin.isatty()
        if is_tty:
            print("─" * 40)
            confirm = input("Send? (y/N): ").strip().lower()
            if confirm != "y":
                print("Cancelled.")
                return
        send_whatsapp(args.phone, report)


if __name__ == "__main__":
    main()
