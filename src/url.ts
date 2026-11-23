import type { Flex54Environment } from './types';
import { SDK_VERSION } from './version';

const ORIGINS: Record<Flex54Environment, string> = {
  production: 'https://agent.flex54.com',
  development: 'https://agent-dev.flex54.com',
};

export function widgetOrigin(env: Flex54Environment): string {
  return ORIGINS[env];
}

// URLSearchParams is only partially implemented in React Native, so encode by hand
// (form-encoding: space becomes '+').
const enc = (value: string) => encodeURIComponent(value).replace(/%20/g, '+');

export function buildWidgetUrl(opts: { widgetId: string; environment: Flex54Environment }): string {
  const params: [string, string][] = [
    ['widgetId', opts.widgetId],
    ['device', 'mobile'],
    ['host', 'native'],
    ['platform', 'react-native'],
    ['sdkVersion', SDK_VERSION],
  ];
  const query = params.map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&');
  return `${widgetOrigin(opts.environment)}/?${query}`;
}

/** True for URLs the WebView should load itself; everything else goes to the system browser. */
export function shouldLoadInWebView(url: string, origin: string): boolean {
  if (typeof url !== 'string') return false;
  if (url === 'about:blank' || url === 'about:srcdoc') return true;
  if (/^(blob|data):/i.test(url)) return true;
  if (!url.startsWith(origin)) return false;
  const next = url.charAt(origin.length);
  return next === '' || next === '/' || next === '?' || next === '#';
}
