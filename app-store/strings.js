// The words on the frames in other languages, by the data-t name of each piece of text in
// frames.html (English is in frames.html itself). Terms follow the app's own translation:
// AIコーチ, Appleヘルスケア, 進捗をシェア. Japanese has no spaces to break a line at, so each headline
// and answer says where its lines end (\n); a line too wide for the frame makes the type smaller.
//
// Frame 7 is drawn, not captured, so its words must be the app's: the two reminder texts (f7.n1.text,
// f7.n2.text) are real ones the AI coach wrote for the screenshot account in that language
// (POST /coach/message, Friendly voice); the four actions (f7.a1…a4) are the app's translations of
// its reminder buttons; "4時間前" and "今" are how iOS dates a notification.
window.WORDS = {
  ja: {
    "f1.pain": "今度こそ、\n続く習慣を。", "f1.answer": "あなたのカレンダーを\n知っているAIコーチ。",
    "f2.pain": "会議が\n長引いた？", "f2.answer": "習慣は別の時間へ。\nなくなりません。",
    "f3.pain": "しつこい通知に\nうんざり？", "f3.answer": "AIコーチの話し方は、\n自分で選べます。",
    "f4.pain": "同じ習慣ばかり\nサボる？", "f4.answer": "伝えるだけで、AIコーチが\n計画を直します。",
    "f5.pain": "本当に\n効果ある？", "f5.answer": "「すごい！」より、\n本当の数字を。",
    "f6.pain": "1日休んでも、\n終わりじゃない。", "f6.answer": "1年まるごと、\n1日ずつ見渡せます。",
    "f7.pain": "通知、スルー\nしていませんか？", "f7.answer": "AIコーチが毎回書きます。\n通知からそのまま返事。",
    "f8.pain": "また記録を\n忘れた？", "f8.answer": "Appleヘルスケアが\n自動でチェック。",
    "f9.pain": "今週は忙しい？\n体調不良？", "f9.answer": "しばらく軽めに。あとは\n自動で元に戻ります。",
    "f10.pain": "いい1週間\nでしたか？", "f10.answer": "ワンタップで進捗をシェア。",
    "f7.n1.title": "朝ラン", "f7.n1.when": "4時間前", "f7.n1.text": "ハル、今から朝ランを25分ですね。少しずつ続ける一歩を、今日も大切にしていきましょう。",
    "f7.n2.title": "ジム", "f7.n2.when": "今", "f7.n2.text": "ハルさん、ジムの時間です。60分のうち、まずはできるところから始めていきましょう。",
    "f7.a1": "完了", "f7.a2": "あとで（15分）", "f7.a3": "短めにやる", "f7.a4": "今日はスキップ",
    // placements.html: the product page header and the search results image
    "h.title": "今度こそ、\n続く習慣を。", "h.sub": "あなたのカレンダーを知っているAIコーチ。",
    "s.title": "カレンダーを知っている\nAI習慣コーチ。",
  },
};
