const FALLBACK_SITE_URL = 'https://www.skyartnetworks.co.tz';

export function resolveSiteUrl() {
  const envValue = (import.meta.env?.VITE_PUBLIC_SITE_URL as string | undefined)?.trim();
  if (envValue) {
    return envValue;
  }
  if (typeof window !== 'undefined' && window.location.origin) {
    return window.location.origin;
  }
  return FALLBACK_SITE_URL;
}

export function buildAccountNoticeUrl(notice: string) {
  const siteUrl = resolveSiteUrl();
  const url = new URL(siteUrl);
  url.searchParams.set('account_notice', notice);
  return url.toString();
}
