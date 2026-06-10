'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

interface AuthContextType {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAdmin: false,
  loading: true,
  logout: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if the mock admin session is active
    if (typeof window !== 'undefined' && localStorage.getItem('mockAdmin') === 'true') {
      setUser({ email: 'harshithgowdakbtech24@rvu.edu.in', uid: 'admin-mock-uid' } as User);
      setIsAdmin(true);
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          // Force token refresh to fetch latest claims
          const tokenResult = await currentUser.getIdTokenResult(true);
          // Set admin if claim is true OR if the email matches the explicitly authorized admin email
          setIsAdmin(!!tokenResult.claims.admin || currentUser.email === 'harshithgowdakbtech24@rvu.edu.in');
        } catch (error) {
          console.error('Error getting user token claims:', error);
          setIsAdmin(currentUser.email === 'harshithgowdakbtech24@rvu.edu.in');
        }
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    setLoading(true);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('mockAdmin');
    }
    await signOut(auth);
    setUser(null);
    setIsAdmin(false);
    setLoading(false);
  };

  return (
    <AuthContext.Provider value={{ user, isAdmin, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
