import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { Student, Guardian } from '../types';
import Papa from 'papaparse';
import { Upload, Plus, Trash2, Link as LinkIcon, Camera, X } from 'lucide-react';
import AIAssistant from '../components/AIAssistant';

export default function Admin() {
  const [students, setStudents] = useState<Student[]>([]);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [activeTab, setActiveTab] = useState<'students' | 'guardians'>('students');

  const [newStudent, setNewStudent] = useState({ firstName: '', lastName: '', grade: '' });
  const [newGuardian, setNewGuardian] = useState({ firstName: '', lastName: '', licensePlate: '', vehicleModel: '', photoUrl: '' });

  const [isWebcamOpen, setIsWebcamOpen] = useState(false);
  const [webcamTarget, setWebcamTarget] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const fetchStudents = async () => {
      const { data } = await supabase.from('students').select('*');
      if (data) setStudents(data as Student[]);
    };
    const fetchGuardians = async () => {
      const { data } = await supabase.from('guardians').select('*');
      if (data) setGuardians(data as Guardian[]);
    };

    fetchStudents();
    fetchGuardians();

    const studentsChannel = supabase.channel('public:students')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, payload => {
        if (payload.eventType === 'INSERT') setStudents(prev => [...prev, payload.new as Student]);
        if (payload.eventType === 'UPDATE') setStudents(prev => prev.map(s => s.id === payload.new.id ? payload.new as Student : s));
        if (payload.eventType === 'DELETE') setStudents(prev => prev.filter(s => s.id !== payload.old.id));
      })
      .subscribe();

    const guardiansChannel = supabase.channel('public:guardians')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guardians' }, payload => {
        if (payload.eventType === 'INSERT') setGuardians(prev => [...prev, payload.new as Guardian]);
        if (payload.eventType === 'UPDATE') setGuardians(prev => prev.map(g => g.id === payload.new.id ? payload.new as Guardian : g));
        if (payload.eventType === 'DELETE') setGuardians(prev => prev.filter(g => g.id !== payload.old.id));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(studentsChannel);
      supabase.removeChannel(guardiansChannel);
    };
  }, []);

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudent.firstName || !newStudent.lastName || !newStudent.grade) return;
    await supabase.from('students').insert([{
      firstName: newStudent.firstName,
      lastName: newStudent.lastName,
      grade: newStudent.grade,
      guardianIds: []
    }]);
    setNewStudent({ firstName: '', lastName: '', grade: '' });
  };

  const handleAddGuardian = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGuardian.firstName || !newGuardian.lastName || !newGuardian.licensePlate) return;
    await supabase.from('guardians').insert([{
      firstName: newGuardian.firstName,
      lastName: newGuardian.lastName,
      licensePlate: newGuardian.licensePlate,
      vehicleModel: newGuardian.vehicleModel,
      photoUrl: newGuardian.photoUrl,
      studentIds: []
    }]);
    setNewGuardian({ firstName: '', lastName: '', licensePlate: '', vehicleModel: '', photoUrl: '' });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, callback: (base64: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 300;
        const MAX_HEIGHT = 300;
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
        
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        callback(dataUrl);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const updateGuardianPhoto = async (guardianId: string, photoUrl: string) => {
    await supabase.from('guardians').update({ photoUrl }).eq('id', guardianId);
  };

  const openWebcam = async (target: string) => {
    setWebcamTarget(target);
    setIsWebcamOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
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
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    
    if (webcamTarget === 'new') {
      setNewGuardian({ ...newGuardian, photoUrl: dataUrl });
    } else if (webcamTarget) {
      updateGuardianPhoto(webcamTarget, dataUrl);
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
            guardianIds: []
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
            studentIds: []
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

  const linkGuardianToStudent = async (studentId: string, guardianId: string) => {
    const student = students.find(s => s.id === studentId);
    const guardian = guardians.find(g => g.id === guardianId);
    
    if (student && guardian) {
      if (!student.guardianIds.includes(guardianId)) {
        await supabase.from('students').update({
          guardianIds: [...student.guardianIds, guardianId]
        }).eq('id', studentId);
      }
      if (!guardian.studentIds.includes(studentId)) {
        await supabase.from('guardians').update({
          studentIds: [...guardian.studentIds, studentId]
        }).eq('id', guardianId);
      }
      alert('Enlace creado exitosamente');
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
        </nav>
      </div>

      {activeTab === 'students' && (
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Agregar Estudiante Manualmente</h3>
            <form onSubmit={handleAddStudent} className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              <button type="submit" className="bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700 flex items-center justify-center gap-2">
                <Plus className="w-5 h-5" /> Agregar
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
                      <div className="text-sm font-medium text-gray-900">{student.firstName} {student.lastName}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        {student.grade}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {student.guardianIds.length} acudientes
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
                  <span className="hidden sm:inline">Subir</span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={(e) => handleImageUpload(e, (base64) => setNewGuardian({...newGuardian, photoUrl: base64}))} 
                  />
                </label>
                <button 
                  type="button"
                  onClick={() => openWebcam('new')}
                  className="bg-gray-50 text-gray-600 px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-100 flex-1 text-center text-sm flex items-center justify-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  <span className="hidden sm:inline">Cámara</span>
                </button>
                {newGuardian.photoUrl && (
                  <img src={newGuardian.photoUrl} alt="Preview" className="w-10 h-10 rounded-full object-cover border border-gray-200" />
                )}
              </div>
              <button type="submit" className="bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700 flex items-center justify-center gap-2">
                <Plus className="w-5 h-5" /> Agregar
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
                        <button onClick={() => openWebcam(guardian.id)} className="hover:text-blue-300 p-1" title="Tomar foto">
                          <Camera className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">{guardian.firstName} {guardian.lastName}</h3>
                      <p className="text-sm text-gray-500">Placa: {guardian.licensePlate}</p>
                      <p className="text-sm text-gray-500">Vehículo: {guardian.vehicleModel || 'N/A'}</p>
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
                        {students.filter(s => !s.guardianIds.includes(guardian.id)).map(s => (
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

                  {guardian.studentIds.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Acudidos:</h4>
                      <div className="flex flex-wrap gap-2">
                        {guardian.studentIds.map(studentId => {
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
                <div className="bg-gray-50 px-6 py-3 border-t border-gray-100 flex justify-end">
                  <button onClick={() => deleteGuardian(guardian.id)} className="text-red-600 hover:text-red-900 text-sm font-medium flex items-center gap-1">
                    <Trash2 className="w-4 h-4" />
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
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
