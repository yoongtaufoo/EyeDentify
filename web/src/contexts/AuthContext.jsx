import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { signup as apiSignup } from '../services/apiService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [inputMode, setInputMode] = useState(() => localStorage.getItem('input_mode') || null);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const savedMode = localStorage.getItem('input_mode');
      if (savedMode) setInputMode(savedMode);
      setUser(session?.user ?? null);
      setLoading(false);
    };
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUpPasswordless = useCallback(async (email, fullName, keyboardType, userPassword) => {
    // Use user-provided password if given (min 6 chars), otherwise generate hidden one
    const hiddenPw = (userPassword && userPassword.length >= 6)
      ? userPassword
      : `ID-${Math.random().toString(36).slice(-10)}!A1`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password: hiddenPw,
      options: { data: { full_name: fullName, keyboard_type: keyboardType } },
    });

    if (error) throw error;

    // Save for future logins
    localStorage.setItem('saved_email', email);
    localStorage.setItem('hidden_pw', hiddenPw);
    localStorage.setItem('input_mode', keyboardType);

    try {
      await apiSignup(email, hiddenPw, fullName, keyboardType);
    } catch (e) {
      console.log('[Auth] Profile sync note:', e.message || 'Synced');
    }
    return data;
  }, []);

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    setUser(data.user);
    return data;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error('[Auth] Logout error:', e);
    }
    localStorage.removeItem('saved_email');
    localStorage.removeItem('full_name');
    localStorage.removeItem('input_mode');
    setUser(null);
    setInputMode(null);
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
export default AuthContext;
