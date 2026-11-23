const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const packageRoot = path.resolve(__dirname, '..');
const config = getDefaultConfig(__dirname);

config.watchFolders = [packageRoot];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];

// The SDK's own devDependencies live in ../node_modules. Block them so the
// example resolves exactly one copy of each library (its own).
const blocked = /(react|react-native|react-native-webview|react-native-safe-area-context)/.source;
const escapedRoot = packageRoot.replace(/[/\\]/g, '[/\\\\]');
config.resolver.blockList = [
  new RegExp(`${escapedRoot}[/\\\\]node_modules[/\\\\]${blocked}[/\\\\].*`),
];

module.exports = config;
