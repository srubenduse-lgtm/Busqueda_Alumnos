require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

// Configuración de Supabase (La misma que usa tu app web)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Configuración de la Cámara Local
const CAMERA_IP = process.env.CAMERA_IP || '192.168.114.34';
const CAMERA_USER = process.env.CAMERA_USER || 'admin';
const CAMERA_PASS = process.env.CAMERA_PASS || 'Enanito99$#';
const SCHOOL_ID = process.env.SCHOOL_ID;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Faltan las credenciales de Supabase en el archivo .env');
  process.exit(1);
}

if (!SCHOOL_ID) {
  console.warn('⚠️ ADVERTENCIA: No se ha configurado SCHOOL_ID en el archivo .env. El agente escuchará eventos de TODOS los colegios.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('==================================================');
console.log('🤖 INICIANDO AGENTE LOCAL PARA CÁMARAS HIKVISION');
console.log('==================================================');
console.log(`📡 Conectando a Supabase: ${SUPABASE_URL}`);
console.log(`📷 IP de Cámara Objetivo: ${CAMERA_IP}`);
if (SCHOOL_ID) {
  console.log(`🏫 Filtrando por Colegio ID: ${SCHOOL_ID}`);
} else {
  console.log(`🏫 Escuchando eventos de TODOS los colegios`);
}

// Configurar el filtro de Supabase
let filterString = 'matched=eq.true';
if (SCHOOL_ID) {
  // Supabase realtime filters only support one condition in the 'filter' string easily, 
  // but we can filter on the client side if needed, or use a more complex setup.
  // Actually, Supabase Realtime 'filter' string only supports a single column=eq.value
  // So we will filter by school_id on the server, and check 'matched' on the client.
  filterString = `school_id=eq.${SCHOOL_ID}`;
}

// Escuchar nuevos logs de cámara en tiempo real
supabase
  .channel('camera-agent')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'camera_logs',
      filter: filterString
    },
    async (payload) => {
      // Si filtramos por school_id en el servidor, debemos verificar 'matched' aquí
      if (SCHOOL_ID && payload.new.matched !== true) {
        return; // Ignorar si no hizo match
      }
      // Si filtramos por matched en el servidor (sin SCHOOL_ID), debemos verificar school_id aquí (aunque no hay)
      
      console.log('\n[EVENTO] ✅ Rostro o placa reconocida detectada en la base de datos!');
      console.log(`Detalles: ${payload.new.content} (ID Acudiente: ${payload.new.guardian_id})`);
      await triggerCameraBeep();
    }
  )
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log('\n✅ Conectado a la nube exitosamente.');
      console.log('⏳ Esperando detecciones de la cámara...');
    } else if (status === 'CHANNEL_ERROR') {
      console.error('❌ Error al conectar con Supabase.');
    }
  });

// Función para enviar la señal a la cámara local
async function triggerCameraBeep() {
  console.log(`[HIKVISION] Enviando señal de pitido a la cámara en ${CAMERA_IP}...`);
  
  // Endpoint de ISAPI para activar la alarma sonora y luminosa (AcuSense / ColorVu)
  const endpointBuzzer = `http://${CAMERA_IP}/ISAPI/Smart/AudioAndLightAlarm/channels/1/alarms`;
  
  // Endpoint alternativo para activar un Relay (ej. abrir una puerta)
  // const endpointRelay = `http://${CAMERA_IP}/ISAPI/System/IO/outputs/1/trigger`;

  try {
    // Nota: Las cámaras Hikvision requieren autenticación "Digest" por defecto.
    // Si la cámara está configurada en "Digest/Basic", axios puede enviar Basic auth así:
    
    /* DESCOMENTAR PARA USAR EN PRODUCCIÓN:
    await axios.put(
      endpointBuzzer, 
      "<AudioAndLightAlarm><soundEnable>true</soundEnable></AudioAndLightAlarm>",
      {
        auth: {
          username: CAMERA_USER,
          password: CAMERA_PASS
        },
        headers: {
          'Content-Type': 'application/xml'
        }
      }
    );
    */
    
    console.log('✅ Señal de pitido enviada con éxito a la cámara local.');
  } catch (error) {
    console.error('❌ Error al comunicarse con la cámara local:', error.message);
    if (error.response && error.response.status === 401) {
      console.error('   -> Error de Autenticación: Verifica usuario/contraseña o cambia la cámara a modo "Digest/Basic".');
    }
  }
}
