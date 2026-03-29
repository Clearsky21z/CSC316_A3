#!/usr/bin/env python3

"""Build a lightweight Leverkusen 2023/24 invincible-season dataset for the D3 app."""

from __future__ import annotations

import json
import math
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "leverkusen_data"
OUTPUT_PATH = ROOT / "docs" / "data" / "leverkusen_progression_2023_24.json"

TEAM_NAME = "Bayer Leverkusen"
COMPETITION_ID = 9
SEASON_ID = 281
OPEN_PLAY_PATTERNS = {"Regular Play", "From Counter"}


STORIES = [
    {
        "id": "leipzig-90",
        "title": "90' winner in Leipzig",
        "description": "A late set-piece winner turned a 2-2 draw into three points and kept the unbeaten run charging forward.",
        "filters": {
            "match_id": 3895202,
            "player": "all",
            "pass_type": "box",
            "phase": "all",
            "outcome": "all",
            "minute_range": [0, 96],
        },
        "focus_pass_id": "58c19c72-b159-4ecf-89a0-ea16305c7111",
    },
    {
        "id": "hoffenheim-comeback",
        "title": "Late comeback vs Hoffenheim",
        "description": "Down 0-1 into the final minutes, Leverkusen scored twice after the 85th minute to save the streak at home.",
        "filters": {
            "match_id": 3895286,
            "player": "all",
            "pass_type": "box",
            "phase": "open",
            "outcome": "all",
            "minute_range": [0, 96],
        },
        "focus_pass_id": "30d6c3c7-e049-4dca-b7ad-2c01e55397ad",
    },
    {
        "id": "dortmund-96",
        "title": "96' equalizer in Dortmund",
        "description": "A stoppage-time equalizer in Matchday 30 preserved the zero in the loss column deep into the spring run-in.",
        "filters": {
            "match_id": 3895309,
            "player": "all",
            "pass_type": "box",
            "phase": "all",
            "outcome": "all",
            "minute_range": [0, 96],
        },
        "focus_pass_id": "dacc4575-ffac-4df6-923d-201e99bf8adb",
    },
]


def load_matches() -> list[dict]:
    matches_path = DATA_DIR / "matches" / str(COMPETITION_ID) / f"{SEASON_ID}.json"
    matches = json.loads(matches_path.read_text())
    season_matches = []
    for match in matches:
        home = match["home_team"]["home_team_name"]
        away = match["away_team"]["away_team_name"]
        if TEAM_NAME not in {home, away}:
            continue
        venue = "Home" if home == TEAM_NAME else "Away"
        opponent = away if home == TEAM_NAME else home
        date_label = datetime.strptime(match["match_date"], "%Y-%m-%d").strftime("%b %-d")
        scoreline = f"{match['home_score']}-{match['away_score']}"
        season_matches.append(
            {
                "match_id": match["match_id"],
                "date": match["match_date"],
                "date_label": date_label,
                "venue": venue,
                "opponent": opponent,
                "home_team": home,
                "away_team": away,
                "home_score": match["home_score"],
                "away_score": match["away_score"],
                "scoreline": scoreline,
                "label": f"{date_label} {'vs' if venue == 'Home' else '@'} {opponent} ({scoreline})",
            }
        )
    return sorted(season_matches, key=lambda match: match["date"])


def analyze_match(match: dict) -> dict:
    events = json.loads((DATA_DIR / "events" / f"{match['match_id']}.json").read_text())
    goals = []
    for event in events:
        if event.get("type", {}).get("name") != "Shot":
            continue
        if event.get("shot", {}).get("outcome", {}).get("name") != "Goal":
            continue
        is_leverkusen = event.get("team", {}).get("name") == TEAM_NAME
        goals.append(
            {
                "minute": event.get("minute"),
                "second": event.get("second"),
                "team": event.get("team", {}).get("name"),
                "is_leverkusen": is_leverkusen,
                "player": event.get("player", {}).get("name"),
            }
        )

    goals.sort(key=lambda goal: (goal["minute"], goal["second"]))

    lev_goals = match["home_score"] if match["home_team"] == TEAM_NAME else match["away_score"]
    opp_goals = match["away_score"] if match["home_team"] == TEAM_NAME else match["home_score"]
    result = "W" if lev_goals > opp_goals else "D" if lev_goals == opp_goals else "L"
    points = 3 if result == "W" else 1 if result == "D" else 0

    lev_score = 0
    opp_score = 0
    trailed = False
    late_goal = False
    late_points_saved = 0
    last_lev_goal_minute = None

    for goal in goals:
        before_score = (lev_score, opp_score)
        if goal["is_leverkusen"]:
            lev_score += 1
            last_lev_goal_minute = goal["minute"]
        else:
            opp_score += 1
        after_score = (lev_score, opp_score)

        if lev_score < opp_score:
            trailed = True

        if goal["is_leverkusen"] and goal["minute"] >= 80:
            late_goal = True
            before_points = 3 if before_score[0] > before_score[1] else 1 if before_score[0] == before_score[1] else 0
            after_points = 3 if after_score[0] > after_score[1] else 1 if after_score[0] == after_score[1] else 0
            if after_points > before_points:
                late_points_saved += after_points - before_points

    return {
        "result": result,
        "points": points,
        "goal_difference": lev_goals - opp_goals,
        "clean_sheet": opp_goals == 0,
        "trailed": trailed,
        "came_from_behind": trailed and points > 0,
        "late_goal": late_goal,
        "late_points_saved": late_points_saved,
        "late_result_change": late_points_saved > 0,
        "last_leverkusen_goal_minute": last_lev_goal_minute,
        "goals": goals,
    }


def enrich_matches(matches: list[dict]) -> list[dict]:
    cumulative_points = 0
    for matchday, match in enumerate(matches, start=1):
        match.update(analyze_match(match))
        cumulative_points += match["points"]
        match["matchday"] = matchday
        match["cumulative_points"] = cumulative_points
        match["title_clinch"] = match["match_id"] == 3895302
        match["saved_streak"] = match["late_points_saved"] > 0 or match["came_from_behind"]
    return matches


def is_open_play(play_pattern: str | None) -> bool:
    return play_pattern in OPEN_PLAY_PATTERNS


def is_successful(event: dict) -> bool:
    return event.get("pass", {}).get("outcome") is None


def is_final_third_entry(start_x: float, end_x: float) -> bool:
    return start_x < 80 <= end_x


def is_box_entry(end_x: float, end_y: float) -> bool:
    return end_x >= 102 and 18 <= end_y <= 62


def is_progressive(start_x: float, end_x: float) -> bool:
    gain = end_x - start_x
    if start_x < 60 and end_x < 60:
        return gain >= 30
    if start_x < 60 and end_x >= 60:
        return gain >= 15
    return gain >= 10


def goal_distance_gain(start_x: float, start_y: float, end_x: float, end_y: float) -> float:
    start = math.dist((start_x, start_y), (120, 40))
    end = math.dist((end_x, end_y), (120, 40))
    return round(start - end, 2)


def extract_passes(match_lookup: dict[int, dict]) -> list[dict]:
    passes: list[dict] = []
    event_dir = DATA_DIR / "events"
    for match_id, match in match_lookup.items():
        events = json.loads((event_dir / f"{match_id}.json").read_text())
        for event in events:
            if event.get("type", {}).get("name") != "Pass":
                continue
            if event.get("team", {}).get("name") != TEAM_NAME:
                continue
            if "location" not in event or "pass" not in event or "end_location" not in event["pass"]:
                continue

            start_x, start_y = event["location"][:2]
            end_x, end_y = event["pass"]["end_location"][:2]
            play_pattern = event.get("play_pattern", {}).get("name")

            passes.append(
                {
                    "id": event["id"],
                    "match_id": match_id,
                    "date": match["date"],
                    "date_label": match["date_label"],
                    "opponent": match["opponent"],
                    "venue": match["venue"],
                    "match_label": match["label"],
                    "period": event.get("period"),
                    "minute": event.get("minute"),
                    "second": event.get("second"),
                    "clock_minute": round(event.get("minute", 0) + event.get("second", 0) / 60, 2),
                    "timestamp": event.get("timestamp"),
                    "index": event.get("index"),
                    "possession": event.get("possession"),
                    "sequence_key": f"{match_id}-{event.get('possession')}",
                    "play_pattern": play_pattern,
                    "open_play": is_open_play(play_pattern),
                    "player": event.get("player", {}).get("name", "Unknown"),
                    "recipient": event.get("pass", {}).get("recipient", {}).get("name", "Unknown"),
                    "successful": is_successful(event),
                    "under_pressure": bool(event.get("under_pressure")),
                    "pass_height": event.get("pass", {}).get("height", {}).get("name", "Unknown"),
                    "body_part": event.get("pass", {}).get("body_part", {}).get("name", "Unknown"),
                    "switch": bool(event.get("pass", {}).get("switch")),
                    "cross": bool(event.get("pass", {}).get("cross")),
                    "cut_back": bool(event.get("pass", {}).get("cut_back")),
                    "shot_assist": bool(event.get("pass", {}).get("shot_assist")),
                    "goal_assist": bool(event.get("pass", {}).get("goal_assist")),
                    "start_x": round(start_x, 2),
                    "start_y": round(start_y, 2),
                    "end_x": round(end_x, 2),
                    "end_y": round(end_y, 2),
                    "x_gain": round(end_x - start_x, 2),
                    "goal_gain": goal_distance_gain(start_x, start_y, end_x, end_y),
                    "pass_length": round(math.dist((start_x, start_y), (end_x, end_y)), 2),
                    "progressive": is_progressive(start_x, end_x),
                    "final_third_entry": is_final_third_entry(start_x, end_x),
                    "box_entry": is_box_entry(end_x, end_y),
                }
            )

    passes.sort(key=lambda row: (row["date"], row["match_id"], row["index"]))
    sequences: defaultdict[str, list[dict]] = defaultdict(list)
    for row in passes:
        sequences[row["sequence_key"]].append(row)
    for sequence_rows in sequences.values():
        sequence_rows.sort(key=lambda row: row["index"])
        size = len(sequence_rows)
        for idx, row in enumerate(sequence_rows, start=1):
            row["sequence_index"] = idx
            row["sequence_size"] = size
    return passes


def build_summary(matches: list[dict], passes: list[dict]) -> dict:
    open_completed = [row for row in passes if row["open_play"] and row["successful"]]
    progressive_counts = Counter(row["player"] for row in open_completed if row["progressive"])
    box_counts = Counter(row["player"] for row in open_completed if row["box_entry"])

    top_progressor, top_progressive_value = progressive_counts.most_common(1)[0]
    top_box_entry, top_box_value = box_counts.most_common(1)[0]
    wins = sum(match["result"] == "W" for match in matches)
    draws = sum(match["result"] == "D" for match in matches)
    losses = sum(match["result"] == "L" for match in matches)
    total_points = sum(match["points"] for match in matches)
    clean_sheets = sum(match["clean_sheet"] for match in matches)
    comebacks = sum(match["came_from_behind"] for match in matches)
    late_goal_matches = sum(match["late_goal"] for match in matches)
    late_points_saved = sum(match["late_points_saved"] for match in matches)

    return {
        "team": TEAM_NAME,
        "competition": "1. Bundesliga",
        "season": "2023/2024",
        "match_count": len(matches),
        "wins": wins,
        "draws": draws,
        "losses": losses,
        "points": total_points,
        "clean_sheets": clean_sheets,
        "comebacks": comebacks,
        "late_goal_matches": late_goal_matches,
        "late_points_saved": late_points_saved,
        "logo_url": "https://commons.wikimedia.org/wiki/Special:FilePath/Logo_TSV_Bayer_04_Leverkusen.svg",
        "pass_count": len(passes),
        "open_play_completed_count": len(open_completed),
        "top_progressor": {"player": top_progressor, "count": top_progressive_value},
        "top_box_entry_creator": {"player": top_box_entry, "count": top_box_value},
    }


def main() -> None:
    matches = enrich_matches(load_matches())
    match_lookup = {match["match_id"]: match for match in matches}
    passes = extract_passes(match_lookup)
    players = sorted({row["player"] for row in passes})
    pass_fields = [
        "id",
        "match_id",
        "period",
        "minute",
        "second",
        "clock_minute",
        "index",
        "possession",
        "sequence_key",
        "sequence_index",
        "sequence_size",
        "play_pattern",
        "open_play",
        "player",
        "recipient",
        "successful",
        "under_pressure",
        "pass_height",
        "body_part",
        "switch",
        "cross",
        "cut_back",
        "shot_assist",
        "goal_assist",
        "start_x",
        "start_y",
        "end_x",
        "end_y",
        "x_gain",
        "goal_gain",
        "pass_length",
        "progressive",
        "final_third_entry",
        "box_entry",
    ]
    pass_rows = [[row[field] for field in pass_fields] for row in passes]
    payload = {
        "summary": build_summary(matches, passes),
        "default_state": {
            "match_id": "all",
            "player": "all",
            "pass_type": "progressive",
            "phase": "open",
            "outcome": "complete",
            "minute_range": [0, 96],
        },
        "matches": matches,
        "players": players,
        "stories": STORIES,
        "pass_fields": pass_fields,
        "passes": pass_rows,
    }
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    print(f"Wrote {OUTPUT_PATH.relative_to(ROOT)} with {len(matches)} matches and {len(passes)} passes.")


if __name__ == "__main__":
    main()
