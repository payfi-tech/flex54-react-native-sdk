import type { HostCommand, WidgetEvent } from './types';

const WIDGET_SOURCE = 'kaabo-ai-widget';
const HOST_SOURCE = 'flex54-host';
const EVENTS: readonly WidgetEvent[] = ['ready', 'opened', 'closed'];

/** Parses a WebView message from the widget. Returns null for foreign or malformed data. */
export function parseWidgetMessage(data: string): WidgetEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const { source, v, event } = parsed as Record<string, unknown>;
  if (source !== WIDGET_SOURCE || v !== 1) return null;
  return EVENTS.find((e) => e === event) ?? null;
}

/** JavaScript to inject into the WebView to deliver a command to the widget. */
export function buildCommandScript(command: HostCommand): string {
  const message = JSON.stringify({ source: HOST_SOURCE, v: 1, command });
  return `window.Flex54Bridge&&window.Flex54Bridge.receive(${message});true;`;
}
