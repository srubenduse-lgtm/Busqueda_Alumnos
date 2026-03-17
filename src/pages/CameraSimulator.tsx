import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { Guardian, Student } from '../types';
import { Camera, Car, UserCheck, AlertCircle } from 'lucide-react';

export default function CameraSimulator() {
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedGuardian, setSelectedGuardian] = useState<string>('');
  const [isDetecting, setIsDetecting] = useState(false);
  const [lastDetected, setLastDetected] = useState<Guardian | null>(null);

  useEffect(() => {
    const fetchGuardians = async () => {
      const { data } = await supabase.from('guardians').select('*');
      if (data) setGuardians(data as Guardian[]);
    };
    const fetchStudents = async () => {
      const { data } = await supabase.from('students').select('*');
      if (data) setStudents(data as Student[]);
    };

    fetchGuardians();
    fetchStudents();

    const guardiansChannel = supabase.channel('public:guardians_cam')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guardians' }, payload => {
        if (payload.eventType === 'INSERT') setGuardians(prev => [...prev, payload.new as Guardian]);
        if (payload.eventType === 'UPDATE') setGuardians(prev => prev.map(g => g.id === payload.new.id ? payload.new as Guardian : g));
        if (payload.eventType === 'DELETE') setGuardians(prev => prev.filter(g => g.id !== payload.old.id));
      })
      .subscribe();

    const studentsChannel = supabase.channel('public:students_cam')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, payload => {
        if (payload.eventType === 'INSERT') setStudents(prev => [...prev, payload.new as Student]);
        if (payload.eventType === 'UPDATE') setStudents(prev => prev.map(s => s.id === payload.new.id ? payload.new as Student : s));
        if (payload.eventType === 'DELETE') setStudents(prev => prev.filter(s => s.id !== payload.old.id));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(guardiansChannel);
      supabase.removeChannel(studentsChannel);
    };
  }, []);

  const simulateDetection = async () => {
    if (!selectedGuardian) return;

    setIsDetecting(true);
    
    // Simulate processing delay
    setTimeout(async () => {
      const guardian = guardians.find(g => g.id === selectedGuardian);
      if (guardian) {
        setLastDetected(guardian);
        
        // Trigger pickup events for all associated students
        for (const studentId of guardian.studentIds) {
          await supabase.from('pickups').insert([{
            studentId,
            guardianId: guardian.id,
            timestamp: new Date().toISOString(),
            status: 'pending'
          }]);
        }
      }
      setIsDetecting(false);
    }, 1500);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
            <Camera className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Simulador de Cámara Hikvision</h2>
            <p className="text-gray-500 text-sm">Simula la detección facial o de placas vehiculares</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Controls */}
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Seleccionar Acudiente a Detectar
              </label>
              <select
                value={selectedGuardian}
                onChange={(e) => setSelectedGuardian(e.target.value)}
                className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">-- Seleccione un acudiente --</option>
                {guardians.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.firstName} {g.lastName} - Placa: {g.licensePlate}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={simulateDetection}
              disabled={!selectedGuardian || isDetecting}
              className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-medium text-white transition-all ${
                !selectedGuardian || isDetecting
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 shadow-lg hover:shadow-xl'
              }`}
            >
              {isDetecting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                  Analizando imagen...
                </>
              ) : (
                <>
                  <Camera className="w-5 h-5" />
                  Simular Detección
                </>
              )}
            </button>

            {guardians.length === 0 && (
              <div className="flex items-start gap-3 p-4 bg-amber-50 text-amber-800 rounded-lg">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p className="text-sm">
                  No hay acudientes registrados. Ve a la pestaña de Administración para agregar o importar acudientes.
                </p>
              </div>
            )}
          </div>

          {/* Camera Feed Simulation */}
          <div className="relative bg-gray-900 rounded-2xl overflow-hidden aspect-video flex items-center justify-center border-4 border-gray-800">
            {isDetecting ? (
              <div className="absolute inset-0 border-4 border-blue-500 animate-pulse z-10 pointer-events-none" />
            ) : null}
            
            <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/50 text-white px-3 py-1 rounded-full text-xs font-mono">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              REC • CAM-01 ENTRADA
            </div>

            {lastDetected && !isDetecting ? (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
                <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-green-500/20">
                  <UserCheck className="w-12 h-12 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">
                  {lastDetected.firstName} {lastDetected.lastName}
                </h3>
                <div className="flex items-center gap-2 text-green-400 bg-green-400/10 px-4 py-2 rounded-full font-mono">
                  <Car className="w-4 h-4" />
                  {lastDetected.licensePlate}
                </div>
                
                <div className="mt-6 w-full max-w-sm bg-white/10 backdrop-blur-md rounded-xl p-4 text-left">
                  <p className="text-gray-300 text-sm mb-2 uppercase tracking-wider font-semibold">Acudidos detectados:</p>
                  <div className="space-y-2">
                    {lastDetected.studentIds.map(studentId => {
                      const student = students.find(s => s.id === studentId);
                      return student ? (
                        <div key={studentId} className="flex justify-between items-center text-white bg-white/5 px-3 py-2 rounded-lg">
                          <span>{student.firstName} {student.lastName}</span>
                          <span className="text-xs bg-blue-500 px-2 py-1 rounded-full">{student.grade}</span>
                        </div>
                      ) : null;
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-gray-600 flex flex-col items-center">
                <Camera className="w-16 h-16 mb-4 opacity-50" />
                <p className="font-mono text-sm">ESPERANDO DETECCIÓN...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
