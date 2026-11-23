import { buildWidgetUrl, shouldLoadInWebView } from '../url';

it('builds production and development URLs', () => {
  expect(buildWidgetUrl({ widgetId: 'w 1', environment: 'production' })).toBe(
    'https://agent.flex54.com/?widgetId=w+1&device=mobile&host=native&platform=react-native&sdkVersion=0.1.0');
  expect(buildWidgetUrl({ widgetId: 'w1', environment: 'development' })).toMatch(/^https:\/\/agent-dev\.flex54\.com\/\?widgetId=w1&/);
});
const O = 'https://agent.flex54.com';
it.each([
  [`${O}/?widgetId=w1`, true], [`${O}/other`, true], ['about:blank', true], ['blob:https://agent.flex54.com/x', true],
  ['data:audio/webm;base64,AA', true], ['https://pay.flex54.com/i/abc', false], ['https://agent.flex54.com.evil.com/', false],
  ['tel:+2348000000000', false], ['mailto:a@b.co', false], ['not a url', false],
])('shouldLoadInWebView(%s) -> %s', (url, expected) => expect(shouldLoadInWebView(url, O)).toBe(expected));
