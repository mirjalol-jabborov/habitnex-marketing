# Habitnex product video

A 40-second vertical product video (1080 × 1920, 60 fps) with narration and music, for
TikTok, Reels and social ads. The finished file is [out/habitnex-en.mp4](out/habitnex-en.mp4).
Play it in QuickTime: VS Code's built-in preview shows the picture but doesn't play its sound.

The video is rendered from code. The app's screens are rebuilt in HTML from the SwiftUI
source; a 3D camera moves the phone, and pieces of the interface lift off the screen or leave
it. Headless Chrome captures every frame (eight captures per frame, averaged, for real motion
blur) and ffmpeg encodes them with the narration, a recorded music track and sound effects.

## Render it

You need Node and Google Chrome.

```
npm install
npm run render                      # English → out/habitnex-en.mp4 (about four minutes)
npm run render -- --blur 1          # quick draft without motion blur
npm run render -- --lang ru         # another language, once strings/ru.json exists
npm run render -- --no-music        # sound effects only
npm run render -- --fps 30          # 30 fps
npm run frames -- 4.5 7.6 16.2      # still frames at those seconds → preview/
```

## Narration

One narrator, recorded with ElevenLabs as a single continuous take so it has the flow of a
person talking. The take is cut into its lines and each line is placed on the picture.

```
echo "ELEVENLABS_API_KEY=your-key" > .env          # ignored by git
npm run voice                                       # records the take → voice/en/
npm run voice -- --force                            # a new take of the same script
npm run voice -- --recut                            # cut the current take into lines again, no new recording
npm run voice -- --voice Chris                      # another voice
npm run voice -- --audition Chris,Jessica,Brian     # full takes to listen to → voice/en/takes/
npm run render -- --no-voice                        # the film without narration
```

- The take is cut into lines at the pauses that can be heard in it. ElevenLabs' timings only
  say roughly where each line is; they can be a few tenths of a second out, and cutting by
  them clips words.
- The script is `voiceover.narration` in `strings/en.json`. The opening line's words appear
  as they are spoken, and each coach's card arrives as the narrator names it.
- The voice is set in [voice.config.json](voice.config.json): a list of names to look for in
  your ElevenLabs account, or an exact `voiceId`. The model is `eleven_v4`, with `eleven_v3`
  as the fallback. Voices added from ElevenLabs' Voice Library
  can't be used through the API on the free plan.
- `voice/en/takes/` holds the full take in use (`current.mp3`) and any auditions.
- The recordings here were made on the free plan, which doesn't license audio for commercial
  use and asks for attribution. Record again on a paid plan before this runs as an ad.

## Music

[music/deep-urban.mp3](music/deep-urban.mp3) is "Deep Urban" from Mixkit, under the Mixkit
Stock Music Free License (commercial use allowed, no attribution needed). The film runs at
120 BPM, so the track (124 BPM) is slowed 3% and placed so its first kick lands as the
opening line ends and the app appears. [music/music.json](music/music.json) holds its tempo and where that kick is.

To use another track, put it in `music/`, measure it and update `music.json`:

```
node tools/beat.mjs music/track.mp3 124 16 70   # rough tempo, a second after the kick starts, where to stop
```

`npm run render -- --synth-music` uses the script's own synthesized track instead.

To watch it in a browser instead, serve this folder (`npx serve .`), open it and call
`seek(12.5)` in the console to jump to a second.

## The story

One day in one person's life, then one week later. Positioning: **the coach that knows your
calendar.** It opens on a hook that names what other habit apps miss, and closes on the app's
own welcome-screen tagline. The big moves land on the music's beats.

| Time | On screen | Words | Feature in the app |
| --- | --- | --- | --- |
| 0 – 3 s | The logo at the top; the hook line lands word by word as it's spoken, on black. It leaves before the app appears; then the logo's habit block grows to fill the frame | Most habit apps have never seen your calendar. | |
| 3 – 6 s | Close on the timeline as the day's meetings drop in; the camera pulls back to reveal the phone | Habitnex has. | Today timeline with calendar events and free gaps |
| 6 – 10 s | The phone lies flat. The coach's suggestion lifts out, and Gym flies off the screen and slams into the free gap | And it finds the gap. | "Move to free gaps" suggestion (`coachCard`, kind `move`) |
| 10 – 17 s | The reminder leaves the phone and becomes a deck of four cards, one per voice. The few words that carry each one's tone (`notification.punch`) are set large and the rest of the card dims | Your coach talks your way. Strict. Sarcastic. Calm. Or friendly. | Reminder templates per voice |
| 17 – 20.5 s | The four notification actions pop off the screen; Done is tapped, the rest fall away, Gym turns black, the streak goes 6 → 7 | Answer right from the reminder. | Notification actions: Done, Later, Shorter, Skip |
| 20.5 – 26.5 s | The week's marks appear one by one, the coach offers a change, the three fixes float off the suggestion sheet | Busy week? It adjusts the plan. | Adapt suggestion after three snoozes (`AdaptSheet`) |
| 26.5 – 30.5 s | The phone spins round to the Coach tab. A starter is tapped, the coach answers with a suggestion card, Apply is tapped | Or just tell your coach. | Coach chat with suggested changes (`CoachChatView`) |
| 30.5 – 35.5 s | Another spin to Progress, the stats lift off, then one habit's year slides in and fills in day by day: the week grid, the twelve month calendars and the totals | And see what's actually sticking. Day by day, all year. | Progress tab and "Year in detail" (`HabitYearView`) |
| 35.5 – 40 s | A crop of the timeline (meeting, kept Gym, meeting) becomes the Slot mark | Habitnex. Habits that actually stick. | |

Everything shown exists in the app. The coach card, the adapt suggestion and its fixes use the
server's own templates (`backend/src/services/coach.service.js`, `backend/src/lib/i18n.js`)
with this day's values filled in, and the move-to-gap result follows the server's rules for
the calendar in the video. The four reminders follow the voice samples the app shows when you
pick a coach (`CoachVoice.sample` in `ios/Habitnex/Models/Profile.swift`), fitted to this
day. They read more in character than the server's fallback reminder templates, which is
closer to what the AI writes for today's reminders. In the chat, the four plain starters and
the suggestion card are the app's own; the four ✨ suggestions and the coach's reply are written
by the AI in the app, so the ones shown are examples. The year is sample data for one habit.

## Change it

| To change | Edit |
| --- | --- |
| Any word on screen | `strings/en.json` |
| When things happen | the `T` and `TYPE` tables at the top of `src/app.js` (seconds) |
| Where the camera goes | `poses()` in `src/app.js` |
| How a screen looks | `src/style.css` and the builders in `src/app.js` |
| Sound effects and the mix | `tools/audio.mjs`; effects follow the cue list at the bottom of `src/app.js` |
| An SF Symbol | add it in `tools/export-symbols.swift`, then `swift tools/export-symbols.swift assets/sf` |

## Another language

Copy `strings/en.json` to `strings/ru.json` or `strings/uz.json` and translate the values.
The interface strings and coach sentences already exist in Russian and Uzbek in
`ios/Habitnex/Localizable.xcstrings`, `backend/src/services/coach.ru.js` and `coach.uz.js`;
only the captions, the narration and the closing sub-line are new. Set `clock.format` to
`24h`, write a line break in a caption as `\n`, then run `npm run voice -- --lang ru` and
`npm run render -- --lang ru`.

## Notes

- Captions are plain white type that inverts to black where it crosses the app's light
  screens. The opening line is kept off the app entirely.
- The phone is laid out three times larger than its point size and scaled down by the camera
  (`SHARP` in `src/app.js`), so close-ups are drawn sharp instead of being enlarged.

- The captions sit in the top fifth of the frame and the main action in the middle, clear
  of the bottom 370 px that TikTok and Reels cover. Some supporting detail does run under it.
- The App Store accepts app previews of 15 to 30 seconds at 30 fps, made from screen
  recordings of the app. This video is for social and ads, not for that slot.
