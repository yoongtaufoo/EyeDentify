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
import { View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as AudioModule from 'expo-audio';

import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import ChatScreen from './src/screens/ChatScreen';
import HomeScreen from './src/screens/HomeScreen';
import MemoriesScreen from './src/screens/MemoriesScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

/**
 * Main Tab Navigator - Home, Chat, Memories
 * Uses light theme matching web UI styles.
 */
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E8E8E8',
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 4,
          position: 'absolute',
        },
        tabBarActiveTintColor: '#F5A623',
        tabBarInactiveTintColor: '#999',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.2,
        },
        tabBarIconStyle: {
          marginTop: 2,
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 15, color }}>{'\u{1F3E0}'}</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Chat"
        component={ChatScreen}
        options={{
          tabBarLabel: 'Chat',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 15, color }}>{'\u{1F4AC}'}</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Memories"
        component={MemoriesScreen}
        options={{
          tabBarLabel: 'Memories',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 15, color }}>{'\u{1F4F7}'}</Text>
          ),
        }}
      />
    </Tab.Navigator>
  );
}

/**
 * Configure Audio Session for background playback.
 * This MUST be called at app startup so audio continues playing when 
 * the phone screen turns off or the user switches apps.
 */
async function configureAudioSession() {
  try {
    await AudioModule.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      interruptionModeIOS: AudioModule.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
      interruptionModeAndroid: AudioModule.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
      shouldDuckAndroid: false,
    });
    
    console.log('[App] Audio session configured for background playback');
  } catch (err) {
    console.warn('[App] Audio session config warning:', err.message);
  }
}

function AuthNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: '#F7F7F7' }} />;
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: '#F7F7F7' },
        animationTypeForReplace: user ? 'push' : 'pop',
      }}
    >
      {user ? (
        <Stack.Screen name="Main" component={MainTabs} />
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
  useEffect(() => {
    configureAudioSession();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <NavigationContainer
            onStateChange={(state) => {
              if (state === 'active') {
                configureAudioSession();
              }
            }}
          >
            <StatusBar style="dark" translucent={true} backgroundColor="#F7F7F7" />
            <AuthNavigator />
          </NavigationContainer>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
