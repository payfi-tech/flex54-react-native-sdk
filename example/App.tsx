import { useState } from 'react';
import { Button, StyleSheet, Switch, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Flex54, Flex54Widget } from '@flexsmb54/react-native-widget';

const widgetId = process.env.EXPO_PUBLIC_FLEX54_WIDGET_ID;
const environment =
  process.env.EXPO_PUBLIC_FLEX54_ENVIRONMENT === 'production' ? 'production' : 'development';

export default function App() {
  const [open, setOpen] = useState(false);
  const [launcher, setLauncher] = useState(true);
  const [leftSide, setLeftSide] = useState(false);

  if (!widgetId) {
    return (
      <View style={styles.container}>
        <Text>Set EXPO_PUBLIC_FLEX54_WIDGET_ID</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.container}>
        <Text style={styles.title}>Flex54 SDK Example</Text>
        <Text>Environment: {environment}</Text>
        <Text>Chat is open: {String(open)} (Flex54.isOpen(): {String(Flex54.isOpen())})</Text>
        <View style={styles.buttons}>
          <Button title="Open" onPress={() => Flex54.open()} />
          <Button title="Close" onPress={() => Flex54.close()} />
          <Button title="Toggle" onPress={() => Flex54.toggle()} />
          <Button title="Reset" onPress={() => Flex54.reset()} />
        </View>
        <View style={styles.row}>
          <Text>Show launcher</Text>
          <Switch value={launcher} onValueChange={setLauncher} />
        </View>
        <View style={styles.row}>
          <Text>Left side</Text>
          <Switch value={leftSide} onValueChange={setLeftSide} />
        </View>
        <StatusBar style="auto" />
      </View>
      <Flex54Widget
        widgetId={widgetId}
        environment={environment}
        launcher={launcher}
        position={leftSide ? 'bottom-left' : 'bottom-right'}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1, padding: 24, justifyContent: 'center', gap: 16 },
  title: { fontSize: 20, fontWeight: '600' },
  buttons: { flexDirection: 'row', justifyContent: 'space-between' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
