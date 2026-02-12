import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

import App from './App';

if (typeof process !== 'undefined' && process?.env && !process.env.EXPO_OS) {
	process.env.EXPO_OS = Platform.OS;
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
