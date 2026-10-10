# App Store screenshots

Ten screenshots for the App Store listing, the most it takes. Each is 1320 × 2868 (the 6.9-inch
iPhone size, which the App Store scales down for smaller iPhones). The finished files are in
[out/en/](out/en/); [out/en/overview.png](out/en/overview.png) shows them side by side.

Each one is a pain people have with habits, and what Habitnex does about it. The picture is
never a whole screen for its own sake: it is the phone, or the one piece of the app that
answers the pain, lifted out and enlarged. Black and white only, as the brand is.

| # | The pain | The answer | What is shown |
| --- | --- | --- | --- |
| 1 | (the promise) Habits that actually stick. | The AI coach that knows your calendar. | Today, with the AI coach's card from the calendar |
| 2 | Meeting ran over? | Your habit moves. It isn't lost. | The AI coach's card: "You're busy until 12:00. Want Gym at 12:15 instead?" |
| 3 | Tired of nagging? | Choose how your AI coach talks to you. | The four AI coach voices, one picked |
| 4 | Skipping the same habit? | Say it. Your AI coach fixes the plan. | "I keep skipping my reading. I'm too tired by 22:00", the AI coach's answer, and the change it suggests (Read at 21:00) |
| 5 | Is it even working? | Real numbers, not "Great job!" | A habit's page: what the AI coach noticed, streak, kept, lateness |
| 6 | One bad day isn't the end. | See your whole year, day by day. | The year of one habit, every day and by month |
| 7 | Reminders you ignore? | Your AI coach writes each one. Answer it right there. | Two reminders the AI coach wrote, the Gym one held with its four actions: Done, Later (15 Min), Do a Shorter Version, Skip Today |
| 8 | Forgot to log it again? | Apple Health checks it off for you. | Walk's settings ("Check off with Apple Health", Steps picked), today's Walk row with its steps, and Walk's check-in log: each day kept "from Apple Health" |
| 9 | Busy or sick this week? | Go lighter for a while. It goes back by itself. | Meditate's page with its temporary change: 5 min for a busy week, then back to normal |
| 10 | Proud of your week? | Share your progress in one tap. | The "Share your progress" sheet, and in front of it the week's card that gets shared |

## Header and search results

The App Store on iOS 27 and later also shows two wide pictures, uploaded in App Store Connect
under **Header and Search Results**. They are in the same folders as the screenshots:

| File | Size | Where it shows | What is on it |
| --- | --- | --- | --- |
| `header.png` | 3840 × 1646 | the top of the product page | "Habits that actually stick. The AI coach that knows your calendar.", with Today on a phone and three pieces of the app around it |
| `search-results.png` | 3840 × 2560 | the app's card in Search, in place of the screenshots | "The AI habit coach that knows your calendar.", over the AI coach's card from the calendar, between a habit's page and a chat with the AI coach |

They are drawn in [placements.html](placements.html) from the same captures, and
`node tools/render.mjs` makes them together with the screenshots. The App Store cuts both
pictures differently on each device, so the words stay inside Apple's "Art Safe Area" (the
middle 1646 × 661 of the header, the middle 2168 × 1030 of the search picture; the numbers are
read from Apple's own templates). `out/<lang>/guides/` has each picture with that area drawn on
it. Everything outside it may be cut off, which is why only pieces of the app are there.

Apple asks that words on these pictures be in every language the app is in. English and
Japanese are made; in any other language, upload nothing until its picture exists, or the
English words show there. Look at each one with **Preview** in App Store Connect before sending.

## How they are made

The pictures are real captures of the app, taken in the simulator from an account filled with
a year of the app's own demo history. The AI coach's answer in frame 4 is written by the real AI.
Frame 7 is the one exception: the simulator can't hold a notification open, so the reminders
and their actions are drawn in `frames.html`. The action names are the app's own, and the two
texts are real ones the AI coach wrote for this account (`POST /coach/message`, Friendly voice,
Alex); ask it again and paste new ones in if the habits or voice change.

```
# 1. the app's server, on this machine, with the AI key set
cd ../../habitnex-backend && npm start

# 2. a Debug build of the app for the simulator
cd ../habitnex-ios && xcodebuild -project Habitnex.xcodeproj -scheme Habitnex -configuration Debug \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/habitnex-build CODE_SIGNING_ALLOWED=NO build

# 3. the captures (about three minutes; makes a simulator and deletes it again)
cd ../habitnex-marketing/app-store
tools/capture.sh /tmp/habitnex-build/Build/Products/Debug-iphonesimulator/Habitnex.app

# 4. the screenshots
node tools/render.mjs
```

You need Node, Google Chrome, Xcode, Python 3 with Pillow (`pip3 install pillow`), and
`npm install` done once in `../product-video` (the render uses its puppeteer-core).

- [tools/capture.sh](tools/capture.sh) takes the screens into `captures/en/`. It runs the app
  in the time zone where it is about 9:41 in the morning at that moment, so Today always shows
  a day in progress with the plan still ahead.
- [tools/seed.py](tools/seed.py) fills the account: a year of demo history, every habit kept
  for the last twelve days, and one question to the AI coach.
- [tools/measure.py](tools/measure.py) finds the pieces that are a different size every time
  (the AI coach's answer is as long as the AI made it, and the Walk row in frame 8 sits under
  the Today card) and writes `captures/en/pieces.css`.
- [frames.html](frames.html) is the ten frames; open it in a browser to see them while
  changing words or layout. [tools/render.mjs](tools/render.mjs) turns it into the PNGs.

## Things to know

- **Emoji.** The iOS 26.3 simulator can't draw emoji: the streak's flame and the hourglass on
  a temporary change come out as a "?" in a box. A real iPhone draws them. In frames 1, 2 and 8
  the two emoji are put back over the capture (the `.emoji` spans in `frames.html`), at fixed
  places on the Today screen. If Today's layout changes, check those two spots.
- **Clock.** The captures use a 24-hour clock (`LOCALE=en_GB`), because the AI coach writes
  times as "19:15" in its chat answers whatever the phone is set to; with an American locale
  the same screenshot would say both "19:15" and "7:15 PM". Run `LOCALE=en_US tools/capture.sh …`
  once the AI coach follows the phone's clock.
- **Other languages.** Japanese is done (`out/ja/`). A language needs four things:
  1. its screens: `tools/capture.sh <app> ja` takes them into `captures/ja/` and measures them;
  2. the demo's habit names, units and the question to the AI coach in that language, in `WORDS`
     and `QUESTION` in `tools/seed.py` (the server's own demo has English, Russian and Uzbek);
  3. the words on the frames, in `strings.js`, with two reminder texts for frame 7 asked from the
     AI coach in that language (`POST /coach/message`) and the app's own names for the four
     reminder buttons;
  4. `node tools/render.mjs --lang ja`, which opens `frames.html?lang=ja`.
  Headlines that run longer than the English ones shrink to fit by themselves. Onest has Latin
  and Cyrillic only; Japanese headlines use Hiragino Sans from the Mac (see `html[lang="ja"]`
  in `frames.html`), and another script needs its own font named there.
  Look at every frame: `tools/measure.py` finds each lifted piece by its shape, and a screen that
  wraps differently can fool it. A native speaker should read the words in `strings.js`.
- **Japanese frame 9 still says "busy week"** in English on the Meditate page: that reason comes
  from the server's demo, which has English, Russian and Uzbek only. Add `ja` to `DEMO_TEXT` in
  the backend's `dashboard.service.js`, restart the server and capture again.
- **What the app doesn't translate** shows in a capture. In Japanese, Walk's settings still say
  "Extra dates", "Add" and the unit names in English (frame 8 cuts around them), and the sample
  meetings on Today are English (off-screen in frames 1 and 2).
- **A capture that stops part-way** (the simulator can die when the Mac is busy):
  `ONLY="year share" tools/capture.sh <app> ja` takes just those screens again, and
  `WAIT=15` in front of it waits longer for each screen to load.
- **The meetings** on Today are a sample day the debug build shows with `-sampleCalendar YES`
  (work meetings on working days, plans with people at the weekend), not a real calendar.
- **The demo account** gives frames 8 and 9 what they show: Walk, Morning run, Gym and
  Meditate are linked to Apple Health, and Meditate has a temporary change for a busy week
  (`loadDemo` in the backend's `dashboard.service.js`). `capture.sh` opens its page with
  `-openHabit Meditate`, Walk's settings with `-openHabit Walk -openEdit YES -editScroll health`,
  Walk's check-in log with `-openHabit Walk -detailScroll log`, and the week's share card with
  `-startTab 1 -openShare YES`. `seed.py` records the last twelve days of the habits linked to
  Apple Health as coming from it, which is what the log in frame 8 shows.
- **Frame 8** cuts three pieces at fixed places: the "Check off with Apple Health" section at
  the end of Walk's settings (`walk-edit.png`, opened there with `-editScroll health`), Walk's
  check-in log (`walk.png`, opened at the end of the page with `-detailScroll log`), and the
  share card in frame 10 (`share.png`). If one of those screens changes, change `--y` and `--ch`
  on that piece. The Health section sits on a white plate because the screen has no room under it.
- **The Apple Health icon** is not on frame 8. Apple's licence for it (the "Icon-Apple-Health"
  download on developer.apple.com/design/resources) allows it inside the app's own screens and
  in screenshots of them, not on its own in a picture. To show it, accept that licence, put the
  icon next to "Check off with Apple Health" in the app, and take the captures again.
- **The day matters.** The demo account has Gym on Monday, Wednesday, Friday and Saturday. On
  the other days Gym's page can't be opened from Today (frames 5 and 6 come out as Today) and
  the AI coach's card is not the one about the calendar (frames 1 and 2). `tools/clock.py`
  takes a Gym day when one has a morning going on somewhere in the world; when none has, wait
  a few hours. After capturing, look at `gym.png`, `year.png` and `today.png` before rendering.
- **A screen that fails** to be taken is named at the end of `capture.sh`, which then stops with
  an error; the old picture stays in `captures/` until the script is run again.
