import { BackHandler, Linking, StyleSheet } from 'react-native';
import { act, fireEvent, isHiddenFromAccessibility, render, screen } from '@testing-library/react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Flex54Widget, READY_TIMEOUT_MS } from '../Flex54Widget';
import { Flex54, resetFlex54ForTesting } from '../Flex54';
import { buildCommandScript } from '../protocol';
import { SDK_VERSION } from '../version';

type AnyProps = Record<string, any>;

// Shared state for the WebView stub. Only read lazily (at render time), so the hoisted
// jest.mock factory may reference it.
const mockWebView = {
  lastProps: null as AnyProps | null,
  mounts: 0,
  injectJavaScript: jest.fn(),
};

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  const WebView = React.forwardRef((props: AnyProps, ref: unknown) => {
    mockWebView.lastProps = props;
    React.useEffect(() => {
      mockWebView.mounts += 1;
    }, []);
    React.useImperativeHandle(ref, () => ({ injectJavaScript: mockWebView.injectJavaScript }));
    return React.createElement(View, { testID: 'webview' });
  });
  return { __esModule: true, default: WebView, WebView };
});

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const defaultInsetsImpl = jest.mocked(useSafeAreaInsets).getMockImplementation()!;

const PROD_URL =
  `https://agent.flex54.com/?widgetId=w1&device=mobile&host=native&platform=react-native&sdkVersion=${SDK_VERSION}`;
const DEV_URL =
  `https://agent-dev.flex54.com/?widgetId=w1&device=mobile&host=native&platform=react-native&sdkVersion=${SDK_VERSION}`;

const webview = () => {
  if (!mockWebView.lastProps) throw new Error('WebView was never rendered');
  return mockWebView.lastProps;
};

const fire = (event: string) =>
  act(() => {
    webview().onMessage({
      nativeEvent: { data: JSON.stringify({ source: 'kaabo-ai-widget', v: 1, event }) },
    });
  });

const launcher = () => screen.getByLabelText('Open chat');
const queryLauncher = () => screen.queryByLabelText('Open chat');
const surface = () => screen.getByTestId('flex54-surface', { includeHiddenElements: true });
const styleOf = (el: { props: AnyProps }) => StyleSheet.flatten(el.props.style);

const openViaLauncher = () => fireEvent.press(launcher());

type BackListener = Parameters<typeof BackHandler.addEventListener>[1];

let openURL: jest.SpyInstance;
let addBackListener: jest.SpyInstance;
let backHandlers: BackListener[];
let backRemovals: jest.Mock[];

beforeEach(() => {
  resetFlex54ForTesting();
  mockWebView.lastProps = null;
  mockWebView.mounts = 0;
  mockWebView.injectJavaScript.mockClear();
  jest.mocked(useSafeAreaInsets).mockImplementation(defaultInsetsImpl);
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  backHandlers = [];
  backRemovals = [];
  addBackListener = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    backHandlers.push(handler);
    const remove = jest.fn();
    backRemovals.push(remove);
    return { remove };
  });
});

afterEach(() => {
  openURL.mockRestore();
  addBackListener.mockRestore();
});

describe('Flex54Widget', () => {
  it('shows a bottom-right launcher and no WebView until first open', async () => {
    jest.mocked(useSafeAreaInsets).mockReturnValue({ top: 47, right: 4, bottom: 34, left: 8 });
    await render(<Flex54Widget widgetId="w1" />);

    const style = styleOf(launcher());
    expect(style).toMatchObject({
      position: 'absolute',
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: '#000000',
      bottom: 34 + 16,
      right: 4 + 16,
    });
    expect(style).not.toHaveProperty('left');
    expect(launcher()).toHaveProp('accessibilityRole', 'button');
    expect(mockWebView.lastProps).toBeNull();
    expect(screen.queryByTestId('flex54-surface', { includeHiddenElements: true })).toBeNull();
  });

  it('places the launcher bottom-left when position="bottom-left"', async () => {
    jest.mocked(useSafeAreaInsets).mockReturnValue({ top: 47, right: 4, bottom: 34, left: 8 });
    await render(<Flex54Widget widgetId="w1" position="bottom-left" />);

    const style = styleOf(launcher());
    expect(style).toMatchObject({ bottom: 34 + 16, left: 8 + 16 });
    expect(style).not.toHaveProperty('right');
  });

  it('renders no launcher when launcher={false}', async () => {
    await render(<Flex54Widget widgetId="w1" launcher={false} />);
    expect(queryLauncher()).toBeNull();
    expect(mockWebView.lastProps).toBeNull();

    // Still controllable through the Flex54 API.
    await act(() => Flex54.open());
    expect(webview().source).toEqual({ uri: PROD_URL });
    expect(queryLauncher()).toBeNull();
  });

  it('loads the production widget URL on first press', async () => {
    await render(<Flex54Widget widgetId="w1" />);
    await openViaLauncher();

    expect(webview().source).toEqual({ uri: PROD_URL });
    expect(mockWebView.mounts).toBe(1);
    expect(queryLauncher()).toBeNull();
    expect(surface()).toHaveProp('pointerEvents', 'auto');
    expect(isHiddenFromAccessibility(surface())).toBe(false);
    expect(webview()).toMatchObject({
      domStorageEnabled: true,
      javaScriptEnabled: true,
      allowsInlineMediaPlayback: true,
      mediaCapturePermissionGrantType: 'grantIfSameHostElsePrompt',
      allowsBackForwardNavigationGestures: false,
      webviewDebuggingEnabled: true, // __DEV__ is true under jest
    });
  });

  it('uses agent-dev.flex54.com for environment="development"', async () => {
    await render(<Flex54Widget widgetId="w1" environment="development" />);
    await openViaLauncher();
    expect(webview().source).toEqual({ uri: DEV_URL });
  });

  it('sends open on ready', async () => {
    await render(<Flex54Widget widgetId="w1" />);
    await openViaLauncher();

    expect(mockWebView.injectJavaScript).not.toHaveBeenCalled();
    expect(screen.getByTestId('flex54-loading')).toBeOnTheScreen();

    await fire('ready');
    expect(mockWebView.injectJavaScript).toHaveBeenCalledTimes(1);
    expect(mockWebView.injectJavaScript).toHaveBeenCalledWith(buildCommandScript('open'));
    expect(screen.queryByTestId('flex54-loading')).toBeNull();
  });

  it('hides on closed after opened and calls onOpen/onClose once', async () => {
    const onOpen = jest.fn();
    const onClose = jest.fn();
    await render(<Flex54Widget widgetId="w1" onOpen={onOpen} onClose={onClose} />);
    await openViaLauncher();
    await fire('ready');
    await fire('opened');

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(queryLauncher()).toBeNull();

    await fire('closed');
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(launcher()).toBeOnTheScreen();
    expect(surface()).toHaveProp('pointerEvents', 'none');
    expect(isHiddenFromAccessibility(surface())).toBe(true);
    // The WebView stays mounted (hidden) so reopening is instant.
    expect(mockWebView.mounts).toBe(1);
  });

  it('uses the latest onOpen/onClose after a rerender', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const r = await render(<Flex54Widget widgetId="w1" onOpen={first} />);
    await r.rerender(<Flex54Widget widgetId="w1" onOpen={second} />);
    await openViaLauncher();
    await fire('ready');
    await fire('opened');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('opens off-origin links with Linking', async () => {
    await render(<Flex54Widget widgetId="w1" />);
    await openViaLauncher();
    await fire('ready'); // before ready a blocked request is also a load error (tested below)
    const p = webview();

    expect(p.onShouldStartLoadWithRequest({ url: 'https://pay.flex54.com/i/abc', isTopFrame: true })).toBe(false);
    expect(openURL).toHaveBeenCalledTimes(1);
    expect(openURL).toHaveBeenCalledWith('https://pay.flex54.com/i/abc');

    openURL.mockClear();
    expect(p.onShouldStartLoadWithRequest({ url: 'https://agent.flex54.com/chat?x=1', isTopFrame: true })).toBe(true);
    expect(p.onShouldStartLoadWithRequest({ url: PROD_URL, isTopFrame: true })).toBe(true);
    expect(p.onShouldStartLoadWithRequest({ url: 'https://ads.example.com/frame', isTopFrame: false })).toBe(true);
    // Look-alike host is off-origin.
    expect(p.onShouldStartLoadWithRequest({ url: 'https://agent.flex54.com.evil.io/', isTopFrame: true })).toBe(false);
    expect(openURL).toHaveBeenCalledTimes(1);
    expect(openURL).toHaveBeenCalledWith('https://agent.flex54.com.evil.io/');

    openURL.mockClear();
    p.onOpenWindow({ nativeEvent: { targetUrl: 'https://pay.flex54.com/i/abc' } });
    expect(openURL).toHaveBeenCalledTimes(1);
    expect(openURL).toHaveBeenCalledWith('https://pay.flex54.com/i/abc');
  });

  it('loading overlay has a Close button that hides the surface', async () => {
    await render(<Flex54Widget widgetId="w1" />);
    await openViaLauncher();
    expect(screen.getByLabelText('Loading chat')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Close chat' }));
    expect(surface()).toHaveProp('pointerEvents', 'none');
    expect(isHiddenFromAccessibility(surface())).toBe(true);
    expect(launcher()).toBeOnTheScreen();
    // The guarded close goes out even before ready (a no-op on a page without the bridge).
    expect(mockWebView.injectJavaScript).toHaveBeenCalledTimes(1);
    expect(mockWebView.injectJavaScript).toHaveBeenCalledWith(buildCommandScript('close'));
  });

  it('a blocked off-origin top-frame request before ready shows the error view', async () => {
    await render(<Flex54Widget widgetId="w1" />);
    await openViaLauncher();

    let allowed: boolean | undefined;
    await act(() => {
      allowed = webview().onShouldStartLoadWithRequest({ url: 'https://evil.example/x', isTopFrame: true });
    });
    expect(allowed).toBe(false);
    expect(openURL).toHaveBeenCalledTimes(1);
    expect(openURL).toHaveBeenCalledWith('https://evil.example/x');
    expect(screen.getByText("Couldn't load the chat")).toBeOnTheScreen();
    expect(screen.queryByLabelText('Loading chat')).toBeNull();
  });

  it('a blocked off-origin request after ready only opens the browser', async () => {
    await render(<Flex54Widget widgetId="w1" />);
    await openViaLauncher();
    await fire('ready');

    let allowed: boolean | undefined;
    await act(() => {
      allowed = webview().onShouldStartLoadWithRequest({ url: 'https://evil.example/x', isTopFrame: true });
    });
    expect(allowed).toBe(false);
    expect(openURL).toHaveBeenCalledTimes(1);
    expect(openURL).toHaveBeenCalledWith('https://evil.example/x');
    expect(screen.queryByText("Couldn't load the chat")).toBeNull();
    expect(surface()).toHaveProp('pointerEvents', 'auto');
  });

  it('Android back closes the chat when open and passes through when closed', async () => {
    await render(<Flex54Widget widgetId="w1" />);
    // Nothing registered while closed: back goes to the app.
    expect(addBackListener).not.toHaveBeenCalled();

    await openViaLauncher();
    await fire('ready');
    expect(addBackListener).toHaveBeenCalledTimes(1);
    expect(addBackListener).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function));
    mockWebView.injectJavaScript.mockClear();

    const handler = backHandlers[0];
    const backPress = { type: 'hardwareBackPress', timeStamp: 0 };
    let handled: boolean | undefined;
    await act(() => {
      handled = handler(backPress);
    });
    expect(handled).toBe(true);
    expect(mockWebView.injectJavaScript).toHaveBeenCalledTimes(1);
    expect(mockWebView.injectJavaScript).toHaveBeenCalledWith(buildCommandScript('close'));
    expect(launcher()).toBeOnTheScreen();
    expect(surface()).toHaveProp('pointerEvents', 'none');

    // Hidden: the listener is removed, and the handler passes through anyway.
    expect(backRemovals[0]).toHaveBeenCalledTimes(1);
    await act(() => {
      handled = handler(backPress);
    });
    expect(handled).toBe(false);
    expect(mockWebView.injectJavaScript).toHaveBeenCalledTimes(1);
  });

  it('shows the error view on load error and Try again remounts the WebView', async () => {
    await render(<Flex54Widget widgetId="w1" />);
    await openViaLauncher();
    expect(mockWebView.mounts).toBe(1);

    await act(() => webview().onError({ nativeEvent: { code: -1009, description: 'offline' } }));
    expect(screen.getByText("Couldn't load the chat")).toBeOnTheScreen();
    expect(screen.getByText('Check your connection and try again.')).toBeOnTheScreen();
    expect(screen.queryByTestId('flex54-loading')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(mockWebView.mounts).toBe(2);
    expect(screen.queryByText("Couldn't load the chat")).toBeNull();
    expect(screen.getByTestId('flex54-loading')).toBeOnTheScreen();

    // The retried page loads and syncs.
    await fire('ready');
    expect(mockWebView.injectJavaScript).toHaveBeenLastCalledWith(buildCommandScript('open'));
  });

  describe('ready timeout', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const pageLoaded = () => act(() => webview().onLoadEnd({ nativeEvent: { url: PROD_URL, loading: false } }));
    const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms));

    it('shows the error view when the page loads but the widget never sends ready', async () => {
      // e.g. a stale cached widget page from before native mode existed.
      await render(<Flex54Widget widgetId="w1" />);
      await openViaLauncher();
      await pageLoaded();

      await advance(READY_TIMEOUT_MS - 1);
      expect(screen.queryByText("Couldn't load the chat")).toBeNull();
      expect(screen.getByTestId('flex54-loading')).toBeOnTheScreen();

      await advance(1);
      expect(screen.getByText("Couldn't load the chat")).toBeOnTheScreen();
      expect(screen.queryByTestId('flex54-loading')).toBeNull();

      await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
      expect(mockWebView.mounts).toBe(2);
      expect(screen.queryByText("Couldn't load the chat")).toBeNull();
    });

    it('does not time out once the widget has sent ready', async () => {
      await render(<Flex54Widget widgetId="w1" />);
      await openViaLauncher();
      await pageLoaded();
      await fire('ready');

      await advance(READY_TIMEOUT_MS * 3);
      expect(screen.queryByText("Couldn't load the chat")).toBeNull();
    });

    it("a replaced page's pending timeout does not fail the new page", async () => {
      await render(<Flex54Widget widgetId="w1" />);
      await openViaLauncher();
      await pageLoaded();

      await advance(READY_TIMEOUT_MS - 1000);
      await act(() => webview().onContentProcessDidTerminate({ nativeEvent: {} }));
      expect(mockWebView.mounts).toBe(2);

      // The old page's deadline passes; the new page has not finished loading yet.
      await advance(2000);
      expect(screen.queryByText("Couldn't load the chat")).toBeNull();

      // The new page gets its own full window.
      await pageLoaded();
      await advance(READY_TIMEOUT_MS - 1);
      expect(screen.queryByText("Couldn't load the chat")).toBeNull();
      await advance(1);
      expect(screen.getByText("Couldn't load the chat")).toBeOnTheScreen();
    });
  });

  it('treats only main-frame HTTP errors >= 400 as load errors, and Close hides the surface', async () => {
    await render(<Flex54Widget widgetId="w1" />);
    await openViaLauncher();

    await act(() => webview().onHttpError({ nativeEvent: { statusCode: 304, description: '' } }));
    expect(screen.queryByText("Couldn't load the chat")).toBeNull();

    await act(() => webview().onHttpError({ nativeEvent: { statusCode: 503, description: 'unavailable' } }));
    expect(screen.getByText("Couldn't load the chat")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(launcher()).toBeOnTheScreen();
    expect(surface()).toHaveProp('pointerEvents', 'none');
    expect(mockWebView.injectJavaScript).toHaveBeenLastCalledWith(buildCommandScript('close'));
  });

  it('remounts the WebView when the web process dies and reopens after ready', async () => {
    await render(<Flex54Widget widgetId="w1" />);
    await openViaLauncher();
    await fire('ready');
    await fire('opened');

    await act(() => webview().onContentProcessDidTerminate({ nativeEvent: {} }));
    expect(mockWebView.mounts).toBe(2);
    mockWebView.injectJavaScript.mockClear();
    await fire('ready');
    expect(mockWebView.injectJavaScript).toHaveBeenCalledTimes(1);
    expect(mockWebView.injectJavaScript).toHaveBeenLastCalledWith(buildCommandScript('open'));

    await fire('opened');
    await act(() => webview().onRenderProcessGone({ nativeEvent: { didCrash: true } }));
    expect(mockWebView.mounts).toBe(3);
    mockWebView.injectJavaScript.mockClear();
    await fire('ready');
    expect(mockWebView.injectJavaScript).toHaveBeenCalledTimes(1);
    expect(mockWebView.injectJavaScript).toHaveBeenLastCalledWith(buildCommandScript('open'));
  });

  it('Flex54.open() opens a mounted widget and does nothing after unmount', async () => {
    const r = await render(<Flex54Widget widgetId="w1" />);
    await act(() => Flex54.open());
    expect(webview().source).toEqual({ uri: PROD_URL });
    expect(queryLauncher()).toBeNull();
    expect(Flex54.isOpen()).toBe(true);

    await r.unmount();
    expect(Flex54.isOpen()).toBe(false);
    await act(() => Flex54.open());
    expect(mockWebView.mounts).toBe(1);
    expect(mockWebView.injectJavaScript).not.toHaveBeenCalled();
  });

  it('a reset made before ready is delivered by the next widget that mounts', async () => {
    const first = await render(<Flex54Widget widgetId="w1" />);
    await act(() => Flex54.reset());
    await first.unmount();
    mockWebView.lastProps = null;

    await render(<Flex54Widget widgetId="w1" />);
    // Loads hidden, without the user opening the chat.
    expect(webview().source).toEqual({ uri: PROD_URL });
    expect(surface()).toHaveProp('pointerEvents', 'none');
    expect(launcher()).toBeOnTheScreen();
    await fire('ready');
    expect(mockWebView.injectJavaScript).toHaveBeenCalledTimes(1);
    expect(mockWebView.injectJavaScript).toHaveBeenCalledWith(buildCommandScript('reset'));
  });

  it('root lets touches through (pointerEvents box-none)', async () => {
    await render(<Flex54Widget widgetId="w1" />);
    const root = screen.getByTestId('flex54-root');
    expect(root).toHaveProp('pointerEvents', 'box-none');
    expect(styleOf(root)).toMatchObject({ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 });
  });
});
