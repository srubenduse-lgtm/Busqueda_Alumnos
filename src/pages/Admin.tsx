import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { Student, Guardian, CameraLog } from '../types';
import Papa from 'papaparse';
import { Upload, Plus, Trash2, Link as LinkIcon, Camera, X, Activity, CheckCircle, XCircle, Pencil, Save, Eye, EyeOff, Key } from 'lucide-react';
import { SchoolProvider, useSchool } from '../SchoolContext';
import { School, UserProfile } from '../types';

const playBeep = () => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // 880Hz (A5)
    
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.1);
  } catch (e) {
    console.error('No se pudo reproducir el beep:', e);
  }
};

import AIAssistant from '../components/AIAssistant';

export default function Admin() {
  const { currentSchool, userProfile, fetchSchools, schools } = useSchool();
  const [students, setStudents] = useState<Student[]>([]);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [cameraLogs, setCameraLogs] = useState<CameraLog[]>([]);
  const [activeTab, setActiveTab] = useState<'students' | 'guardians' | 'logs' | 'schools' | 'users'>('students');
  const [users, setUsers] = useState<UserProfile[]>([]);

  const [newStudent, setNewStudent] = useState({ firstName: '', lastName: '', grade: '', photoUrl: '' });
  const [newGuardian, setNewGuardian] = useState({ firstName: '', lastName: '', licensePlate: '', vehicleModel: '', photoUrl: '', licensePlatePhotoUrl: '' });
  const [newSchool, setNewSchool] = useState({ name: '', address: '' });
  const [newUserForm, setNewUserForm] = useState({ email: '', password: '', role: 'user', school_id: '' });
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [passwordModal, setPasswordModal] = useState<{ isOpen: boolean; userId: string | null; newPassword: '' }>({ isOpen: false, userId: null, newPassword: '' });
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const [editingGuardianId, setEditingGuardianId] = useState<string | null>(null);
  const [editGuardianData, setEditGuardianData] = useState({ firstName: '', lastName: '', licensePlate: '', vehicleModel: '' });

  const [isWebcamOpen, setIsWebcamOpen] = useState(false);
  const [webcamTarget, setWebcamTarget] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!currentSchool) return;

    const fetchStudents = async () => {
      const { data, error } = await supabase.from('students').select('*').eq('school_id', currentSchool.id);
      if (error) console.error('Error fetching students:', error);
      if (data) setStudents(data as Student[]);
    };
    const fetchGuardians = async () => {
      const { data, error } = await supabase.from('guardians').select('*').eq('school_id', currentSchool.id);
      if (error) console.error('Error fetching guardians:', error);
      if (data) setGuardians(data as Guardian[]);
    };
    const fetchLogs = async () => {
      const { data, error } = await supabase.from('camera_logs').select('*').eq('school_id', currentSchool.id).order('created_at', { ascending: false }).limit(50);
      if (error) console.error('Error fetching logs:', error);
      if (data) setCameraLogs(data as CameraLog[]);
    };

    const fetchUsers = async () => {
      if (userProfile?.role === 'superUser') {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('*');
        if (!error && data) setUsers(data);
      }
    };

    fetchStudents();
    fetchGuardians();
    fetchLogs();
    fetchUsers();

    const studentsChannel = supabase.channel(`public:students:${currentSchool.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students', filter: `school_id=eq.${currentSchool.id}` }, payload => {
        if (payload.eventType === 'INSERT') setStudents(prev => [...prev, payload.new as Student]);
        if (payload.eventType === 'UPDATE') setStudents(prev => prev.map(s => s.id === payload.new.id ? payload.new as Student : s));
        if (payload.eventType === 'DELETE') setStudents(prev => prev.filter(s => s.id !== payload.old.id));
      })
      .subscribe();

    const guardiansChannel = supabase.channel(`public:guardians:${currentSchool.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guardians', filter: `school_id=eq.${currentSchool.id}` }, payload => {
        if (payload.eventType === 'INSERT') setGuardians(prev => [...prev, payload.new as Guardian]);
        if (payload.eventType === 'UPDATE') setGuardians(prev => prev.map(g => g.id === payload.new.id ? payload.new as Guardian : g));
        if (payload.eventType === 'DELETE') setGuardians(prev => prev.filter(g => g.id !== payload.old.id));
      })
      .subscribe();

    const logsChannel = supabase.channel(`public:camera_logs:${currentSchool.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'camera_logs', filter: `school_id=eq.${currentSchool.id}` }, payload => {
        const newLog = payload.new as CameraLog;
        setCameraLogs(prev => [newLog, ...prev].slice(0, 50));
        
        if (newLog.event_type === 'face' && newLog.matched) {
          playBeep();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(studentsChannel);
      supabase.removeChannel(guardiansChannel);
      supabase.removeChannel(logsChannel);
    };
  }, [currentSchool]);

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudent.firstName || !newStudent.lastName || !newStudent.grade) return;
    const { error } = await supabase.from('students').insert([{
      firstName: newStudent.firstName,
      lastName: newStudent.lastName,
      grade: newStudent.grade,
      photoUrl: newStudent.photoUrl,
      guardianIds: [],
      school_id: currentSchool?.id
    }]);
    if (error) {
      console.error(error);
      alert('Error al agregar estudiante: ' + error.message);
      return;
    }
    setNewStudent({ firstName: '', lastName: '', grade: '', photoUrl: '' });
  };

  const handleAddGuardian = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGuardian.firstName || !newGuardian.lastName || !newGuardian.licensePlate) return;
    const { error } = await supabase.from('guardians').insert([{
      firstName: newGuardian.firstName,
      lastName: newGuardian.lastName,
      licensePlate: newGuardian.licensePlate,
      vehicleModel: newGuardian.vehicleModel,
      photoUrl: newGuardian.photoUrl,
      licensePlatePhotoUrl: newGuardian.licensePlatePhotoUrl,
      studentIds: [],
      school_id: currentSchool?.id
    }]);
    if (error) {
      console.error(error);
      alert('Error al agregar acudiente: ' + error.message);
      return;
    }
    setNewGuardian({ firstName: '', lastName: '', licensePlate: '', vehicleModel: '', photoUrl: '', licensePlatePhotoUrl: '' });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, callback: (base64: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // Aumentamos la resolución a 800x800 para mejor detalle en el reconocimiento facial
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        // Aumentamos la calidad de compresión a 0.9 (90%)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        callback(dataUrl);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const updateGuardianPhoto = async (guardianId: string, photoUrl: string) => {
    const { error } = await supabase.from('guardians').update({ photoUrl }).eq('id', guardianId);
    if (error) alert('Error al actualizar foto: ' + error.message);
  };

  const updateGuardianLicensePlatePhoto = async (guardianId: string, licensePlatePhotoUrl: string) => {
    const { error } = await supabase.from('guardians').update({ licensePlatePhotoUrl }).eq('id', guardianId);
    if (error) alert('Error al actualizar foto de placa: ' + error.message);
  };

  const updateStudentPhoto = async (studentId: string, photoUrl: string) => {
    const { error } = await supabase.from('students').update({ photoUrl }).eq('id', studentId);
    if (error) alert('Error al actualizar foto: ' + error.message);
  };

  const openWebcam = async (target: string) => {
    setWebcamTarget(target);
    setIsWebcamOpen(true);
    try {
      // Solicitamos la máxima resolución posible a la cámara web
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing webcam: ", err);
      alert("No se pudo acceder a la cámara. Por favor, verifica los permisos.");
      closeWebcam();
    }
  };

  const closeWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsWebcamOpen(false);
    setWebcamTarget(null);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    
    const canvas = document.createElement('canvas');
    const video = videoRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    // Aumentamos la calidad de compresión a 0.9 (90%)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    
    if (webcamTarget === 'newGuardian') {
      setNewGuardian(prev => ({ ...prev, photoUrl: dataUrl }));
    } else if (webcamTarget === 'newGuardianPlate') {
      setNewGuardian(prev => ({ ...prev, licensePlatePhotoUrl: dataUrl }));
    } else if (webcamTarget === 'newStudent') {
      setNewStudent(prev => ({ ...prev, photoUrl: dataUrl }));
    } else if (webcamTarget?.startsWith('guardian:')) {
      updateGuardianPhoto(webcamTarget.split(':')[1], dataUrl);
    } else if (webcamTarget?.startsWith('guardianPlate:')) {
      updateGuardianLicensePlatePhoto(webcamTarget.split(':')[1], dataUrl);
    } else if (webcamTarget?.startsWith('student:')) {
      updateStudentPhoto(webcamTarget.split(':')[1], dataUrl);
    }
    
    closeWebcam();
  };

  const handleImportStudents = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      complete: async (results) => {
        const toInsert = (results.data as any[])
          .filter(row => row.firstName && row.lastName && row.grade)
          .map(row => ({
            firstName: row.firstName,
            lastName: row.lastName,
            grade: row.grade,
            photoUrl: row.photoUrl || '',
            guardianIds: [],
            school_id: currentSchool?.id
          }));
        if (toInsert.length > 0) {
          await supabase.from('students').insert(toInsert);
        }
        alert('Estudiantes importados correctamente');
      }
    });
  };

  const handleImportGuardians = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      complete: async (results) => {
        const toInsert = (results.data as any[])
          .filter(row => row.firstName && row.lastName && row.licensePlate)
          .map(row => ({
            firstName: row.firstName,
            lastName: row.lastName,
            licensePlate: row.licensePlate,
            vehicleModel: row.vehicleModel || '',
            photoUrl: row.photoUrl || '',
            licensePlatePhotoUrl: row.licensePlatePhotoUrl || '',
            studentIds: [],
            school_id: currentSchool?.id
          }));
        if (toInsert.length > 0) {
          await supabase.from('guardians').insert(toInsert);
        }
        alert('Acudientes importados correctamente');
      }
    });
  };

  const deleteStudent = async (id: string) => {
    if (confirm('¿Eliminar estudiante?')) {
      await supabase.from('students').delete().eq('id', id);
    }
  };

  const deleteGuardian = async (id: string) => {
    if (confirm('¿Eliminar acudiente?')) {
      await supabase.from('guardians').delete().eq('id', id);
    }
  };

  const startEditingGuardian = (guardian: Guardian) => {
    setEditingGuardianId(guardian.id);
    setEditGuardianData({
      firstName: guardian.firstName,
      lastName: guardian.lastName,
      licensePlate: guardian.licensePlate,
      vehicleModel: guardian.vehicleModel || ''
    });
  };

  const saveGuardianChanges = async (id: string) => {
    if (!editGuardianData.firstName || !editGuardianData.lastName || !editGuardianData.licensePlate) return;
    await supabase.from('guardians').update({
      firstName: editGuardianData.firstName,
      lastName: editGuardianData.lastName,
      licensePlate: editGuardianData.licensePlate.toUpperCase(),
      vehicleModel: editGuardianData.vehicleModel
    }).eq('id', id);
    setEditingGuardianId(null);
  };

  const linkGuardianToStudent = async (studentId: string, guardianId: string) => {
    const student = students.find(s => s.id === studentId);
    const guardian = guardians.find(g => g.id === guardianId);
    
    if (student && guardian) {
      if (!(student.guardianIds || []).includes(guardianId)) {
        await supabase.from('students').update({
          guardianIds: [...(student.guardianIds || []), guardianId]
        }).eq('id', studentId);
      }
      if (!(guardian.studentIds || []).includes(studentId)) {
        await supabase.from('guardians').update({
          studentIds: [...(guardian.studentIds || []), studentId]
        }).eq('id', guardianId);
      }
      alert('Enlace creado exitosamente');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserForm.email || !newUserForm.password) return;
    setIsCreatingUser(true);

    try {
      const { data, error } = await supabase.rpc('create_user_admin', {
        new_email: newUserForm.email,
        new_password: newUserForm.password,
        new_role: newUserForm.role,
        new_school_id: newUserForm.school_id || null
      });

      if (error) {
        alert('Error de conexión: ' + error.message);
      } else if (data && data.success === false) {
        alert('Error en base de datos: ' + data.message);
      } else {
        alert('Usuario creado exitosamente');
        setNewUserForm({ email: '', password: '', role: 'user', school_id: '' });
        // Refrescar lista de usuarios
        const { data: usersData } = await supabase.from('user_profiles').select('*');
        if (usersData) setUsers(usersData);
      }
    } catch (error: any) {
      console.error(error);
      alert('Error inesperado: ' + error.message);
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordModal.userId || !passwordModal.newPassword) return;
    setIsUpdatingPassword(true);

    try {
      const { data, error } = await supabase.rpc('update_user_password_admin', {
        target_user_id: passwordModal.userId,
        new_password: passwordModal.newPassword
      });

      if (error) {
        alert('Error de conexión: ' + error.message);
      } else if (data && data.success === false) {
        alert('Error en base de datos: ' + data.message);
      } else {
        alert('Contraseña actualizada exitosamente');
        setPasswordModal({ isOpen: false, userId: null, newPassword: '' });
      }
    } catch (error: any) {
      console.error(error);
      alert('Error inesperado: ' + error.message);
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleAddSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSchool.name) return;
    const { error } = await supabase.from('schools').insert([{
      name: newSchool.name,
      address: newSchool.address,
    }]);
    if (error) {
      console.error(error);
      alert('Error al agregar colegio: ' + error.message);
      return;
    }
    setNewSchool({ name: '', address: '' });
    await fetchSchools();
  };

  const deleteSchool = async (id: string) => {
    if (confirm('¿Eliminar colegio? Esto puede afectar a los usuarios y registros asociados.')) {
      await supabase.from('schools').delete().eq('id', id);
      await fetchSchools();
    }
  };

  const updateUserRole = async (userId: string, role: string) => {
    const { error } = await supabase
      .from('user_profiles')
      .update({ role })
      .eq('id', userId);
    if (error) {
      console.error(error);
      alert('Error al actualizar rol: ' + error.message);
    } else {
      setUsers(users.map(u => u.id === userId ? { ...u, role } : u));
    }
  };

  const updateUserSchool = async (userId: string, schoolId: string) => {
    const { error } = await supabase
      .from('user_profiles')
      .update({ school_id: schoolId || null })
      .eq('id', userId);
    if (error) {
      console.error(error);
      alert('Error al actualizar usuario: ' + error.message);
    } else {
      setUsers(users.map(u => u.id === userId ? { ...u, school_id: schoolId || null } : u));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Administración de Base de Datos</h1>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('students')}
            className={`${
              activeTab === 'students'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Estudiantes ({students.length})
          </button>
          <button
            onClick={() => setActiveTab('guardians')}
            className={`${
              activeTab === 'guardians'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Acudientes ({guardians.length})
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`${
              activeTab === 'logs'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2`}
          >
            <Activity className="w-4 h-4" />
            Historial de Cámara
          </button>
          {userProfile?.role === 'superUser' && (
            <>
            <button
              onClick={() => setActiveTab('schools')}
              className={`${
                activeTab === 'schools'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Colegios ({schools.length})
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`${
                activeTab === 'users'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Usuarios ({users.length})
            </button>
          </>
          )}
        </nav>
      </div>

      {activeTab === 'users' && userProfile?.role === 'superUser' && (
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Crear Nuevo Usuario</h3>
            <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <input
                type="email"
                placeholder="Correo electrónico"
                value={newUserForm.email}
                onChange={e => setNewUserForm({...newUserForm, email: e.target.value})}
                className="border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
                required
              />
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Contraseña"
                  value={newUserForm.password}
                  onChange={e => setNewUserForm({...newUserForm, password: e.target.value})}
                  className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <select
                value={newUserForm.role}
                onChange={e => setNewUserForm({...newUserForm, role: e.target.value})}
                className="border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="user">Usuario normal</option>
                <option value="admin">Administrador</option>
                <option value="superUser">Super Usuario</option>
              </select>
              <select
                value={newUserForm.school_id}
                onChange={e => setNewUserForm({...newUserForm, school_id: e.target.value})}
                className="border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">-- Sin colegio --</option>
                {schools.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button type="submit" disabled={isCreatingUser} className="bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700 flex items-center justify-center gap-2 md:col-span-4 disabled:opacity-50">
                <Plus className="w-5 h-5" /> {isCreatingUser ? 'Creando...' : 'Crear Usuario'}
              </button>
            </form>
          </div>

          <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-100">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rol</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Colegio Asignado</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500">
                      No hay usuarios registrados
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {user.email || user.id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <select
                          value={user.role || 'user'}
                          onChange={(e) => updateUserRole(user.id, e.target.value)}
                          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                        >
                          <option value="user">Usuario normal</option>
                          <option value="admin">Administrador</option>
                          <option value="superUser">Super Usuario</option>
                        </select>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <select
                          value={user.school_id || ''}
                          onChange={(e) => updateUserSchool(user.id, e.target.value)}
                          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                        >
                          <option value="">-- Sin colegio --</option>
                          {schools.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => setPasswordModal({ isOpen: true, userId: user.id, newPassword: '' })}
                          className="text-blue-600 hover:text-blue-900 flex items-center justify-end gap-1 ml-auto"
                          title="Cambiar contraseña"
                        >
                          <Key className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Modal para cambiar contraseña */}
          {passwordModal.isOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold text-gray-900">Cambiar Contraseña</h3>
                  <button 
                    onClick={() => setPasswordModal({ isOpen: false, userId: null, newPassword: '' })} 
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleUpdatePassword} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nueva Contraseña</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={passwordModal.newPassword}
                        onChange={(e) => setPasswordModal({ ...passwordModal, newPassword: e.target.value as any })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 pr-10"
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-6">
                    <button
                      type="button"
                      onClick={() => setPasswordModal({ isOpen: false, userId: null, newPassword: '' })}
                      className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isUpdatingPassword}
                      className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg font-medium disabled:opacity-50"
                    >
                      {isUpdatingPassword ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'schools' && userProfile?.role === 'superUser' && (
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Agregar Colegio</h3>
            <form onSubmit={handleAddSchool} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Nombre del Colegio"
                value={newSchool.name}
                onChange={e => setNewSchool({...newSchool, name: e.target.value})}
                className="border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
                required
              />
              <input
                type="text"
                placeholder="Dirección (Opcional)"
                value={newSchool.address}
                onChange={e => setNewSchool({...newSchool, address: e.target.value})}
                className="border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
              />
              <button type="submit" className="bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700 flex items-center justify-center gap-2 md:col-span-2">
                <Plus className="w-5 h-5" /> Agregar Colegio
              </button>
            </form>
          </div>

          <div className="bg-white shadow-sm rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dirección</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {schools.map((school) => (
                  <tr key={school.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{school.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">{school.address || 'N/A'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button onClick={() => deleteSchool(school.id)} className="text-red-600 hover:text-red-900">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'students' && (
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Agregar Estudiante Manualmente</h3>
            <form onSubmit={handleAddStudent} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input
                type="text"
                placeholder="Nombre"
                value={newStudent.firstName}
                onChange={e => setNewStudent({...newStudent, firstName: e.target.value})}
                className="border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
                required
              />
              <input
                type="text"
                placeholder="Apellido"
                value={newStudent.lastName}
                onChange={e => setNewStudent({...newStudent, lastName: e.target.value})}
                className="border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
                required
              />
              <input
                type="text"
                placeholder="Grado (ej. 5A)"
                value={newStudent.grade}
                onChange={e => setNewStudent({...newStudent, grade: e.target.value})}
                className="border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
                required
              />
              <div className="flex items-center gap-2">
                <label className="cursor-pointer bg-gray-50 text-gray-600 px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-100 flex-1 text-center text-sm flex items-center justify-center gap-2">
                  <Upload className="w-4 h-4" />
                  <span className="hidden sm:inline">Subir Foto</span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={(e) => handleImageUpload(e, (base64) => setNewStudent(prev => ({...prev, photoUrl: base64})))} 
                  />
                </label>
                <button 
                  type="button"
                  onClick={() => openWebcam('newStudent')}
                  className="bg-gray-50 text-gray-600 px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-100 flex-1 text-center text-sm flex items-center justify-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  <span className="hidden sm:inline">Cámara</span>
                </button>
                {newStudent.photoUrl && (
                  <img src={newStudent.photoUrl} alt="Preview" className="w-10 h-10 rounded-full object-cover border border-gray-200" />
                )}
              </div>
              <button type="submit" className="bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700 flex items-center justify-center gap-2 md:col-span-2">
                <Plus className="w-5 h-5" /> Agregar Estudiante
              </button>
            </form>
          </div>

          <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm">
            <h2 className="text-lg font-medium">Lista de Estudiantes</h2>
            <div className="flex items-center gap-4">
              <label className="cursor-pointer bg-blue-50 text-blue-600 px-4 py-2 rounded-lg font-medium hover:bg-blue-100 flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Importar CSV
                <input type="file" accept=".csv" className="hidden" onChange={handleImportStudents} />
              </label>
            </div>
          </div>

          <div className="bg-white shadow-sm rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Foto</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Grado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acudientes Vinculados</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {students.map((student) => (
                  <tr key={student.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="relative group w-10 h-10">
                        {student.photoUrl ? (
                          <img src={student.photoUrl} alt="Foto" className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-400">
                            <Camera className="w-4 h-4" />
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                          <label className="cursor-pointer hover:text-blue-300 p-1" title="Subir foto">
                            <Upload className="w-3 h-3" />
                            <input 
                              type="file" 
                              accept="image/*" 
                              className="hidden" 
                              onChange={(e) => handleImageUpload(e, (base64) => updateStudentPhoto(student.id, base64))} 
                            />
                          </label>
                          <button onClick={() => openWebcam(`student:${student.id}`)} className="hover:text-blue-300 p-1" title="Tomar foto">
                            <Camera className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{student.firstName} {student.lastName}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        {student.grade}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {(student.guardianIds || []).length} acudientes
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button onClick={() => deleteStudent(student.id)} className="text-red-600 hover:text-red-900">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'guardians' && (
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Agregar Acudiente Manualmente</h3>
            <form onSubmit={handleAddGuardian} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input
                type="text"
                placeholder="Nombre"
                value={newGuardian.firstName}
                onChange={e => setNewGuardian({...newGuardian, firstName: e.target.value})}
                className="border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
                required
              />
              <input
                type="text"
                placeholder="Apellido"
                value={newGuardian.lastName}
                onChange={e => setNewGuardian({...newGuardian, lastName: e.target.value})}
                className="border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
                required
              />
              <input
                type="text"
                placeholder="Placa (ej. ABC-123)"
                value={newGuardian.licensePlate}
                onChange={e => setNewGuardian({...newGuardian, licensePlate: e.target.value})}
                className="border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
                required
              />
              <input
                type="text"
                placeholder="Modelo Vehículo (Opcional)"
                value={newGuardian.vehicleModel}
                onChange={e => setNewGuardian({...newGuardian, vehicleModel: e.target.value})}
                className="border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
              />
              <div className="flex items-center gap-2">
                <label className="cursor-pointer bg-gray-50 text-gray-600 px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-100 flex-1 text-center text-sm flex items-center justify-center gap-2">
                  <Upload className="w-4 h-4" />
                  <span className="hidden sm:inline">Foto Rostro</span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={(e) => handleImageUpload(e, (base64) => setNewGuardian(prev => ({...prev, photoUrl: base64})))} 
                  />
                </label>
                <button 
                  type="button"
                  onClick={() => openWebcam('newGuardian')}
                  className="bg-gray-50 text-gray-600 px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-100 flex-1 text-center text-sm flex items-center justify-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  <span className="hidden sm:inline">Cámara</span>
                </button>
                {newGuardian.photoUrl && (
                  <img src={newGuardian.photoUrl} alt="Preview" className="w-10 h-10 rounded-full object-cover border border-gray-200" />
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer bg-gray-50 text-gray-600 px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-100 flex-1 text-center text-sm flex items-center justify-center gap-2">
                  <Upload className="w-4 h-4" />
                  <span className="hidden sm:inline">Foto Placa</span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={(e) => handleImageUpload(e, (base64) => setNewGuardian(prev => ({...prev, licensePlatePhotoUrl: base64})))} 
                  />
                </label>
                <button 
                  type="button"
                  onClick={() => openWebcam('newGuardianPlate')}
                  className="bg-gray-50 text-gray-600 px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-100 flex-1 text-center text-sm flex items-center justify-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  <span className="hidden sm:inline">Cámara</span>
                </button>
                {newGuardian.licensePlatePhotoUrl && (
                  <img src={newGuardian.licensePlatePhotoUrl} alt="Preview" className="w-10 h-10 rounded-lg object-cover border border-gray-200" />
                )}
              </div>
              <button type="submit" className="bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700 flex items-center justify-center gap-2 md:col-span-3">
                <Plus className="w-5 h-5" /> Agregar Acudiente
              </button>
            </form>
          </div>

          <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm">
            <h2 className="text-lg font-medium">Lista de Acudientes</h2>
            <div className="flex items-center gap-4">
              <label className="cursor-pointer bg-blue-50 text-blue-600 px-4 py-2 rounded-lg font-medium hover:bg-blue-100 flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Importar CSV
                <input type="file" accept=".csv" className="hidden" onChange={handleImportGuardians} />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {guardians.map((guardian) => (
              <div key={guardian.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="relative group">
                      {guardian.photoUrl ? (
                        <img src={guardian.photoUrl} alt="Foto" className="w-16 h-16 rounded-full object-cover" />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-gray-400">
                          <Camera className="w-6 h-6" />
                        </div>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                        <label className="cursor-pointer hover:text-blue-300 p-1" title="Subir foto">
                          <Upload className="w-4 h-4" />
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={(e) => handleImageUpload(e, (base64) => updateGuardianPhoto(guardian.id, base64))} 
                          />
                        </label>
                        <button onClick={() => openWebcam(`guardian:${guardian.id}`)} className="hover:text-blue-300 p-1" title="Tomar foto">
                          <Camera className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {editingGuardianId === guardian.id ? (
                      <div className="flex-1 space-y-2">
                        <input
                          type="text"
                          value={editGuardianData.firstName}
                          onChange={e => setEditGuardianData({...editGuardianData, firstName: e.target.value})}
                          className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                          placeholder="Nombre"
                        />
                        <input
                          type="text"
                          value={editGuardianData.lastName}
                          onChange={e => setEditGuardianData({...editGuardianData, lastName: e.target.value})}
                          className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                          placeholder="Apellido"
                        />
                        <input
                          type="text"
                          value={editGuardianData.licensePlate}
                          onChange={e => setEditGuardianData({...editGuardianData, licensePlate: e.target.value})}
                          className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                          placeholder="Placa"
                        />
                        <input
                          type="text"
                          value={editGuardianData.vehicleModel}
                          onChange={e => setEditGuardianData({...editGuardianData, vehicleModel: e.target.value})}
                          className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                          placeholder="Modelo Vehículo"
                        />
                      </div>
                    ) : (
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900">{guardian.firstName} {guardian.lastName}</h3>
                        <p className="text-sm text-gray-500">Placa: {guardian.licensePlate}</p>
                        <p className="text-sm text-gray-500">Vehículo: {guardian.vehicleModel || 'N/A'}</p>
                      </div>
                    )}
                  </div>
                  
                  <div className="border-t border-gray-100 pt-4 mt-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Foto de la Placa</h4>
                    <div className="flex items-center gap-4">
                      <div className="relative group">
                        {guardian.licensePlatePhotoUrl ? (
                          <img src={guardian.licensePlatePhotoUrl} alt="Placa" className="w-24 h-12 rounded-lg object-cover border border-gray-200" />
                        ) : (
                          <div className="w-24 h-12 rounded-lg bg-gray-200 flex items-center justify-center text-gray-400 border border-gray-300">
                            <span className="text-xs font-medium">Sin Foto</span>
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-60 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity gap-2">
                          <label className="cursor-pointer hover:text-blue-300 p-1" title="Subir foto de placa">
                            <Upload className="w-4 h-4" />
                            <input 
                              type="file" 
                              accept="image/*" 
                              className="hidden" 
                              onChange={(e) => handleImageUpload(e, (base64) => updateGuardianLicensePlatePhoto(guardian.id, base64))} 
                            />
                          </label>
                          <button onClick={() => openWebcam(`guardianPlate:${guardian.id}`)} className="hover:text-blue-300 p-1" title="Tomar foto de placa">
                            <Camera className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-100 pt-4 mt-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Vincular Estudiante</h4>
                    <div className="flex gap-2">
                      <select 
                        id={`select-${guardian.id}`}
                        className="flex-1 text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Seleccionar...</option>
                        {students.filter(s => !(s.guardianIds || []).includes(guardian.id)).map(s => (
                          <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
                        ))}
                      </select>
                      <button 
                        onClick={() => {
                          const select = document.getElementById(`select-${guardian.id}`) as HTMLSelectElement;
                          if (select.value) linkGuardianToStudent(select.value, guardian.id);
                        }}
                        className="bg-blue-50 text-blue-600 p-2 rounded-md hover:bg-blue-100"
                      >
                        <LinkIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {(guardian.studentIds || []).length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Acudidos:</h4>
                      <div className="flex flex-wrap gap-2">
                        {(guardian.studentIds || []).map(studentId => {
                          const student = students.find(s => s.id === studentId);
                          return student ? (
                            <span key={studentId} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {student.firstName} {student.lastName}
                            </span>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}
                </div>
                <div className="bg-gray-50 px-6 py-3 border-t border-gray-100 flex justify-end gap-4">
                  {editingGuardianId === guardian.id ? (
                    <>
                      <button onClick={() => setEditingGuardianId(null)} className="text-gray-600 hover:text-gray-900 text-sm font-medium flex items-center gap-1">
                        <X className="w-4 h-4" /> Cancelar
                      </button>
                      <button onClick={() => saveGuardianChanges(guardian.id)} className="text-blue-600 hover:text-blue-900 text-sm font-medium flex items-center gap-1">
                        <Save className="w-4 h-4" /> Guardar
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => startEditingGuardian(guardian)} className="text-blue-600 hover:text-blue-900 text-sm font-medium flex items-center gap-1">
                        <Pencil className="w-4 h-4" /> Editar
                      </button>
                      <button onClick={() => deleteGuardian(guardian.id)} className="text-red-600 hover:text-red-900 text-sm font-medium flex items-center gap-1">
                        <Trash2 className="w-4 h-4" /> Eliminar
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="space-y-4">
          <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-100">
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
              <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-600" />
                Registro en Tiempo Real
              </h2>
              <span className="text-xs text-gray-500">Mostrando últimos 50 eventos</span>
            </div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-white">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha / Hora</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lectura</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acudiente</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {cameraLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                      Esperando eventos de la cámara...
                    </td>
                  </tr>
                ) : (
                  cameraLogs.map((log) => {
                    const guardian = log.guardian_id ? guardians.find(g => g.id === log.guardian_id) : null;
                    return (
                      <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-md ${
                            log.event_type === 'plate' ? 'bg-blue-100 text-blue-800' : 
                            log.event_type === 'face' ? 'bg-purple-100 text-purple-800' : 
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {log.event_type === 'plate' ? 'Placa' : log.event_type === 'face' ? 'Rostro' : 'Desconocido'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {log.content}
                          {log.details && <span className="block text-xs text-gray-500 font-normal mt-1">{log.details}</span>}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {log.matched ? (
                            <span className="flex items-center gap-1 text-green-600 text-sm font-medium">
                              <CheckCircle className="w-4 h-4" /> Reconocido
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-red-500 text-sm font-medium">
                              <XCircle className="w-4 h-4" /> No Reconocido
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {guardian ? `${guardian.firstName} ${guardian.lastName}` : '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      <AIAssistant students={students} guardians={guardians} />

      {/* Webcam Modal */}
      {isWebcamOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl">
            <div className="p-4 flex justify-between items-center border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">Tomar Foto</h3>
              <button onClick={closeWebcam} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-4">
              <div className="relative bg-black rounded-xl overflow-hidden aspect-square flex items-center justify-center">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="mt-6 flex justify-center">
                <button 
                  onClick={capturePhoto} 
                  className="bg-blue-600 text-white rounded-full p-4 hover:bg-blue-700 shadow-lg transform transition hover:scale-105"
                >
                  <Camera className="w-8 h-8" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
