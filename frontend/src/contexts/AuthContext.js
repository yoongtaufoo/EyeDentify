// /**
//  * AuthContext.js - Supabase Authentication Context.
//  * Provides auth state (user, session, loading) to entire app.
//  * 
//  * Accessibility: All auth state changes trigger screen reader announcements.
//  */

// import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
// import { Alert } from 'react-native';
// import * as Speech from 'expo-speech';
// import { supabase } from '../lib/supabaseClient';
// import * as LocalAuthentication from 'expo-local-authentication';

// const AuthContext = createContext(null);

// export function AuthProvider({ children }) {
//   const [user, setUser] = useState(null);
//   const [session, setSession] = useState(null);
//   const [loading, setLoading] = useState(true);
//   const [keyboardPreference, setKeyboardPreference] = useState(null);

//   // Check existing session on app start
//   useEffect(() => {
//     supabase.auth.getSession().then(({ data: { session: sess } }) => {
//       setSession(sess);
//       setUser(sess?.user ?? null);
//       setLoading(false);
//     });

//     // Listen for auth changes (e.g., tab switch, etc.)
//     const { data: { subscription } } = supabase.auth.onAuthStateChange(
//       (_event, sess) => {
//         setSession(sess);
//         setUser(sess?.user ?? null);
//         setLoading(false);
//       }
//     );

//     return () => subscription.unsubscribe();
//   }, []);

//   const authenticateBiometric = async () => {
//     const hasHardware = await LocalAuthentication.hasHardwareAsync();
//     if (!hasHardware) return false;

//     const result = await LocalAuthentication.authenticateAsync({
//       promptMessage: 'Authenticate to open EyeDentify',
//       fallbackLabel: 'Use Passcode',
//     });
//     return result.success;
//   };

//   // const signUp = useCallback(async (email, password, fullName) => {
//   //   const { data, error } = await supabase.auth.signUp({
//   //     email,
//   //     password,
//   //     options: {
//   //       data: { full_name: fullName },
//   //     },
//   //   });

//   //   if (error) {
//   //     Speech.speak(`Sign up failed. ${error.message}`);
//   //     throw error;
//   //   }

//   //   // Also create profile via our backend
//   //   try {
//   //     const { signup } = require('../services/apiService');
//   //     await signup(email, password, fullName);
//   //   } catch (e) {
//   //     console.log('Profile creation note:', e);
//   //   }

//   //   Speech.speak('Account created successfully. Please check your email to verify.');
//   //   return data;
//   // }, []);

//   const signUp = useCallback(async (email, password, fullName, keyboardType = 'normal') => {
//     const { data, error } = await supabase.auth.signUp({
//       email,
//       password,
//       options: { data: { full_name: fullName, keyboard_type: keyboardType } },
//     });

//     if (error) {
//       Speech.speak(`Sign up failed: ${error.message}`);
//       throw error;
//     }

//     // FIX: Proper error logging for profile creation
//     try {
//       const { signup } = require('../services/apiService');
//       await signup(email, password, fullName, keyboardType);
//     } catch (e) {
//       console.log('Profile creation note:', e.message || JSON.stringify(e));
//     }

//     Speech.speak('Welcome to EyeDentify. Account created.');
//     return data;
//   }, []);

//   const signIn = useCallback(async (email, password) => {
//     const { data, error } = await supabase.auth.signInWithPassword({ email, password });

//     if (error) {
//       Speech.speak(`Login failed. ${error.message}`);
//       throw error;
//     }

//     Speech.speak(`Welcome back.`);
//     return data;
//   }, []);

//   const signOut = useCallback(async () => {
//     const { error } = await supabase.auth.signOut();
    
//     if (error) {
//       Speech.speak('Logout failed. Please try again.');
//       throw error;
//     }

//     Speech.speak('Logged out successfully. Goodbye.');
//     setUser(null);
//     setSession(null);
//   }, []);

//   const value = {
//     user,
//     session,
//     loading,
//     signUp,
//     signIn,
//     signOut,
//   };

//   return (
//     <AuthContext.Provider value={value}>
//       {children}
//     </AuthContext.Provider>
//   );
// }

// export function useAuth() {
//   const context = useContext(AuthContext);
//   if (!context) {
//     throw new Error('useAuth must be used within an AuthProvider');
//   }
//   return context;
// }

// export default AuthContext;

// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

// import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
// import * as Speech from 'expo-speech';
// import * as SecureStore from 'expo-secure-store';
// import * as LocalAuthentication from 'expo-local-authentication';
// import { supabase } from '../lib/supabaseClient';
// import { signup as apiSignup } from '../services/apiService';

// const AuthContext = createContext(null);

// export function AuthProvider({ children }) {
//   const [user, setUser] = useState(null);
//   const [loading, setLoading] = useState(true);
//   const [inputPref, setInputPref] = useState('normal'); // 'audio', 'braille', 'normal'

//   useEffect(() => {
//     const checkSession = async () => {
//       const { data: { session } } = await supabase.auth.getSession();
//       const pref = await SecureStore.getItemAsync('input_preference');
//       if (pref) setInputPref(pref);
//       setUser(session?.user ?? null);
//       setLoading(false);
//     };
//     checkSession();
//   }, []);

//   const signUp = useCallback(async (email, fullName, keyboardType) => {
//     // Hidden password logic for "Passwordless" feel
//     const hiddenPw = `ID-${Math.random().toString(36).slice(-10)}!A1`;
    
//     const { data, error } = await supabase.auth.signUp({
//       email,
//       password: hiddenPw,
//       options: { data: { full_name: fullName, keyboard_type: keyboardType } },
//     });

//     if (error) {
//       Speech.speak(`Sign up failed: ${error.message}`);
//       throw error;
//     }

//     // Save for future Biometric Logins
//     await SecureStore.setItemAsync('saved_email', email);
//     await SecureStore.setItemAsync('hidden_pw', hiddenPw);
//     await SecureStore.setItemAsync('input_preference', keyboardType);

//     try {
//       await apiSignup(email, hiddenPw, fullName, keyboardType);
//     } catch (e) {
//       // Fixes the [object Object] logging bug
//       console.log('Profile Sync Note:', e.message || "Profile created");
//     }
//     return data;
//   }, []);

//   const signIn = useCallback(async (email, password) => {
//     const { data, error } = await supabase.auth.signInWithPassword({ email, password });
//     if (error) throw error;
//     return data;
//   }, []);

//   return (
//     <AuthContext.Provider value={{ user, loading, inputPref, setInputPref, signUp, signIn }}>
//       {children}
//     </AuthContext.Provider>
//   );
// }

// export const useAuth = () => useContext(AuthContext);

// ##################################################################################################

// import React, { createContext, useContext, useState, useEffect } from 'react';
// import * as Speech from 'expo-speech';
// import * as SecureStore from 'expo-secure-store';
// import * as LocalAuthentication from 'expo-local-authentication';
// import { supabase } from '../lib/supabaseClient';
// import { signup as apiSignup } from '../services/apiService';

// const AuthContext = createContext(null);

// export function AuthProvider({ children }) {
//   const [user, setUser] = useState(null);
//   const [loading, setLoading] = useState(true);
//   const [inputPref, setInputPref] = useState(null); // 'audio', 'braille', 'normal'

//   useEffect(() => {
//     const init = async () => {
//       const { data: { session } } = await supabase.auth.getSession();
//       const pref = await SecureStore.getItemAsync('input_pref');
//       setInputPref(pref);
//       setUser(session?.user ?? null);
//       setLoading(false);
//     };
//     init();
//   }, []);

//   const signUp = async (email, fullName, keyboardType) => {
//     // Generate secure hidden password so user never needs one
//     const hiddenPw = `Eye-${Math.random().toString(36).slice(-8)}!`;
    
//     const { data, error } = await supabase.auth.signUp({
//       email,
//       password: hiddenPw,
//       options: { data: { full_name: fullName, keyboard_type: keyboardType } },
//     });

//     if (error) {
//       Speech.speak(`Failed: ${error.message}`);
//       throw error;
//     }

//     // Save for Fingerprint Login
//     await SecureStore.setItemAsync('saved_email', email);
//     await SecureStore.setItemAsync('hidden_pw', hiddenPw);
//     await SecureStore.setItemAsync('input_pref', keyboardType);

//     try {
//       await apiSignup(email, hiddenPw, fullName, keyboardType);
//     } catch (e) {
//       console.log('Sync note:', e.message || "Profile created"); // Fixed Object Object bug
//     }
//     return data;
//   };

//   const signIn = async (email, password) => {
//     const { data, error } = await supabase.auth.signInWithPassword({ email, password });
//     if (error) throw error;
//     return data;
//   };

//   return (
//     <AuthContext.Provider value={{ user, loading, inputPref, setInputPref, signUp, signIn }}>
//       {children}
//     </AuthContext.Provider>
//   );
// }

// export const useAuth = () => useContext(AuthContext);

// ######################################################################################

// import React, { createContext, useContext, useState, useEffect } from 'react';
// import * as Speech from 'expo-speech';
// import * as SecureStore from 'expo-secure-store';
// import { supabase } from '../lib/supabaseClient';
// import { signup as apiSignup } from '../services/apiService';

// const AuthContext = createContext(null);

// export function AuthProvider({ children }) {
//   const [user, setUser] = useState(null);
//   const [loading, setLoading] = useState(true);

//   useEffect(() => {
//     const init = async () => {
//       const { data: { session } } = await supabase.auth.getSession();
//       setUser(session?.user ?? null);
//       setLoading(false);
//     };
//     init();
//   }, []);

//   const signUpPasswordless = async (email, fullName, inputMode) => {
//     // Generate a secure hidden password for the user
//     const hiddenPw = `ID-${Math.random().toString(36).slice(-12)}!A1`;

//     const { data, error } = await supabase.auth.signUp({
//       email,
//       password: hiddenPw,
//       options: { data: { full_name: fullName, keyboard_type: inputMode } },
//     });

//     if (error) {
//       Speech.speak(`Sign up failed: ${error.message}`);
//       throw error;
//     }

//     // Save credentials locally for future biometric logins
//     await SecureStore.setItemAsync('saved_email', email);
//     await SecureStore.setItemAsync('hidden_pw', hiddenPw);
    
//     try {
//       // Sync with your FastAPI backend profile
//       await apiSignup(email, hiddenPw, fullName, inputMode);
//     } catch (e) {
//       console.log('Profile note:', e.message || "Synced");
//     }
//     return data;
//   };

//   const signIn = async (email, password) => {
//     const { data, error } = await supabase.auth.signInWithPassword({ email, password });
//     if (error) throw error;
//     return data;
//   };

//   return (
//     <AuthContext.Provider value={{ user, loading, signUpPasswordless, signIn }}>
//       {children}
//     </AuthContext.Provider>
//   );
// }

// export const useAuth = () => useContext(AuthContext);

// ########################################################################################3

// src/contexts/AuthContext.js
// import React, { createContext, useContext, useState, useEffect } from 'react';
// import * as Speech from 'expo-speech';
// import * as SecureStore from 'expo-secure-store';
// import { supabase } from '../lib/supabaseClient';

// const AuthContext = createContext(null);

// export function AuthProvider({ children }) {
//   const [user, setUser] = useState(null);
//   const [loading, setLoading] = useState(true);

//   useEffect(() => {
//     supabase.auth.getSession().then(({ data: { session } }) => {
//       setUser(session?.user ?? null);
//       setLoading(false);
//     });
//   }, []);

//   const registerIdeaB = async (email, fullName, inputMode) => {
//     // Hidden UUID password the user never sees
//     const hiddenPw = `Eye-${Math.random().toString(36).slice(-12)}!`;

//     const { data, error } = await supabase.auth.signUp({
//       email,
//       password: hiddenPw,
//       options: { data: { full_name: fullName, keyboard_type: inputMode } },
//     });

//     if (error) {
//       Speech.speak(`Registration failed. ${error.message}`);
//       throw error;
//     }

//     // Save for future biometric "Touch to Login"
//     await SecureStore.setItemAsync('saved_email', email);
//     await SecureStore.setItemAsync('hidden_pw', hiddenPw);
//     return data;
//   };

//   const signIn = async (email, password) => {
//     const { data, error } = await supabase.auth.signInWithPassword({ email, password });
//     if (error) throw error;
//     return data;
//   };

//   return (
//     <AuthContext.Provider value={{ user, loading, registerIdeaB, signIn }}>
//       {children}
//     </AuthContext.Provider>
//   );
// }

// export const useAuth = () => useContext(AuthContext);

// #############################

// src/contexts/AuthContext.js
// import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
// import * as Speech from 'expo-speech';
// import * as SecureStore from 'expo-secure-store';
// import { supabase } from '../lib/supabaseClient';

// const AuthContext = createContext(null);

// export function AuthProvider({ children }) {
//   const [user, setUser] = useState(null);
//   const [loading, setLoading] = useState(true);
//   const [inputMode, setInputMode] = useState(null); // The missing piece!

//   useEffect(() => {
//     const init = async () => {
//       const { data: { session } } = await supabase.auth.getSession();
//       const savedMode = await SecureStore.getItemAsync('input_mode');
//       if (savedMode) setInputMode(savedMode);
//       setUser(session?.user ?? null);
//       setLoading(false);
//     };
//     init();
//   }, []);

//   const signUpPasswordless = useCallback(async (email, fullName, keyboardType) => {
//     const hiddenPw = `ID-${Math.random().toString(36).slice(-10)}!A1`;
//     const { data, error } = await supabase.auth.signUp({
//       email,
//       password: hiddenPw,
//       options: { data: { full_name: fullName, keyboard_type: keyboardType } },
//     });

//     if (error) throw error;

//     await SecureStore.setItemAsync('saved_email', email);
//     await SecureStore.setItemAsync('hidden_pw', hiddenPw);
//     await SecureStore.setItemAsync('input_mode', keyboardType);
//     return data;
//   }, []);

//   const signIn = useCallback(async (email, password) => {
//     const { data, error } = await supabase.auth.signInWithPassword({ email, password });
//     if (error) throw error;
//     return data;
//   }, []);

//   // CRITICAL: Everything in this 'value' object is what the screens can "see"
//   const value = {
//     user,
//     loading,
//     inputMode,     // Add this
//     setInputMode,  // Add this
//     signUpPasswordless,
//     signIn,
//   };

//   return (
//     <AuthContext.Provider value={value}>
//       {children}
//     </AuthContext.Provider>
//   );
// }

// export function useAuth() {
//   return useContext(AuthContext);
// }

// ##################################

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as Speech from 'expo-speech';
import { supabase } from '../lib/supabaseClient';
import { signup as apiSignup } from '../services/apiService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [inputMode, setInputMode] = useState(null);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      setLoading(false);
    };
    init();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Register with REAL user password — no hidden password generation
  const signUpPasswordless = useCallback(async (email, userPassword, inputMode, displayName = 'New User') => {
    // Use the user's REAL password directly
    const password = userPassword;

    const { data, error } = await supabase.auth.signUp({
      email,
      password: password,
      options: { data: { full_name: displayName, keyboard_type: inputMode } },
    });

    if (error) {
      if (error.message.includes("User already registered") || error.message.includes("already been registered")) {
        Speech.speak("This email is already registered. Please login instead.");
      } else {
        Speech.speak(`Sign up failed: ${error.message}`);
      }
      throw error;
    }

    // Sync with backend to create DB profile (stores real password in DB)
    try {
      await apiSignup(email, password, displayName, inputMode);
      console.log('Backend profile creation initiated');
    } catch (e) {
      console.log('Profile sync note:', e.message || JSON.stringify(e));
    }

    Speech.speak('Account created successfully. Welcome to EyeDentify.');
    return data;
  }, []);

  // Login with email + REAL password (compared against Supabase Auth / DB)
  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      Speech.speak("Login failed. Please check your email and password.");
      throw error;
    }
    setUser(data.user);
    return data;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();

      setUser(null);
      setInputMode(null);
      Speech.speak("Logged out successfully.");
    } catch (error) {
      console.error("Logout Error:", error);
    }
  }, []);

  const value = {
    user,
    loading,
    inputMode,
    setInputMode,
    signUpPasswordless,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);