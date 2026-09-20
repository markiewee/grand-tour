// Written by `python3 -m adventure journey build`. Do not edit by hand: any change here is
// overwritten the next time the journey is built.
//
// The browser reads the journey file, but a server function cannot: it has to know the midnight
// moment before it decides whether to hand over a single letter, and it must not take that moment
// from anything the caller sends.
export const MIDNIGHT_MS = 1806764400000;
export const LETTERS_CLOSE_MS = 1806764340000;
export const HAS_LETTERBOX = true;

// A demo journey lets anyone move its clock, so a stranger can walk the whole thing in a minute
// instead of waiting a week for it. Never set this on a journey somebody is actually travelling.
export const DEMO = true;

// A demo with no file store of its own shows these instead of real letters, so the whole thing can
// be deployed and walked through without anybody opening an account first.
export const DEMO_LETTERS = [
 {
  "id": "demo00",
  "from": "Mina",
  "text": "You once made us all walk an extra forty minutes to see a bridge, in the rain, and you were right about the bridge. Have a wonderful one. Bring back a stone from the river if you can, you know I collect them.",
  "audio": null,
  "video": null,
  "last": false,
  "at": 0
 },
 {
  "id": "demo01",
  "from": "Tobias",
  "text": "Thirty seconds after you land you will have found the one cafe worth going back to, and you will text me its name and nothing else. Looking forward to it already. Happy birthday.",
  "audio": null,
  "video": null,
  "last": false,
  "at": 1
 },
 {
  "id": "demo02",
  "from": "Priya",
  "text": "I still have the photo you took of the kettle. Not the view, the kettle. That is the whole reason I wanted to come and see things with you. Have the best day. Eat something you cannot pronounce.",
  "audio": null,
  "video": null,
  "last": false,
  "at": 2
 },
 {
  "id": "demo03",
  "from": "Ade",
  "text": "Happy birthday from the back of a very slow train. You are the only person I know who plans a holiday like a letter to someone. Hope it opens well.",
  "audio": null,
  "video": null,
  "last": false,
  "at": 3
 },
 {
  "id": "demo04",
  "from": "Sofia",
  "text": "Four years since the first trip and I have not once had to check whether you were having a good time, you just announce it. Enjoy every hour of this. Send the blurry ones too.",
  "audio": null,
  "video": null,
  "last": false,
  "at": 4
 },
 {
  "id": "demo05",
  "from": "Jonah",
  "text": "Say hello to the river for me. Take the long way. You always do anyway, but take it on purpose this time. Happy birthday.",
  "audio": null,
  "video": null,
  "last": false,
  "at": 5
 },
 {
  "id": "demo06",
  "from": "Grandma Ruth",
  "text": "I have never been to Japan and now I feel I have, because you described the whole route to me twice on the phone. Be careful on the steps at the shrine. I love you very much.",
  "audio": null,
  "video": null,
  "last": false,
  "at": 6
 },
 {
  "id": "demo07",
  "from": "Kai",
  "text": "Ten envelopes, and this is the eleventh. I wrote the others weeks ago and they are all about places. This one is not. Happy birthday. I would go the long way round with you anywhere.",
  "audio": null,
  "video": null,
  "last": true,
  "at": 7
 }
];
