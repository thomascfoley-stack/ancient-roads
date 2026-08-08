// THE ONE LOCALE THIS PRODUCT FORMATS IN — block `L2c`.
//
// Every `toLocaleDateString`-family call must pass this. Unpassed, they resolve against the
// READER's runtime, so an all-English application renders Chinese dates on a `zh-CN` browser. That
// is not correct locale behaviour, it is an inconsistent hybrid — and it convinced a careful
// auditor the server was misconfigured (the deck screenshotted `8月8日周六` and filed a
// server-locale leak; direct testing later showed it follows the client).
//
// PRODUCT DECISION, RECORDED SO IT IS REVISITED DELIBERATELY (spec §L2c): pinning is correct
// *while the product is English-only* — the corpus is English-language historical writing, the UI
// is English, and nothing is translated. If localisation ever reaches the roadmap this constant
// becomes a real locale system rather than a pin, and this comment is the pointer to that
// decision. Backlog: "Real locale system (beyond the en-US pin)".
export const DISPLAY_LOCALE = 'en-US';
