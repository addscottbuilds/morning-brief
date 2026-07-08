// Personal configuration — edit freely; the app reads everything from here.
window.MB_CONFIG = {
  // Fallback location when GPS is unavailable or denied
  fallback: { lat: -37.8136, lon: 144.9631, name: "Melbourne" },

  // Time-sensitive items. progressKey items show a tap-to-update progress bar
  // (amount stored on-device); plain items show a countdown only.
  deadlines: [
    {
      id: "qff",
      title: "Qantas 120k bonus — $5,000 spend",
      deadline: "2026-10-05",
      target: 5000,
      progressKey: "mb_qantas_spent",
      sub: "Pace needed: ~$1,700/month on the card",
      stripLabel: "QFF days",
    },
    {
      id: "buyplan",
      title: "$50k investment plan — still unexecuted",
      deadline: null,
      badge: "costing ~$77/wk",
      sub: "$30k ASX ETFs (BGBL / A200 / NDQ / SEMI) + $20k international growth. Smallest next step: place the first ETF order on CommSec.",
    },
    {
      id: "qff-fee",
      title: "Qantas card year-2 fee decision ($399)",
      deadline: "2027-06-01",
      sub: "Reconsider keeping the card before the annual fee lands.",
      hideUntilDays: 120,
    },
  ],

  // Wordle epoch: puzzle #1 was this date; index advances daily
  gameEpoch: "2026-07-09",
};
