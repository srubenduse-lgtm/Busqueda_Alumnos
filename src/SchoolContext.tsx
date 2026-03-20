import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabase';
import { School, UserProfile } from './types';
import { User } from '@supabase/supabase-js';

interface SchoolContextType {
  currentSchool: School | null;
  setCurrentSchool: (school: School | null) => void;
  userProfile: UserProfile | null;
  schools: School[];
  fetchSchools: () => Promise<void>;
}

const SchoolContext = createContext<SchoolContextType>({
  currentSchool: null,
  setCurrentSchool: () => {},
  userProfile: null,
  schools: [],
  fetchSchools: async () => {},
});

export const useSchool = () => useContext(SchoolContext);

export const SchoolProvider: React.FC<{ children: React.ReactNode; user: User }> = ({ children, user }) => {
  const [currentSchool, setCurrentSchool] = useState<School | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSchools = async () => {
    const { data: schoolsData } = await supabase.from('schools').select('*');
    const allSchools = (schoolsData as School[]) || [];
    setSchools(allSchools);
    return allSchools;
  };

  useEffect(() => {
    const fetchProfileAndSchools = async () => {
      // Fetch user profile
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      let profile = profileData as UserProfile;

      // If no profile exists, create a default one (for demo purposes)
      if (profileError && profileError.code === 'PGRST116') {
        const isSuperUser = user.email === 'superUser@escuela.com' || user.email?.includes('superuser');
        profile = {
          id: user.id,
          email: user.email || '',
          role: isSuperUser ? 'superUser' : 'admin',
        };
        await supabase.from('user_profiles').insert([profile]);
      } else if (profileError) {
        console.error("Error fetching profile:", profileError);
      }

      setUserProfile(profile);

      // Fetch all schools
      const allSchools = await fetchSchools();

      // Set current school
      if (profile?.school_id) {
        const school = allSchools.find(s => s.id === profile.school_id);
        if (school) setCurrentSchool(school);
      }

      setLoading(false);
    };

    fetchProfileAndSchools();
  }, [user]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">Cargando perfil...</div>;
  }

  return (
    <SchoolContext.Provider value={{ currentSchool, setCurrentSchool, userProfile, schools, fetchSchools }}>
      {children}
    </SchoolContext.Provider>
  );
};
