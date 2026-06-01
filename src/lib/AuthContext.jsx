import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiClient } from '@/api/client';
import { queryClientInstance } from '@/lib/query-client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const checkUserAuth = async () => {
    setIsLoadingAuth(true);
    try {
      const currentUser = await apiClient.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setAuthError(null);
      queryClientInstance.setQueryData(['currentUser'], currentUser);
    } catch (error) {
      if (error.status === 401) {
        setUser(null);
        setIsAuthenticated(false);
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
        queryClientInstance.removeQueries({ queryKey: ['currentUser'] });
      } else {
        setAuthError({
          type: 'network',
          message: error.message || 'Could not verify your session. Check your connection and try again.'
        });
      }
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  useEffect(() => {
    checkUserAuth();
  }, []);

  const setAuthenticatedUser = (currentUser) => {
    setUser(currentUser);
    setIsAuthenticated(Boolean(currentUser));
    setAuthError(null);
    setIsLoadingAuth(false);
    setAuthChecked(true);
    queryClientInstance.setQueryData(['currentUser'], currentUser);
  };

  const logout = async () => {
    setUser(null);
    setIsAuthenticated(false);
    queryClientInstance.clear();
    await apiClient.auth.logout('/');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        authError,
        authChecked,
        logout,
        setAuthenticatedUser,
        navigateToLogin: () => { window.location.href = '/login'; },
        checkUserAuth
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

