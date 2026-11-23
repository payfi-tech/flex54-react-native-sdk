import * as React from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Linking,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';
import type { WebViewMessageEvent, WebViewProps } from 'react-native-webview';
import { Flex54Controller } from './controller';
import { ErrorView } from './ErrorView';
import { registerController } from './Flex54';
import { Launcher } from './Launcher';
import { buildCommandScript, parseWidgetMessage } from './protocol';
import type { Flex54Environment, Flex54Position } from './types';
import { buildWidgetUrl, shouldLoadInWebView, widgetOrigin } from './url';

export type Flex54WidgetProps = {
  widgetId: string;
  /** Default `'production'`. */
  environment?: Flex54Environment;
  /** Show the floating chat button. Default `true`. */
  launcher?: boolean;
  /** Default `'bottom-right'`. */
  position?: Flex54Position;
  onOpen?: () => void;
  onClose?: () => void;
};

type ShouldStartLoadRequest = Parameters<NonNullable<WebViewProps['onShouldStartLoadWithRequest']>>[0];

const SLIDE_MS = 250;

/**
 * How long after the page finishes loading the widget has to send `ready`. A loaded page
 * that stays silent is not a native-mode widget (e.g. a stale cached copy, or an older
 * deploy), so show the error view instead of spinning forever.
 */
export const READY_TIMEOUT_MS = 10_000;

/**
 * The Flex54 chat widget. Render it once, as the last child of your root component.
 * It draws a launcher and a full-screen chat surface over the app; touches elsewhere pass through.
 */
export function Flex54Widget(props: Flex54WidgetProps): React.ReactElement {
  return (
    <SafeAreaProvider style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <WidgetHost {...props} />
    </SafeAreaProvider>
  );
}

function openExternal(url: string): void {
  // Rejects when nothing can handle the URL; there is nothing useful to do about it here.
  Linking.openURL(url).catch(() => {});
}

function WidgetHost({
  widgetId,
  environment = 'production',
  launcher = true,
  position = 'bottom-right',
  onOpen,
  onClose,
}: Flex54WidgetProps): React.ReactElement {
  const controllerRef = React.useRef<Flex54Controller | null>(null);
  if (controllerRef.current === null) controllerRef.current = new Flex54Controller();
  const controller = controllerRef.current;

  const { mounted, visible, ready, loadError, webViewKey } = React.useSyncExternalStore(
    controller.subscribe,
    controller.getState,
  );
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  // `object`, not the default `undefined`: react-native-webview types props as `WebViewProps & P`.
  const webviewRef = React.useRef<WebView<object>>(null);

  React.useLayoutEffect(() => {
    controller.setCallbacks({ onOpen, onClose });
  });

  // One stable sender for the component's lifetime. It reads the ref at call time, so it
  // follows WebView remounts (retry, process death) without being re-attached; detaching
  // in between could drop a `close` and leave the chat open behind a hidden surface.
  React.useEffect(() => {
    controller.attachSender((command) => webviewRef.current?.injectJavaScript(buildCommandScript(command)));
    return () => controller.attachSender(null);
  }, [controller]);

  React.useEffect(() => registerController(controller), [controller]);

  // Registered only while the chat is visible, so it is the newest listener and runs
  // before the app's own (e.g. navigation) back handlers.
  React.useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!controller.isOpen()) return false;
      controller.close();
      return true;
    });
    return () => subscription.remove();
  }, [controller, visible]);

  const [translateY] = React.useState(() => new Animated.Value(height));
  React.useEffect(() => {
    if (!mounted) return;
    Animated.timing(translateY, {
      toValue: visible ? 0 : height,
      duration: SLIDE_MS,
      useNativeDriver: true,
    }).start();
  }, [translateY, mounted, visible, height]);

  const origin = widgetOrigin(environment);
  const uri = buildWidgetUrl({ widgetId, environment });
  const source = React.useMemo(() => ({ uri }), [uri]);

  // Armed when a page finishes loading; cancelled by `ready`, by a WebView remount (new key)
  // and on unmount, so a replaced page's deadline never fails its successor.
  const readyTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearReadyTimer = React.useCallback(() => {
    if (readyTimerRef.current !== null) clearTimeout(readyTimerRef.current);
    readyTimerRef.current = null;
  }, []);
  React.useEffect(() => {
    if (ready) clearReadyTimer();
  }, [ready, clearReadyTimer]);
  React.useEffect(() => clearReadyTimer, [webViewKey, clearReadyTimer]);

  const onLoadEnd = () => {
    clearReadyTimer();
    if (controller.getState().ready) return;
    readyTimerRef.current = setTimeout(() => {
      readyTimerRef.current = null;
      if (!controller.getState().ready) controller.handleLoadError();
    }, READY_TIMEOUT_MS);
  };

  const onMessage = (e: WebViewMessageEvent) => {
    const event = parseWidgetMessage(e.nativeEvent.data);
    if (event) controller.handleWidgetEvent(event);
  };

  const onShouldStartLoadWithRequest = (req: ShouldStartLoadRequest): boolean => {
    if (req.isTopFrame === false || shouldLoadInWebView(req.url, origin)) return true;
    openExternal(req.url);
    // Before `ready`, a blocked top-frame request means the page itself never loads (e.g. an
    // off-origin redirect). WKWebView reports the cancelled load as error 102, which
    // react-native-webview drops, so show the error view instead of an endless spinner.
    if (!controller.getState().ready) controller.handleLoadError();
    return false;
  };

  return (
    <View testID="flex54-root" style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {launcher && !visible ? (
        <Launcher position={position} insets={insets} onPress={() => controller.open()} />
      ) : null}
      {mounted ? (
        <Animated.View
          testID="flex54-surface"
          pointerEvents={visible ? 'auto' : 'none'}
          accessibilityElementsHidden={!visible}
          importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
          style={[StyleSheet.absoluteFill, { transform: [{ translateY }] }]}
        >
          <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
            <WebView
              key={webViewKey}
              ref={webviewRef}
              source={source}
              style={styles.webview}
              onMessage={onMessage}
              onLoadEnd={onLoadEnd}
              onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
              onOpenWindow={(e) => openExternal(e.nativeEvent.targetUrl)}
              onError={() => controller.handleLoadError()}
              onHttpError={(e) => {
                if (e.nativeEvent.statusCode >= 400) controller.handleLoadError();
              }}
              onContentProcessDidTerminate={() => controller.handleProcessTerminated()}
              onRenderProcessGone={() => controller.handleProcessTerminated()}
              domStorageEnabled
              javaScriptEnabled
              allowsInlineMediaPlayback
              mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
              allowsBackForwardNavigationGestures={false}
              webviewDebuggingEnabled={__DEV__}
            />
            {loadError ? <ErrorView onRetry={() => controller.retry()} onClose={() => controller.close()} /> : null}
          </SafeAreaView>
          {visible && !ready && !loadError ? (
            // Outside the SafeAreaView so the close button can be placed with the insets directly.
            // It is the only way out on iOS (no hardware back) if the page never posts `ready`.
            <View style={[StyleSheet.absoluteFill, styles.loading]}>
              <ActivityIndicator testID="flex54-loading" accessibilityLabel="Loading chat" />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close chat"
                onPress={() => controller.close()}
                style={({ pressed }) => [
                  styles.closeButton,
                  { top: insets.top + 8, right: insets.right + 8 },
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.closeBar, styles.closeBarA]} />
                <View style={[styles.closeBar, styles.closeBarB]} />
              </Pressable>
            </View>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#ffffff' },
  webview: { flex: 1, backgroundColor: '#ffffff' },
  loading: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
  // 44pt touch target with a quiet dark-grey X drawn from two rotated bars.
  closeButton: { position: 'absolute', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeBar: { position: 'absolute', width: 18, height: 2, borderRadius: 1, backgroundColor: '#444444' },
  closeBarA: { transform: [{ rotate: '45deg' }] },
  closeBarB: { transform: [{ rotate: '-45deg' }] },
  pressed: { opacity: 0.5 },
});
