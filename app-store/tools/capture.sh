#!/bin/bash
# Takes the app's screens for the App Store screenshots, on a simulator made for it and
# deleted afterwards.
#
#   tools/capture.sh <path to a Debug build of Habitnex.app for the simulator> [language]
#   ONLY="walk share" tools/capture.sh <app> [language]    just those screens again, after a run that
#                                                           stopped part-way; the account is left as it is
#
# Before running it: start the app's server on this machine (habitnex-backend, `npm start`)
# with the AI key set, and build the app for the simulator, for example
#   xcodebuild -project Habitnex.xcodeproj -scheme Habitnex -configuration Debug \
#     -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/habitnex-build build
# SERVER says where the server is (http://localhost:3000 unless set).
#
# What it relies on in the app (all debug-only): -devEmail signs in, -sampleCalendar shows a
# sample day of meetings, -startTab, -openHabit, -openYear, -openEdit, -openShare and
# -openReview open a screen, -editScroll health and -detailScroll log open a screen further down,
# -onboardingStep and -onboardingVoice open the coach-voice question.
set -e
APP=${1:?give the path to Habitnex.app}; LANGUAGE=${2:-en}
SERVER=${SERVER:-http://localhost:3000}
EMAIL=appstore-$LANGUAGE@habitnex.dev
cd "$(dirname "$0")/.."
OUT=captures/$LANGUAGE; mkdir -p "$OUT"
read -r ZONE CLOCK TODAY <<<"$(python3 tools/clock.py)"
# The phone's region goes with the language (all three use a 24-hour clock; see the README).
case "$LANGUAGE" in fr) REGION=fr_FR ;; ja) REGION=ja_JP ;; *) REGION=en_GB ;; esac

DEVICE=$(xcrun simctl create "habitnex-appstore" com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max)
trap 'xcrun simctl shutdown "$DEVICE" 2>/dev/null; xcrun simctl delete "$DEVICE"' EXIT
xcrun simctl boot "$DEVICE"; xcrun simctl bootstatus "$DEVICE" -b >/dev/null
xcrun simctl install "$DEVICE" "$APP"
xcrun simctl ui "$DEVICE" appearance light
sleep 40    # a new simulator shows a notice or two when it first starts; let them pass

shot() {    # shot <name> [launch arguments…]
  local name=$1; shift
  [ -z "$ONLY" ] || [[ " $ONLY " == *" $name "* ]] || return 0
  read -r ZONE CLOCK TODAY <<<"$(python3 tools/clock.py)"
  xcrun simctl status_bar "$DEVICE" override --time "$CLOCK" --dataNetwork wifi --wifiMode active --wifiBars 3 --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100
  xcrun simctl terminate "$DEVICE" io.habitnex 2>/dev/null || true
  # One screen that fails is reported, and the rest (and measure.py) still run.
  if SIMCTL_CHILD_TZ="$ZONE" xcrun simctl launch "$DEVICE" io.habitnex -AppleLanguages "($LANGUAGE)" -AppleLocale "${LOCALE:-$REGION}" "$@" >/dev/null \
     && sleep "${WAIT:-9}" && xcrun simctl io "$DEVICE" screenshot "$OUT/$name.png" >/dev/null 2>&1; then
    echo "$OUT/$name.png  ($ZONE, $CLOCK)"
  else
    echo "FAILED: $OUT/$name.png was not taken"; FAILED="$FAILED $name"
  fi
}

# Before signing in: the question about the coach's voice, light and dark.
shot voice -onboardingStep 5 -onboardingVoice sarcastic
xcrun simctl ui "$DEVICE" appearance dark
shot voice-dark -onboardingStep 5 -onboardingVoice sarcastic
xcrun simctl ui "$DEVICE" appearance light

[ -n "$ONLY" ] || python3 tools/seed.py "$SERVER" "$EMAIL" "$TODAY" "$LANGUAGE"
source "$OUT/titles.env"    # GYM, MEDITATE, WALK: those habits' names in this language (seed.py writes it)

IN=(-dev.backendURL "$SERVER" -devEmail "$EMAIL" -sampleCalendar YES)
# The first launch signs in, and is taken again below once it has.
SIMCTL_CHILD_TZ="$ZONE" xcrun simctl launch "$DEVICE" io.habitnex -AppleLanguages "($LANGUAGE)" -AppleLocale "${LOCALE:-$REGION}" "${IN[@]}" >/dev/null && sleep 14
shot today "${IN[@]}"
shot coach "${IN[@]}" -startTab 2
shot gym "${IN[@]}" -openHabit "$GYM"
shot meditate "${IN[@]}" -openHabit "$MEDITATE"
shot walk-edit "${IN[@]}" -openHabit "$WALK" -openEdit YES -editScroll health
shot walk "${IN[@]}" -openHabit "$WALK" -detailScroll log
shot year "${IN[@]}" -openHabit "$GYM" -openYear YES
shot progress "${IN[@]}" -startTab 1
shot share "${IN[@]}" -startTab 1 -openShare YES
shot review "${IN[@]}" -openReview YES
python3 tools/measure.py "$LANGUAGE"
[ -z "$FAILED" ] || { echo "Not taken:$FAILED. Run the script again."; exit 1; }
echo "Done. Now: node tools/render.mjs --lang $LANGUAGE"
