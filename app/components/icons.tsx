/** One stroke family (1.75px, round) for every icon in the app. */
const PATHS = {
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4-4',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.5 7.5 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-2-1.2L14.5 3h-4L10 5.6a7.4 7.4 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.5 7.5 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 2 1.2l.5 2.6h4l.5-2.6a7.4 7.4 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z',
  mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
  message: 'M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-7l-5 4v-4H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  arrowRight: 'M5 12h14m-6-6 6 6-6 6',
  arrowLeft: 'M19 12H5m6-6-6 6 6 6',
  external: 'M14 5h5v5m0-5-8 8M18 14v5H5V6h5',
  sparkle: 'M12 3.5 13.9 9 19.5 11l-5.6 2L12 18.5 10.1 13 4.5 11l5.6-2L12 3.5Z',
  pause: 'M9 5v14M15 5v14',
  play: 'M8 5v14l11-7L8 5Z',
  upload: 'M12 16V4m-5 5 5-5 5 5M5 20h14',
  download: 'M12 4v12m-5-5 5 5 5-5M5 20h14',
  close: 'M6 6l12 12M18 6 6 18',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4.5l3 2',
  calendar: 'M5 6h14v14H5zM5 10h14M9 3v4m6-4v4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
  building: 'M5 21V4h9v17M14 9h5v12M8 8h3M8 12h3M8 16h3M3 21h18',
  chevronDown: 'm6 9 6 6 6-6',
  chevronRight: 'm9 6 6 6-6 6',
  flag: 'M5 21V4m0 0h11l-2 4 2 4H5',
  hand: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5v-5a1.5 1.5 0 0 1 3 0V11m0-4.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a6 6 0 0 1-5-2.7L3 15a1.5 1.5 0 0 1 2.5-1.7L8 16',
  skip: 'M6 5l8 7-8 7V5Zm12 0v14',
  edit: 'M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4',
  plus: 'M12 5v14M5 12h14',
  card: 'M3 6h18v12H3zM3 10h18',
  phone: 'M7 3h10v18H7zM11 18h2',
  filter: 'M4 5h16l-6 7.5V19l-4 2v-8.5L4 5Z',
  trash: 'M5 7h14M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
