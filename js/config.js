// Personal configuration — edit freely; the app reads everything from here.
// Keep this file free of sensitive detail: amounts you track are entered on
// the phone and stored in localStorage, never in the repo.
window.MB_CONFIG = {
  // Fallback location when GPS is unavailable or denied
  fallback: { lat: -37.8136, lon: 144.9631, name: "Melbourne" },

  // Time-sensitive items. progressKey items show a tap-to-update progress bar
  // (amount stored on-device); plain items show a countdown only.
  deadlines: [
    {
      id: "card-bonus",
      title: "Card bonus — spend target",
      deadline: "2026-10-05",
      target: 5000,
      progressKey: "mb_qantas_spent",
      sub: "Tap the tracker to update progress (saved on this device).",
      stripLabel: "Bonus days",
    },
    {
      id: "invest-plan",
      title: "Investment plan — next tranche unexecuted",
      deadline: null,
      badge: "waiting on you",
      sub: "Smallest next step: place the first order.",
    },
    {
      id: "card-fee",
      title: "Card annual-fee decision",
      deadline: "2027-06-01",
      sub: "Reconsider keeping the card before the year-2 fee lands.",
      hideUntilDays: 120,
    },
  ],

  // Wordle epoch: puzzle #1 was this date; index advances daily
  gameEpoch: "2026-07-09",
};
