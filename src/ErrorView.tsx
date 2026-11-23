import * as React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export type ErrorViewProps = {
  onRetry: () => void;
  onClose: () => void;
};

/** Shown over the WebView when the widget page fails to load. */
export function ErrorView({ onRetry, onClose }: ErrorViewProps): React.ReactElement {
  return (
    <View style={[StyleSheet.absoluteFill, styles.container]}>
      <Text accessibilityRole="header" style={styles.title}>
        Couldn't load the chat
      </Text>
      <Text style={styles.body}>Check your connection and try again.</Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={({ pressed }) => [styles.button, styles.primary, pressed && styles.pressed]}
        >
          <Text style={[styles.label, styles.primaryLabel]}>Try again</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [styles.button, styles.secondary, pressed && styles.pressed]}
        >
          <Text style={[styles.label, styles.secondaryLabel]}>Close</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#ffffff',
  },
  title: { fontSize: 18, fontWeight: '600', color: '#000000', textAlign: 'center' },
  body: { marginTop: 8, fontSize: 15, color: '#555555', textAlign: 'center' },
  actions: { flexDirection: 'row', marginTop: 24, gap: 12 },
  button: { minWidth: 112, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 24, alignItems: 'center' },
  primary: { backgroundColor: '#000000' },
  secondary: { borderWidth: 1, borderColor: '#000000' },
  pressed: { opacity: 0.8 },
  label: { fontSize: 15, fontWeight: '600' },
  primaryLabel: { color: '#ffffff' },
  secondaryLabel: { color: '#000000' },
});
