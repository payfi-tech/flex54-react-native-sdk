import * as React from 'react';
import { Image, Pressable, StyleSheet } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import type { Flex54Position } from './types';

// iconsax Messages2 "Bulk" in #d9e3f0, pre-rendered by scripts/render-icon.mjs (Metro picks @2x/@3x).
const CHAT_ICON: ImageSourcePropType = require('../assets/chat.png');

const MARGIN = 16;

export type LauncherProps = {
  position: Flex54Position;
  insets: EdgeInsets;
  onPress: () => void;
};

/** Floating chat button; matches the web widget's ChatButton. */
export function Launcher({ position, insets, onPress }: LauncherProps): React.ReactElement {
  const placement =
    position === 'bottom-left'
      ? { bottom: insets.bottom + MARGIN, left: insets.left + MARGIN }
      : { bottom: insets.bottom + MARGIN, right: insets.right + MARGIN };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open chat"
      onPress={onPress}
      style={({ pressed }) => [styles.button, placement, pressed && styles.pressed]}
    >
      <Image source={CHAT_ICON} style={styles.icon} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.8 },
  icon: { width: 32, height: 32 },
});
