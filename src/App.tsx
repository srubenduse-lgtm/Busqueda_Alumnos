/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import { supabase } from './supabase';
import { User } from '@supabase/supabase-js';
import { Monitor, Users, LogOut, LogIn, Building2 } from 'lucide-react';
import Admin from './pages/Admin';
import DisplayScreen from './pages/DisplayScreen';
import { SchoolProvider, useSchool } from './SchoolContext';

function MainApp() {
  const { currentSchool, setCurrentSchool, userProfile, schools } = useSchool();

  const logout = async () => {
    await supabase.auth.signOut();
  };

  const [newSchoolName, setNewSchoolName] = useState('');

  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSchoolName) return;
    const { error } = await supabase.from('schools').insert([{ name: newSchoolName }]);
    if (error) {
      alert('Error: ' + error.message);
    } else {
      setNewSchoolName('');
      // fetchSchools is called in SchoolContext on mount, but we might need to trigger a refresh
      // For now, let's just reload the page to fetch the new school
      window.location.reload();
    }
  };

  if (!currentSchool && userProfile?.role === 'superUser') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full">
          <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">Seleccionar Colegio</h1>
          <p className="text-gray-500 mb-8 text-center">Eres SuperUsuario, elige el colegio a administrar</p>
          <div className="space-y-4 max-h-64 overflow-y-auto">
            {schools.map(school => (
              <button
                key={school.id}
                onClick={() => setCurrentSchool(school)}
                className="w-full flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all"
              >
                <span className="font-medium text-gray-900">{school.name}</span>
                <Building2 className="w-5 h-5 text-blue-500" />
              </button>
            ))}
            {schools.length === 0 && (
              <p className="text-sm text-red-500 text-center">No hay colegios configurados en la base de datos.</p>
            )}
          </div>

          <div className="mt-8 pt-6 border-t border-gray-100">
            <h3 className="text-sm font-bold text-gray-700 mb-3">Crear Nuevo Colegio</h3>
            <form onSubmit={handleCreateSchool} className="flex gap-2">
              <input
                type="text"
                value={newSchoolName}
                onChange={(e) => setNewSchoolName(e.target.value)}
                placeholder="Nombre del colegio"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                required
              />
              <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                Crear
              </button>
            </form>
          </div>

          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 px-4 rounded-xl font-medium transition-colors mt-8"
          >
            <LogOut className="w-5 h-5" />
            Cerrar Sesión
          </button>
        </div>
      </div>
    );
  }

  if (!currentSchool) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-2">Acceso Denegado</h1>
          <p className="text-gray-600 mb-8">Tu usuario no tiene un colegio asignado.</p>
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 px-4 rounded-xl font-medium transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Cerrar Sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex">
                <div className="flex-shrink-0 flex items-center gap-2">
                  <span className="text-xl font-bold text-blue-600">SalidaEscolar</span>
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded-md">
                    {currentSchool.name}
                  </span>
                </div>
                <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                  <Link to="/admin" className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
                    <Users className="w-4 h-4 mr-2" />
                    Administración
                  </Link>
                  <Link to="/display" className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
                    <Monitor className="w-4 h-4 mr-2" />
                    Pantalla Salida
                  </Link>
                </div>
              </div>
              <div className="flex items-center">
                {userProfile?.role === 'superUser' && (
                  <button
                    onClick={() => setCurrentSchool(null)}
                    className="mr-4 text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Cambiar Colegio
                  </button>
                )}
                <span className="text-sm text-gray-500 mr-4">{userProfile?.email}</span>
                <button
                  onClick={logout}
                  className="p-2 text-gray-400 hover:text-gray-500"
                  title="Cerrar sesión"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </nav>

        <main className="flex-1 max-w-7xl w-full mx-auto py-6 sm:px-6 lg:px-8">
          <Routes>
            <Route path="/" element={<Navigate to="/admin" replace />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/display" element={<DisplayScreen />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Auth form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setAuthError('Correo o contraseña incorrectos.');
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">Cargando...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full">
          <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">Sistema de Salida Escolar</h1>
          <p className="text-gray-500 mb-8 text-center">Inicia sesión con tu correo y contraseña</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Correo Electrónico</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="admin@escuela.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="••••••••"
                required
              />
            </div>
            
            {authError && (
              <div className="p-3 bg-red-50 text-red-700 text-sm rounded-xl text-center">
                {authError}
              </div>
            )}

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-xl font-medium transition-colors mt-4"
            >
              <LogIn className="w-5 h-5" />
              Iniciar Sesión
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <SchoolProvider user={user}>
      <MainApp />
    </SchoolProvider>
  );
}
