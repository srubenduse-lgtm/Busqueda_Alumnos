import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { Pickup, Student, Guardian } from '../types';
import { Volume2, VolumeX, Car, User, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type AnnouncementTask = {
  pickup: Pickup;
  playsRemaining: number;
  nextPlayTime: number;
};

export default function DisplayScreen() {
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [currentAnnouncement, setCurrentAnnouncement] = useState<Pickup | null>(null);
  
  const activeTasks = useRef<AnnouncementTask[]>([]);
  const isSpeaking = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const studentsRef = useRef<Student[]>([]);
  const audioEnabledRef = useRef(audioEnabled);

  useEffect(() => {
    studentsRef.current = students;
  }, [students]);

  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
    if (audioEnabled) {
      processTasks();
    }
  }, [audioEnabled]);

  useEffect(() => {
    const fetchStudents = async () => {
      const { data } = await supabase.from('students').select('*');
      if (data) setStudents(data as Student[]);
    };
    const fetchGuardians = async () => {
      const { data } = await supabase.from('guardians').select('*');
      if (data) setGuardians(data as Guardian[]);
    };
    const fetchPickups = async () => {
      const { data } = await supabase.from('pickups').select('*').in('status', ['pending', 'announced']);
      if (data) {
        const newPickups = data as Pickup[];
        setPickups(newPickups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
        
        const pending = newPickups.filter(p => p.status === 'pending');
        if (pending.length > 0) {
          pending.forEach(p => {
            if (!activeTasks.current.find(t => t.pickup.id === p.id)) {
              activeTasks.current.push({
                pickup: p,
                playsRemaining: 3,
                nextPlayTime: 0
              });
              supabase.from('pickups').update({ status: 'announced' }).eq('id', p.id).then();
            }
          });
          processTasks();
        }
      }
    };

    fetchStudents();
    fetchGuardians();
    fetchPickups();

    const studentsChannel = supabase.channel('public:students_disp')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, payload => {
        if (payload.eventType === 'INSERT') setStudents(prev => [...prev, payload.new as Student]);
        if (payload.eventType === 'UPDATE') setStudents(prev => prev.map(s => s.id === payload.new.id ? payload.new as Student : s));
        if (payload.eventType === 'DELETE') setStudents(prev => prev.filter(s => s.id !== payload.old.id));
      })
      .subscribe();

    const guardiansChannel = supabase.channel('public:guardians_disp')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guardians' }, payload => {
        if (payload.eventType === 'INSERT') setGuardians(prev => [...prev, payload.new as Guardian]);
        if (payload.eventType === 'UPDATE') setGuardians(prev => prev.map(g => g.id === payload.new.id ? payload.new as Guardian : g));
        if (payload.eventType === 'DELETE') setGuardians(prev => prev.filter(g => g.id !== payload.old.id));
      })
      .subscribe();

    const pickupsChannel = supabase.channel('public:pickups_disp')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pickups' }, payload => {
        fetchPickups();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(studentsChannel);
      supabase.removeChannel(guardiansChannel);
      supabase.removeChannel(pickupsChannel);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const processTasks = () => {
    if (!audioEnabledRef.current || isSpeaking.current) return;
    
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (activeTasks.current.length === 0) {
      setCurrentAnnouncement(null);
      return;
    }

    const now = Date.now();
    const readyTasks = activeTasks.current.filter(t => t.nextPlayTime <= now);

    if (readyTasks.length > 0) {
      readyTasks.sort((a, b) => a.nextPlayTime - b.nextPlayTime);
      const taskToPlay = readyTasks[0];

      isSpeaking.current = true;
      setCurrentAnnouncement(taskToPlay.pickup);

      const student = studentsRef.current.find(s => s.id === taskToPlay.pickup.studentId);
      if (student) {
        const text = `Ya vinieron por el estudiante ${student.firstName} ${student.lastName}`;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'es-ES';
        utterance.rate = 0.9;
        
        utterance.onend = () => {
          taskToPlay.playsRemaining--;
          if (taskToPlay.playsRemaining > 0) {
            taskToPlay.nextPlayTime = Date.now() + 10000;
          } else {
            activeTasks.current = activeTasks.current.filter(t => t !== taskToPlay);
          }
          isSpeaking.current = false;
          setTimeout(processTasks, 500);
        };
        
        window.speechSynthesis.speak(utterance);
      } else {
        activeTasks.current = activeTasks.current.filter(t => t !== taskToPlay);
        isSpeaking.current = false;
        processTasks();
      }
    } else {
      const nextTimes = activeTasks.current.map(t => t.nextPlayTime);
      const earliestTime = Math.min(...nextTimes);
      const waitTime = earliestTime - now;
      
      setCurrentAnnouncement(null);
      timerRef.current = setTimeout(processTasks, waitTime);
    }
  };

  const completePickup = async (id: string) => {
    await supabase.from('pickups').update({ status: 'completed' }).eq('id', id);
  };

  const renderCurrentAnnouncement = () => {
    if (!currentAnnouncement) return null;
    const student = students.find(s => s.id === currentAnnouncement.studentId);
    const guardian = guardians.find(g => g.id === currentAnnouncement.guardianId);
    if (!student || !guardian) return null;

    return (
      <div className="space-y-6">
        <h3 className="text-7xl font-black text-white leading-tight">
          {student.firstName} <br/>
          <span className="text-blue-200">{student.lastName}</span>
        </h3>
        <div className="flex flex-wrap gap-4 mt-8">
          <div className="bg-white/10 backdrop-blur-md px-6 py-3 rounded-2xl flex items-center gap-3 border border-white/10">
            <span className="text-blue-200 font-medium uppercase tracking-wider text-sm">Grado</span>
            <span className="text-2xl font-bold text-white">{student.grade}</span>
          </div>
          <div className="bg-white/10 backdrop-blur-md px-6 py-3 rounded-2xl flex items-center gap-3 border border-white/10">
            <Car className="w-6 h-6 text-blue-200" />
            <span className="text-2xl font-bold text-white font-mono">{guardian.licensePlate}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-900 -m-6 p-6 sm:-m-8 sm:p-8 flex flex-col">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-black text-white tracking-tight">SALIDA ESCOLAR</h1>
        <button
          onClick={() => setAudioEnabled(!audioEnabled)}
          className={`flex items-center gap-2 px-6 py-3 rounded-full font-bold text-lg transition-all ${
            audioEnabled 
              ? 'bg-green-500 text-white shadow-lg shadow-green-500/30' 
              : 'bg-red-500 text-white shadow-lg shadow-red-500/30 animate-pulse'
          }`}
        >
          {audioEnabled ? (
            <>
              <Volume2 className="w-6 h-6" />
              Audio Activado
            </>
          ) : (
            <>
              <VolumeX className="w-6 h-6" />
              Activar Audio
            </>
          )}
        </button>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 flex flex-col justify-center">
          <AnimatePresence mode="wait">
            {currentAnnouncement ? (
              <motion.div
                key={currentAnnouncement.id}
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
                className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-12 shadow-2xl border border-blue-400/30 relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 -mt-20 -mr-20 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
                <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-64 h-64 bg-blue-400/20 rounded-full blur-3xl" />

                <div className="relative z-10">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md">
                      <Volume2 className="w-8 h-8 text-white animate-pulse" />
                    </div>
                    <h2 className="text-3xl font-bold text-blue-100 uppercase tracking-widest">Llamado Actual</h2>
                  </div>
                  {renderCurrentAnnouncement()}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center h-full text-gray-500 space-y-6"
              >
                <div className="w-32 h-32 rounded-full bg-gray-800 flex items-center justify-center border-4 border-gray-700">
                  <Clock className="w-16 h-16 text-gray-600" />
                </div>
                <p className="text-2xl font-medium tracking-widest uppercase">Esperando llegadas...</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="bg-gray-800 rounded-3xl p-6 border border-gray-700 flex flex-col h-full overflow-hidden">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
            <User className="w-5 h-5 text-blue-400" />
            En Espera ({pickups.length})
          </h3>
          
          <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
            <AnimatePresence>
              {pickups.map(pickup => {
                const student = students.find(s => s.id === pickup.studentId);
                const guardian = guardians.find(g => g.id === pickup.guardianId);
                if (!student || !guardian) return null;

                const isCurrent = currentAnnouncement?.id === pickup.id;

                return (
                  <motion.div
                    key={pickup.id}
                    layout
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className={`p-4 rounded-2xl border transition-all ${
                      isCurrent 
                        ? 'bg-blue-600/20 border-blue-500/50 shadow-lg shadow-blue-900/20' 
                        : 'bg-gray-700/50 border-gray-600 hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h4 className={`text-xl font-bold ${isCurrent ? 'text-blue-300' : 'text-white'}`}>
                        {student.firstName} {student.lastName}
                      </h4>
                      <span className="text-xs font-bold bg-gray-600 text-gray-300 px-2 py-1 rounded-md">
                        {student.grade}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between mt-4">
                      <div className="flex items-center gap-2 text-gray-400 text-sm">
                        <Car className="w-4 h-4" />
                        <span className="font-mono">{guardian.licensePlate}</span>
                      </div>
                      
                      <button
                        onClick={() => completePickup(pickup.id)}
                        className="text-xs font-bold bg-green-500/20 text-green-400 hover:bg-green-500/30 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Completar
                      </button>
                    </div>
                  </motion.div>
                );
              })}
              
              {pickups.length === 0 && (
                <div className="text-center text-gray-500 py-12">
                  No hay estudiantes en espera
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
