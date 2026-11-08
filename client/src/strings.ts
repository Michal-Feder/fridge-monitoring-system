// All UI text lives here (CLAUDE.md). UI language: English.
export const strings = {
  appName: 'Fridge Watch',
  tagline: 'Squanchy Bakery fridge temperatures',
  health: {
    checking: 'Checking server…',
    ok: (node: string) => `Server is running (Node ${node}).`,
    down: 'Cannot reach the server. Is `npm run dev` running?',
  },
} as const;
