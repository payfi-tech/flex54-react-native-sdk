import { buildCommandScript, parseWidgetMessage } from '../protocol';
import { SDK_VERSION } from '../version';

it('parses widget events', () => {
  for (const e of ['ready', 'opened', 'closed'])
    expect(parseWidgetMessage(JSON.stringify({ source: 'kaabo-ai-widget', v: 1, event: e }))).toBe(e);
});
it.each([
  'hello', 'null', '42', '{}', JSON.stringify({ source: 'other', v: 1, event: 'ready' }),
  JSON.stringify({ source: 'kaabo-ai-widget', v: 2, event: 'ready' }),
  JSON.stringify({ source: 'kaabo-ai-widget', v: 1, viewport: 'fullscreen' }),
  JSON.stringify({ source: 'kaabo-ai-widget', v: 1, event: 'boom' }),
])('parseWidgetMessage ignores foreign and malformed data: %s', (d) => expect(parseWidgetMessage(d)).toBeNull());
it('builds the injected command script', () => {
  expect(buildCommandScript('open')).toBe(
    'window.Flex54Bridge&&window.Flex54Bridge.receive({"source":"flex54-host","v":1,"command":"open"});true;');
});
it('SDK_VERSION matches package.json', () => expect(SDK_VERSION).toBe(require('../../package.json').version));
