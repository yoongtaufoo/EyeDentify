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
import React from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import ChatScreen from './src/screens/ChatScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';

const Stack = createStackNavigator();

// This is the function that was missing/imported incorrectly
function AuthNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    // Keep it dark so the user doesn't get a white flash
    return <View style={{ flex: 1, backgroundColor: '#0A0A0F' }} />;
  }

  // const manualWipe = async () => {
  //   await SecureStore.deleteItemAsync('hidden_pw');
  //   await SecureStore.deleteItemAsync('saved_email'); // If you still have it here
  //   await AsyncStorage.clear();
  //   console.log("✅ Manual Wipe Complete. Remove this code now!");
  // };

  // Call it once
  // manualWipe();

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
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
      {/* Always include Register screen but hide it from initial route */}
      {!user && (
        <Stack.Screen name="Register" component={RegisterScreen} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <NavigationContainer>
            <StatusBar style="light" translucent={true} backgroundColor="transparent" />
            <AuthNavigator />
          </NavigationContainer>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
