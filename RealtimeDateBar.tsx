import { useEffect, useMemo, useState } from 'react';

interface RealtimeDateBarProps {
  className?: string;
  showTimeZone?: boolean;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
});

export default function RealtimeDateBar({ className = '', showTimeZone = true }: RealtimeDateBarProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const timezoneLabel = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (error) {
      console.warn('Failed to detect timezone', error);
      return 'Local time';
    }
  }, []);

  return (
    <div
      className={`w-full bg-white/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 backdrop-blur supports-[backdrop-filter]:backdrop-blur flex-shrink-0 ${className}`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-200 flex flex-wrap items-center justify-center gap-2">
        <span className="text-slate-900 dark:text-white">{dateFormatter.format(now)}</span>
        <span className="text-slate-400">•</span>
        <span>{timeFormatter.format(now)}</span>
        {showTimeZone && (
          <>
            <span className="text-slate-400">•</span>
            <span>{timezoneLabel}</span>
          </>
        )}
      </div>
    </div>
  );
}
