import type { Level } from '../api.ts';
import { strings } from '../strings.ts';

// Each level has its own icon AND word, so it reads without colour (colour-blind users, print, sun glare).
const STYLE: Record<Level, string> = {
  red: 'bg-red-600 text-white',
  was_red: 'bg-white text-red-700 border border-red-600',
  orange: 'bg-amber-400 text-amber-950',
  grey: 'bg-white text-slate-700 border border-dashed border-slate-500',
  green: 'bg-green-600 text-white',
};

export function StatusIcon({ level, className = 'h-4 w-4' }: { level: Level; className?: string }) {
  const common = { className, viewBox: '0 0 20 20', fill: 'currentColor', 'aria-hidden': true };
  if (level === 'green') {
    return (
      <svg {...common}>
        <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
      </svg>
    );
  }
  if (level === 'was_red') {
    // clock: "in the past", so it is not read as the same as red's warning triangle
    return (
      <svg {...common}>
        <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-12.25a.75.75 0 0 0-1.5 0V10c0 .2.08.39.22.53l2.75 2.75a.75.75 0 1 0 1.06-1.06l-2.53-2.53V5.75Z" clipRule="evenodd" />
      </svg>
    );
  }
  if (level === 'grey') {
    return (
      <svg {...common}>
        <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm-1.5-11a1.5 1.5 0 1 1 2.2 1.3c-.6.3-1 .9-1 1.6V10a.75.75 0 0 0 1.5 0v-.1c0-.2.1-.3.3-.4A3 3 0 1 0 7 7a.75.75 0 0 0 1.5 0ZM10 14.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path fillRule="evenodd" d="M8.3 2.9a2 2 0 0 1 3.4 0l6 10.4A2 2 0 0 1 16 16.3H4a2 2 0 0 1-1.7-3l6-10.4ZM10 7a.9.9 0 0 0-.9.9v3a.9.9 0 0 0 1.8 0v-3A.9.9 0 0 0 10 7Zm0 7.6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
    </svg>
  );
}

export function StatusBadge({ level }: { level: Level }) {
  return (
    // long labels (was_red) may wrap inside the badge instead of squeezing the fridge name
    <span className={`inline-flex max-w-[55%] shrink-0 items-center gap-1 rounded-2xl px-2.5 py-0.5 text-xs font-semibold leading-tight ${STYLE[level]}`}>
      <StatusIcon level={level} className="h-3.5 w-3.5 shrink-0" />
      {strings.level[level]}
    </span>
  );
}
