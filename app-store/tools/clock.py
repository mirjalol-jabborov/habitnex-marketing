#!/usr/bin/env python3
"""Where in the world it is about 9:41 in the morning right now.

Prints "<time zone> <clock> <date>", for example "Etc/GMT+8 9:38 2026-10-10". The captures run
the app in that zone, so the Today screen always shows a morning in progress, with the plan
still ahead, whatever the real time of day is here.

Two dates are in use around the world at any moment. When both have a morning near 9:41, the
one on which the demo account has Gym planned is taken (Monday, Wednesday, Friday, Saturday):
on the other days Gym's page can't be opened from Today, and the AI coach's card on Today is
not the one about the calendar."""
import datetime

now = datetime.datetime.now(datetime.timezone.utc)
minutes = now.hour * 60 + now.minute
GYM_DAYS = {0, 2, 4, 5}    # Monday is 0
def off(hours):
    local = now - datetime.timedelta(hours=hours)
    return abs(((minutes - hours * 60) % 1440) - 581) + (0 if local.weekday() in GYM_DAYS else 180)
west = min(range(-12, 13), key=off)
local = now - datetime.timedelta(hours=west)
print(f"Etc/GMT{'+' if west >= 0 else '-'}{abs(west)}", f"{local.hour}:{local.minute:02d}", local.date().isoformat())
