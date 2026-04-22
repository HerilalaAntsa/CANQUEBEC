import { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isSupabaseEnabled } from '../services/supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession]   = useState(() => isSupabaseEnabled ? undefined : null);
  const [loading, setLoading]   = useState(() => !isSupabaseEnabled ? false : true);

  useEffect(() => {
    if (!isSupabaseEnabled) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function login(email, password) {
    if (!isSupabaseEnabled) throw new Error('Supabase non configuré');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function logout() {
    if (!isSupabaseEnabled) return;
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ session, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être dans un AuthProvider');
  return ctx;
}
