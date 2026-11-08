// Imported first by index.ts so an old Node fails with a clear message
// before anything touches node:sqlite (built in from 22.13 without a flag).
const MIN = [22, 13] as const;

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < MIN[0] || (major === MIN[0] && minor < MIN[1])) {
  console.error(
    `Fridge Watch needs Node.js ${MIN[0]}.${MIN[1]} or newer. You have ${process.versions.node}.\n` +
      'Install the current LTS from https://nodejs.org and run the command again.',
  );
  process.exit(1);
}
