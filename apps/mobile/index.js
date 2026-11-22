import './src/polyfills';
import { AppRegistry } from 'react-native';
import { quickAddFromVoice } from './src/lib/quick-add';

// "Say a task" from the home-screen widget runs here without opening the app (FR-PROD-012).
AppRegistry.registerHeadlessTask('AlibiQuickAdd', () => quickAddFromVoice);

import 'expo-router/entry';
