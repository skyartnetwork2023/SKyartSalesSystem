import React, { useEffect, useMemo, useState } from 'react';

const PORTAL_MANAGER_URL = 'http://localhost:8081/media-manager.html';
const LOAD_TIMEOUT_MS = 8000;

const PortalManagement: React.FC = () => {
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (iframeLoaded) return;
    const timeoutId = window.setTimeout(() => {
      setHasLoadError(true);
    }, LOAD_TIMEOUT_MS);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [iframeLoaded, retryCount]);

  const iframeSrc = useMemo(() => {
    const separator = PORTAL_MANAGER_URL.includes('?') ? '&' : '?';
    return `${PORTAL_MANAGER_URL}${separator}retry=${retryCount}`;
  }, [retryCount]);

  const handleRetry = () => {
    setIframeLoaded(false);
    setHasLoadError(false);
    setRetryCount((value) => value + 1);
  };

  const isConnecting = !iframeLoaded && !hasLoadError;

  return (
    <div className="flex-1 overflow-auto p-6 md:p-8 text-slate-900 dark:text-slate-100">
      <div className="mb-4">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Portal Management</h2>
        <p className="text-slate-600 dark:text-slate-400 mt-1">
          Embedded media manager for captive portal content.
        </p>
      </div>

      <div className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden h-[calc(100vh-14rem)] min-h-[540px]">
        <iframe
          title="Portal Management"
          src={iframeSrc}
          className="w-full h-full"
          loading="lazy"
          onLoad={() => {
            setIframeLoaded(true);
            setHasLoadError(false);
          }}
          onError={() => {
            setHasLoadError(true);
          }}
        />

        {isConnecting && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80 dark:bg-slate-950/80 p-6">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-4 text-center">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Connecting to portal…</p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Waiting for {PORTAL_MANAGER_URL} to respond.
              </p>
            </div>
          </div>
        )}

        {hasLoadError && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100/95 dark:bg-slate-950/95 p-6">
            <div className="max-w-md w-full rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 p-5 text-center">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Portal is down</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Couldn’t load media manager at {PORTAL_MANAGER_URL}. Make sure the local portal server is running.
              </p>
              <div className="mt-4 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleRetry}
                  className="px-4 py-2 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90"
                >
                  Retry
                </button>
                <a
                  href={PORTAL_MANAGER_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Open in new tab
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PortalManagement;