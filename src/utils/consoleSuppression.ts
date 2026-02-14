// Suppress known Expo Go warnings that we can't fix
// Place this at the top of your app entry point (index.ts or App.tsx)

const originalWarn = console.warn;
const originalError = console.error;

// Suppress specific warnings
console.warn = (...args) => {
    const msg = args[0];
    if (
        typeof msg === 'string' &&
        (msg.includes('expo-notifications') ||
            msg.includes('SafeAreaView has been deprecated') ||
            msg.includes('EXPO_OS is not defined'))
    ) {
        return; // Suppress these warnings
    }
    originalWarn(...args);
};

console.error = (...args) => {
    const msg = args[0];
    if (
        typeof msg === 'string' &&
        (msg.includes('expo-notifications') ||
            msg.includes('Android Push notifications') ||
            msg.includes('Invalid Refresh Token: Refresh Token Not Found'))
    ) {
        return; // Suppress these errors
    }
    originalError(...args);
};

export { };
