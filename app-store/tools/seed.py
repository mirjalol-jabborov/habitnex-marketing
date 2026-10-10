#!/usr/bin/env python3
"""Fills the screenshot account on a local app server with what the screenshots show.

  python3 tools/seed.py <server> <email> <today> <language>

A year of the app's own demo history (the dev-only POST /dev/demo), then every planned habit
kept for the last twelve days so the streak reads well, then one real question to the coach,
answered by the real AI with the same sample meetings the app shows (-sampleCalendar).
Only ever run this against a server on this machine."""
import datetime, json, sys, time, urllib.error, urllib.request

server, email, today_text, lang = sys.argv[1].rstrip("/"), sys.argv[2], sys.argv[3], sys.argv[4]
assert "localhost" in server or "127.0.0.1" in server, "the screenshot account lives on a local server only"
today = datetime.date.fromisoformat(today_text)
# Read is the habit that slips in the demo history; the answer is one clean change to it.
QUESTION = {
    "en": "I keep skipping my reading. I'm too tired by 22:00. Can you fix it?",
    "fr": "Je saute sans cesse ma lecture. À 22 h, je suis trop fatigué. On peut arranger ça ?",
    "ja": "読書をいつもサボってしまいます。22時にはもう疲れていて…。直せますか？",
}
# The server's demo names its habits in English, Russian and Uzbek only. For the other languages
# the habits, their units and the reason of the temporary change are renamed here, by the English
# name the demo gave them. The name of the person is one people have in that language.
WORDS = {
    "fr": {"Morning run": "Footing du matin", "Gym": "Salle de sport", "Deep work": "Travail concentré", "Read": "Lecture", "Drink water": "Boire de l’eau", "Walk": "Marche", "Meditate": "Méditation", "Guitar": "Guitare",
           "pages": "pages", "glasses": "verres", "steps": "pas", "busy week": "semaine chargée"},
    "ja": {"Morning run": "朝ラン", "Gym": "ジム", "Deep work": "集中作業", "Read": "読書", "Drink water": "水を飲む", "Walk": "ウォーキング", "Meditate": "瞑想", "Guitar": "ギター",
           "pages": "ページ", "glasses": "杯", "steps": "歩", "busy week": "忙しい週"},
}
NAME = {"ja": "ハル"}
token = None

def call(method, path, body=None, wait=90):
    headers = {"Content-Type": "application/json", "Accept-Language": lang}
    if token: headers["Authorization"] = "Bearer " + token
    request = urllib.request.Request(server + path, method=method, data=None if body is None else json.dumps(body).encode(), headers=headers)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=wait) as response:
                text = response.read().decode()
                return json.loads(text) if text else {}
        except urllib.error.HTTPError as problem:
            if problem.code != 429 or attempt == 3: raise
            time.sleep(20)   # the server allows 240 requests a minute

token = call("POST", "/auth/dev", {"email": email, "name": NAME.get(lang, "Alex")})["token"]
call("PATCH", "/me", {"settings": {"ai_consent": True}})
habits = call("POST", "/dev/demo", {"today": today_text, "days": 365, "confirm_email": email})

# The habits' names in this language, and for capture.sh the three it opens by name. (Asked for
# again: the demo's own answer comes before it gives Meditate its temporary change.)
habits = call("GET", "/habits")
words = WORDS.get(lang, {})
opened = {}
for habit in habits:
    english = habit["title"]
    change = {}
    if english in words: change["title"] = words[english]
    if habit.get("goal_unit") in words: change["goal_unit"] = words[habit["goal_unit"]]
    # The reason of Meditate's temporary change ("busy week") can't be renamed from here: the server's route
    # for it restarts the change from the server's own today. It needs the language in DEMO_TEXT on the server.
    if change:
        call("PATCH", f"/habits/{habit['id']}", change)
        habit.update(change)
    if english in ("Gym", "Meditate", "Walk"): opened[english.upper()] = habit["title"]
import pathlib
folder = pathlib.Path(__file__).resolve().parent.parent / "captures" / lang
folder.mkdir(parents=True, exist_ok=True)
(folder / "titles.env").write_text("".join(f"{key}='{title}'\n" for key, title in opened.items()))

weekday = lambda day: day.isoweekday() % 7 + 1          # 1 = Sunday … 7 = Saturday, as the server counts
for back in range(12, 0, -1):
    day = today - datetime.timedelta(days=back)
    for habit in habits:
        if habit["paused"] or weekday(day) not in habit["weekdays"]: continue
        start = int(habit.get("day_times", {}).get(str(weekday(day)), habit["start_minute"]))
        if habit.get("goal_count"):
            call("PATCH", f"/habits/{habit['id']}/days/{day}", {"amount": habit["goal_count"] + (back * 37 % 5) * (1 if habit["goal_count"] < 100 else 120)})
        if habit.get("health_kind"):
            # Linked to Apple Health: recorded as the phone records it, so the habit's check-in log says
            # "from Apple Health" (frame 8). Steps add up by the evening; the others start about on time.
            minute = 17 * 60 + back * 37 % 200 if habit["health_kind"] == "steps" else min(1439, start + back * 7 % 9)
            call("PUT", f"/habits/{habit['id']}/days/{day}", {"status": None, "clear_all": True})
            call("POST", "/checkins", {"habit_id": habit["id"], "day": str(day), "status": "done", "logged_minute": minute, "source": "health"})
        else:
            call("PUT", f"/habits/{habit['id']}/days/{day}", {"status": "done", "logged_minute": min(1439, start + back * 7 % 9)})

# The meetings the app shows with -sampleCalendar: work on working days, plans with people at the weekend.
working = [(600, 630), (690, 750), (780, 840), (900, 960), (1050, 1140)]
weekend = [(630, 720), (840, 900), (1110, 1230)]
busy = {}
for ahead in range(7):
    day = today + datetime.timedelta(days=ahead)
    busy[day.isoformat()] = [{"start_minute": a, "end_minute": b} for a, b in (weekend if day.isoweekday() >= 6 else working)]
for attempt in range(3):    # frame 4 needs a suggested change under the answer
    call("POST", "/coach/chat/new")
    answer = call("POST", "/coach/chat", {"message": QUESTION.get(lang, QUESTION["en"]), "today": today_text, "now_minute": 581, "busy_by_date": busy, "calendar_connected": True})
    if answer["proposals"]: break
print("coach:", answer["content"])
print("suggested:", [proposal.get("summary") for proposal in answer["proposals"]] or "nothing (ask again: frame 4 needs a suggested change)")
