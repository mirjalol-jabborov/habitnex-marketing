#!/usr/bin/env python3
"""Finds the pieces of the captures whose place changes from one capture to the next.

  python3 tools/measure.py <language>      (needs Pillow: pip3 install pillow)

The coach's answer is written by the AI, so it is a different length every time, and the
coach's card on Today grows with its text. This looks at coach.png and today.png and writes
captures/<language>/pieces.css, which tells frames.html where every piece it lifts out of a
capture is: the chat's question, answer and suggested change, the Today card and the Walk row,
the four voice cards, the year's two parts, the Apple Health section, the check-in log and the
share card, and where the hourglass emoji goes. Run it after every new capture."""
import sys
from pathlib import Path
from PIL import Image

lang = sys.argv[1] if len(sys.argv) > 1 else "en"
folder = Path(__file__).resolve().parent.parent / "captures" / lang
dark = lambda p: sum(p) < 120
white = lambda p: min(p) >= 252

def pieces(image, test, columns, top, bottom, least=100):
    """Runs of rows, between top and bottom, that have a pixel passing `test` somewhere in `columns`."""
    px, found, start = image.load(), [], None
    for y in range(top, bottom):
        hit = any(test(px[x, y]) for x in range(columns[0], columns[1], 6))
        if hit and start is None: start = y
        if not hit and start is not None:
            if y - start >= least: found.append((start, y))
            start = None
    if start is not None and bottom - start >= least: found.append((start, bottom))
    return found

def box(image, test, rows, edge=4):
    """The piece's box: its rows, and the leftmost and rightmost pixel passing `test` in them."""
    px, xs = image.load(), []
    for y in range(rows[0] + 8, rows[1] - 8, 8):
        hits = [x for x in range(0, image.width, 2) if test(px[x, y])]
        if hits: xs += [hits[0], hits[-1]]
    x0, x1 = max(0, min(xs) - edge), min(image.width, max(xs) + edge)
    return {"x": x0, "y": rows[0] - edge, "cw": x1 - x0, "ch": rows[1] - rows[0] + 2 * edge}

chat = Image.open(folder / "coach.png").convert("RGB")
answer, change = pieces(chat, white, (60, 300), 500, 2440)[-2:]            # the two white pieces above the message field
question = pieces(chat, dark, (900, 1260), 300, answer[0])[-1]            # the dark bubble above the answer
today = Image.open(folder / "today.png").convert("RGB")
# Across the whole width: the card's white button would hide it from a narrow look.
card = max(pieces(today, dark, (54, 1260), 500, 1800, least=250), key=lambda rows: rows[1] - rows[0])
# Under the card, the two Anytime rows, each drawn as a thin dark outline: Drink water and Walk,
# whose steps come from Apple Health. Their outlines are looked for in the middle, where no words
# reach. They change places from day to day, so Walk is told apart by its second line: its
# count ("2,350/8,000 steps") is the longer one in every language.
edges = pieces(today, dark, (600, 601), card[1], card[1] + 900, least=2)
rows = [(edges[0][0], edges[1][1]), (edges[2][0], edges[3][1])]
px = today.load()
def second_line_end(row):
    middle, bottom = (row[0] + row[1]) // 2 + 6, row[1] - 16
    return max((x for y in range(middle, bottom, 3) for x in range(110, 900, 2) if sum(px[x, y]) < 330), default=0)
walk = max(rows, key=second_line_end)

def runs(image, test, x, top, bottom, least=100):
    """Runs of rows down one column whose pixel passes `test`."""
    return pieces(image, test, (x, x + 1), top, bottom, least)

found = {"chat-question": box(chat, dark, question), "chat-answer": box(chat, white, answer), "chat-change": box(chat, white, change), "today-card": box(today, dark, card, edge=0), "today-walk": box(today, dark, walk)}

# Frame 3: the four voice cards, lighter than the black page behind them. Their heights follow their words.
voices = Image.open(folder / "voice-dark.png").convert("RGB")
for number, (top, bottom) in enumerate(runs(voices, lambda p: sum(p) > 60, 90, 500, 2400)[:4], 1):
    found[f"voice-{number}"] = {"x": 60, "y": top, "cw": 1200, "ch": bottom - top}

# Frame 6: on the year page, the "Every day" strip and the months under it, each with the title above its card.
year = Image.open(folder / "year.png").convert("RGB")
cards = runs(year, white, 56, 500, 2868)
strip, months = cards[-2], cards[-1]
found["year-days"] = {"x": 48, "y": strip[0] - 35, "cw": 1224, "ch": strip[1] - strip[0] + 70}
found["year-months"] = {"x": 48, "y": months[0] - 35, "cw": 1224, "ch": 1400}

# Frame 8: at the end of Walk's settings, the Apple Health section: its title, the choices and the line under
# them. It ends above the Save button; it starts under the widest gap, which is the one between two sections.
edit = Image.open(folder / "walk-edit.png").convert("RGB")
save = runs(edit, dark, 150, 2300, 2868)[-1]
ink = pieces(edit, lambda p: sum(p) < 745, (40, 1280), 1500, save[0] - 30, least=8)
first = max(range(1, len(ink)), key=lambda i: (ink[i][0] - ink[i - 1][1] >= 60, i))   # the last gap of 60 or more
found["health"] = {"x": 14, "y": ink[first][0] - 43, "cw": 1292, "ch": ink[-1][1] - ink[first][0] + 44}
# Walk's check-in log: the tallest white card that is whole on the page opened at its end. (The column
# looked down is just inside the card, where its round corners take 35 px off each end, as on the year page.)
log = max((r for r in runs(Image.open(folder / "walk.png").convert("RGB"), white, 56, 300, 2700)), key=lambda r: r[1] - r[0])
found["log"] = {"x": 48, "y": log[0] - 35, "cw": 1224, "ch": log[1] - log[0] + 70}

# Frame 10: the card on the "Share your progress" sheet, black on the white sheet.
share = Image.open(folder / "share.png").convert("RGB")
black = lambda p: sum(p) < 90
tall = max(runs(share, black, 75, 300, 2600), key=lambda r: r[1] - r[0])      # down its left edge, where it has nothing on it
middle = [y for y in range(tall[0] - 80, tall[1] + 80) if black(share.getpixel((660, y)))]
across = [x for x in range(0, share.width) if black(share.getpixel((x, (tall[0] + tall[1]) // 2)))]
found["share-card"] = {"x": across[0], "y": middle[0], "cw": across[-1] - across[0] + 1, "ch": middle[-1] - middle[0] + 1}

# Frames 1 and 2: where the hourglass of a temporary change is on Today. The simulator draws a "?" in a
# small box there (see the README); the frames put the emoji back over it. The box is two upright white
# strokes about 32 px apart, the last such pair on the last dark row (letters come before it).
rows = pieces(today, dark, (700, 701), card[1], 2600, least=40)
hourglass = None
if rows:
    top, bottom = rows[0][0], rows[-1][1]
    def stroke(x):
        best = run = start = 0
        for y in range(top, bottom):
            if sum(px[x, y]) > 600:
                run += 1
                if run > best: best, start = run, y - run + 1
            else: run = 0
        return (best, start) if 22 <= best <= 40 else None
    upright = {x: stroke(x) for x in range(240, 1000)}     # left of the row's own buttons
    pairs = [(x, upright[x][1]) for x in upright if upright[x] and upright[x][1] > bottom - 90
             and any(upright.get(x + d) and abs(upright[x + d][1] - upright[x][1]) <= 2 for d in range(29, 36))]
    if pairs: hourglass = max(pairs)

lines = ["/* Written by tools/measure.py from the captures. Don't edit: run it again. */"]
lines += [f".{name} {{ --x: {b['x']}; --y: {b['y']}; --cw: {b['cw']}; --ch: {b['ch']}; }}" for name, b in found.items()]
if hourglass: lines.append(f".hourglass {{ left: {hourglass[0] - 6}px; top: {hourglass[1] - 13}px; }}")
(folder / "pieces.css").write_text("\n".join(lines) + "\n")
print("\n".join(lines[1:]))
