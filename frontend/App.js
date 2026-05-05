// /**
//  * App.js - Root component with React Navigation.
//  * Routes between Login, Register, and Chat screens based on auth state.
//  * 
//  * FIXES BLACK SCREEN BUG: Uses proper NavigationContainer + Stack Navigator
//  * instead of rendering Camera directly at root level without navigation.
//  */

// import 'react-native-gesture-handler';
// import { GestureHandlerRootView } from 'react-native-gesture-handler';
// import React from 'react';
// import { StatusBar } from 'expo-status-bar';
// import { NavigationContainer } from '@react-navigation/native';
// import { createStackNavigator } from '@react-navigation/stack';

// import { AuthProvider, useAuth } from './src/contexts/AuthContext';
// import LoginScreen from './src/screens/LoginScreen';
// import RegisterScreen from './src/screens/RegisterScreen';
// import ChatScreen from './src/screens/ChatScreen';

// const Stack = createStackNavigator();

// function AuthNavigator() {
//   const { user, loading } = useAuth();

//   if (loading) {
//     // Show nothing while checking auth session (prevents flash)
//     return null;
//   }

//   return (
//     <Stack.Navigator
//       screenOptions={{
//         headerShown: false,
//         cardStyle: { backgroundColor: '#0A0A0F' },
//         animationTypeForReplace: user ? 'push' : 'pop',
//       }}
//     >
//       {user ? (
//         // Logged in → show Chat screen
//         <Stack.Screen name="Chat" component={ChatScreen} />
//       ) : (
//         // Not logged in → show Login/Register
//         <>
//           <Stack.Screen name="Login" component={LoginScreen} />
//           <Stack.Screen name="Register" component={RegisterScreen} />
//         </>
//       )}
//     </Stack.Navigator>
//   );
// }

// export default function App() {
//   return (
//     <GestureHandlerRootView style={{ flex: 1 }}>
//       <AuthProvider>
//         <NavigationContainer>
//           <StatusBar style="light" translucent={true} backgroundColor="transparent" />
//           <AuthNavigator />
//         </NavigationContainer>
//       </AuthProvider>
//     </GestureHandlerRootView>
//   );
// }

import 'react-native-gesture-handler'; // MUST BE LINE 1
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as AudioModule from 'expo-audio';

import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import ChatScreen from './src/screens/ChatScreen';

const Stack = createStackNavigator();

/**
 * Configure Audio Session for background playback.
 * This MUST be called at app startup so audio continues playing when 
 * the phone screen turns off or the user switches apps.
 */
async function configureAudioSession() {
  try {
    // CRITICAL: This allows TTS/audio to play when screen is off
    await AudioModule.setAudioModeAsync({
      playsInSilentModeIOS: true,       // Play even when silent switch is on (iOS)
      staysActiveInBackground: true,     // Continue in background (Android)
      interruptionModeIOS: AudioModule.INTERRUPTION_MODE_IOS_DO_NOT_MIX,  // DoNotMix (iOS) - don't duck under other audio
      interruptionModeAndroid: AudioModule.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,  // DoNotMix (Android)
      shouldDuckAndroid: false,          // Don't reduce volume for other apps
    });
    
    console.log('[App] Audio session configured for background playback');
  } catch (err) {
    console.warn('[App] Audio session config warning:', err.message);
  }
}

function AuthNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    // Keep it dark so the user doesn't get a white flash
    return <View style={{ flex: 1, backgroundColor: '#0A0A0F' }} />;
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: '#0A0A0F' },
        animationTypeForReplace: user ? 'push' : 'pop',
      }}
    >
      {user ? (
        <Stack.Screen name="Chat" component={ChatScreen} />
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  // Configure audio for background playback ONCE at mount
  useEffect(() => {
    configureAudioSession();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <NavigationContainer
            onStateChange={(state) => {
              // Re-configure audio each time the app comes back to foreground
              if (state === 'active') {
                configureAudioSession();
              }
            }}
          >
            <StatusBar style="light" translucent={true} backgroundColor="transparent" />
            <AuthNavigator />
          </NavigationContainer>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
