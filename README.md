# @flexsmb54/react-native-widget

The Flex54 chat widget for React Native. It shows the hosted Flex54 widget in a WebView. It has no native code of its own, so it runs in Expo Go.

## Install

Expo:

```sh
npx expo install @flexsmb54/react-native-widget react-native-webview react-native-safe-area-context
```

Bare React Native:

```sh
npm install @flexsmb54/react-native-widget react-native-webview react-native-safe-area-context
cd ios && pod install
```

Peer dependencies: `react >= 18`, `react-native >= 0.72`, `react-native-webview >= 13`, `react-native-safe-area-context >= 4`.

## Usage

Render `<Flex54Widget>` **exactly once, as the last child of your root component**, so it draws above the rest of the app. It shows a chat button and, when opened, a full-screen chat. Touches anywhere else go to your app as usual.

```tsx
import { Flex54Widget } from '@flexsmb54/react-native-widget';

export default function App() {
  return (
    <>
      <RootNavigator />
      <Flex54Widget widgetId="YOUR_WIDGET_ID" />
    </>
  );
}
```

With Expo Router, do the same in `app/_layout.tsx`: put `<Flex54Widget>` after `<Stack />` or `<Tabs />`.

Multiple widgets at the same time are not supported. `Flex54` calls made while no widget is mounted are buffered, and replay when one mounts.

The widget brings its own `SafeAreaProvider`, so you don't need one above it.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `widgetId` | `string` | required | Your Flex54 widget id. |
| `environment` | `'production' \| 'development'` | `'production'` | Which widget host to load. See [Environments](#environments). |
| `launcher` | `boolean` | `true` | Show the floating chat button. Set it to `false` to open the chat from your own UI with `Flex54.open()`. |
| `position` | `'bottom-right' \| 'bottom-left'` | `'bottom-right'` | Which corner the chat button sits in. It is inset by the safe area plus 16pt. |
| `onOpen` | `() => void` | | Called when the chat window has opened. |
| `onClose` | `() => void` | | Called when the chat window has closed: from the widget's own close button, `Flex54.close()` or Android back. It only fires after an `onOpen`. |

Set `widgetId` and `environment` once, when the widget mounts. Changing them on a mounted widget isn't supported. To switch, remount the component with a new `key`, for example `<Flex54Widget key={widgetId} widgetId={widgetId} />`.

## `Flex54` API

Control the mounted widget from anywhere in your app:

```ts
import { Flex54 } from '@flexsmb54/react-native-widget';

Flex54.open();   // show the chat
Flex54.close();  // hide the chat
Flex54.toggle(); // open if closed, close if open
Flex54.reset();  // discard the conversation, so the next open starts fresh
Flex54.isOpen(); // true while the chat is showing
```

- Calls made while no widget is mounted (before it first mounts, or while it is unmounted) are queued and run, in order, when one mounts. `isOpen()` is `false` while no widget is mounted.
- **Call `Flex54.reset()` when the user logs out**, so the next person who uses the device doesn't see the previous conversation. The reset reaches the chat once the widget page has loaded, which normally happens within a second or two. If the chat hasn't been opened yet, the widget loads hidden to deliver it, and a pending reset carries over if the widget unmounts and mounts again. If the app is killed before the page loads, for example while the device is offline, the reset is lost, so call `Flex54.reset()` again when a different user signs in. `reset()` doesn't hide an open chat, so call `Flex54.close()` as well if you need to.

```ts
async function logOut() {
  Flex54.close();
  Flex54.reset();
  await auth.signOut();
}
```

## Environments

| `environment` | Widget host |
| --- | --- |
| `'production'` (default) | `https://agent.flex54.com` |
| `'development'` | `https://agent-dev.flex54.com` |

The widget loads `<host>/?widgetId=<id>&device=mobile&host=native&platform=react-native&sdkVersion=<version>`.

## Microphone permission

Voice input uses the microphone, so the host app must declare it. Voice notes need iOS 14.5 or later.

iOS, in `Info.plist`:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>Allows you to send voice messages in chat.</string>
```

Android, in `AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
```

Expo, in `app.json` (then rebuild the app; Expo Go already has these):

```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSMicrophoneUsageDescription": "Allows you to send voice messages in chat."
      }
    },
    "android": {
      "permissions": ["android.permission.RECORD_AUDIO"]
    }
  }
}
```

## Phone and email links

`tel:` and `mailto:` links in the chat are opened by react-native-webview's default handling, which asks the system whether an app can open them. On Android 11 and later, that check needs `<queries>` entries in `AndroidManifest.xml`, or the links do nothing:

```xml
<queries>
  <intent>
    <action android:name="android.intent.action.VIEW" />
    <data android:scheme="tel" />
  </intent>
  <intent>
    <action android:name="android.intent.action.VIEW" />
    <data android:scheme="mailto" />
  </intent>
</queries>
```

## How it works

`<Flex54Widget>` draws a chat button and, the first time the chat opens, a full-screen WebView that loads the hosted Flex54 widget with `host=native`. The page and the SDK talk through two small JSON envelopes. The widget posts `ready`, `opened` and `closed` events, and the SDK injects `open`, `close`, `toggle` and `reset` commands. The SDK re-syncs on every `ready` instead of replaying queued commands. Closing hides the surface and tells the widget to close, which unmounts the chat window and disconnects it, so nothing is billed while the chat is hidden. Links that leave the widget's origin open in the system browser. If the WebView's web process dies, the SDK reloads it. A page loaded more than 12 hours ago is reloaded when the chat next opens, so its session doesn't go stale.

## Troubleshooting

- **The chat button doesn't show, or the chat appears behind your content.** Render `<Flex54Widget>` as the last child of the root component, not inside a screen, modal or `ScrollView`.
- **`Flex54.open()` does nothing, or opens a different widget.** Render exactly one `<Flex54Widget>`. Several at once are not supported.
- **The chat button covers your tab bar or another control.** Use `position="bottom-left"`, or set `launcher={false}` and call `Flex54.open()` from your own button.
- **"Couldn't load the chat".** The device is offline or the widget host is unreachable. "Try again" reloads the page.
- **"Couldn't load the chat" right after the page loads.** The page loaded but didn't answer as the chat widget within 10 seconds. Check `environment`: `production` and `development` load different widget hosts, and the one you point at must have the native-mode widget deployed. Tap Try again to reload. While the page is still loading, the X in the top-right corner closes the loading screen.
- **The microphone doesn't work.** Add the permissions above and rebuild the app. `Info.plist` and manifest changes need a native rebuild.
- **The keyboard covers the message box on Android.** Keyboard behaviour on Android 15 and later with edge-to-edge display is still being verified, and `android:windowSoftInputMode="adjustResize"` may not be enough there. If the keyboard covers the message box, please report it with the device, Android version and React Native version.
- **Android back.** While the chat is open, back closes it. Otherwise back goes to your app as usual.

## License

MIT
