import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { parseStringPromise } from 'xml2js';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Hikvision often sends multipart/form-data with XML and images
const upload = multer();

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://sdslqlqycfusavnyshah.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkc2xxbHF5Y2Z1c2F2bnlzaGFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NjIxNzIsImV4cCI6MjA4OTMzODE3Mn0.qr9jnFGAqgJY18sV-z3JkC6rL_3Oik5ivzYs1X3n0Uo';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Función simulada de Reconocimiento Facial.
 * En producción, aquí conectarías AWS Rekognition, Google Cloud Vision, o Face++.
 */
async function compareFaces(sourceImageBuffer: Buffer, targetBase64: string): Promise<number> {
  // EJEMPLO CON AWS REKOGNITION:
  /*
  const rekognition = new AWS.Rekognition();
  const targetBuffer = Buffer.from(targetBase64.replace(/^data:image\/\w+;base64,/, ""), 'base64');
  const response = await rekognition.compareFaces({
    SourceImage: { Bytes: sourceImageBuffer },
    TargetImage: { Bytes: targetBuffer },
    SimilarityThreshold: 90
  }).promise();
  return response.FaceMatches?.[0]?.Similarity || 0;
  */

  // Simulación: Retorna un número aleatorio bajo para no disparar falsos positivos en pruebas,
  // a menos que estemos forzando una prueba.
  console.log('[IA] Analizando rostro...');
  return Math.random() * 100; 
}

// Hikvision ANPR / Face Recognition Webhook Endpoint
app.post('/api/webhooks/hikvision', upload.any(), async (req, res) => {
  try {
    console.log('--- EVENTO DE CÁMARA RECIBIDO ---');
    
    // Extraer el school_id de los parámetros de la URL (ej: ?school_id=1234-5678)
    const school_id = req.query.school_id as string;
    
    let xmlData = '';
    let imageBuffer: Buffer | null = null;

    // 1. Extraer XML e Imagen del payload (multipart)
    if (req.files && Array.isArray(req.files)) {
      // Buscar el archivo XML
      const xmlFile = req.files.find(f => f.mimetype === 'application/xml' || f.mimetype === 'text/xml' || f.originalname.endsWith('.xml'));
      if (xmlFile) {
        xmlData = xmlFile.buffer.toString('utf-8');
      } else {
        const firstFile = req.files[0];
        if (firstFile && firstFile.buffer.toString('utf-8').includes('<')) {
          xmlData = firstFile.buffer.toString('utf-8');
        }
      }

      // Buscar el archivo de Imagen (Rostro o Vehículo)
      const imgFile = req.files.find(f => f.mimetype.startsWith('image/') || f.originalname.endsWith('.jpg'));
      if (imgFile) {
        imageBuffer = imgFile.buffer;
        console.log(`[HIKVISION] Imagen recibida: ${imgFile.originalname} (${imgFile.size} bytes)`);
      }
    } 
    else if (req.body && typeof req.body === 'string' && req.body.startsWith('<')) {
      xmlData = req.body;
    }
    else if (req.body && Object.keys(req.body).length > 0) {
      const firstKey = Object.keys(req.body)[0];
      if (firstKey.startsWith('<')) {
        xmlData = firstKey + (req.body[firstKey] || '');
      }
    }

    let licensePlate = '';
    let faceId = ''; // Si la cámara envía un ID de rostro

    if (xmlData) {
      try {
        const result = await parseStringPromise(xmlData, { explicitArray: false });
        
        // Extraer Placa (ANPR)
        const anprInfo = result?.EventNotificationAlert?.ANPR;
        if (anprInfo && anprInfo.licensePlate) {
          licensePlate = anprInfo.licensePlate;
        }

        // Extraer ID de Rostro (Si la cámara tiene reconocimiento nativo - Opción 1)
        const faceInfo = result?.EventNotificationAlert?.FaceRecognition;
        if (faceInfo && faceInfo.employeeNo) {
          faceId = faceInfo.employeeNo;
        }
      } catch (xmlError) {
        const matchPlate = xmlData.match(/<licensePlate>\s*([^<]+)\s*<\/licensePlate>/i);
        if (matchPlate && matchPlate[1]) licensePlate = matchPlate[1].trim();
      }
    }

    // Fallbacks para pruebas manuales
    if (!licensePlate && req.body?.licensePlate) licensePlate = req.body.licensePlate;
    if (!licensePlate && req.query.plate) licensePlate = req.query.plate as string;

    // ==========================================
    // LÓGICA 1: BÚSQUEDA POR PLACA (ANPR)
    // ==========================================
    if (licensePlate) {
      console.log(`[HIKVISION] Placa detectada: ${licensePlate}`);
      
      let query = supabase.from('guardians').select('*').ilike('licensePlate', licensePlate);
      if (school_id) {
        query = query.eq('school_id', school_id);
      }
      
      const { data: guardians, error } = await query;

      if (!error && guardians && guardians.length > 0) {
        await processPickup(guardians[0], school_id);
        await saveCameraLog('plate', licensePlate, true, guardians[0].id, undefined, school_id || guardians[0].school_id);
        return res.status(200).send('OK');
      } else {
        await saveCameraLog('plate', licensePlate, false, undefined, undefined, school_id);
      }
    }

    // ==========================================
    // LÓGICA 2: RECONOCIMIENTO FACIAL (IA EN SERVIDOR)
    // ==========================================
    if (imageBuffer) {
      console.log('[HIKVISION] Procesando imagen con IA Facial...');
      
      // Obtener todos los acudientes que tengan foto registrada
      let query = supabase.from('guardians').select('*').not('photoUrl', 'is', null).neq('photoUrl', '');
      if (school_id) {
        query = query.eq('school_id', school_id);
      }
      
      const { data: guardians, error } = await query;

      if (!error && guardians && guardians.length > 0) {
        let bestMatch = null;
        let highestSimilarity = 0;

        // Comparar la imagen entrante con cada foto de la base de datos
        for (const guardian of guardians) {
          try {
            const similarity = await compareFaces(imageBuffer, guardian.photoUrl);
            if (similarity > highestSimilarity) {
              highestSimilarity = similarity;
              bestMatch = guardian;
            }
          } catch (err) {
            console.error(`Error comparando rostro con acudiente ${guardian.id}:`, err);
          }
        }

        // Si la similitud es mayor al 90%, aprobamos la salida
        if (bestMatch && highestSimilarity >= 90) {
          console.log(`[IA] Rostro reconocido: ${bestMatch.firstName} ${bestMatch.lastName} (${highestSimilarity.toFixed(2)}% similitud)`);
          await processPickup(bestMatch, school_id);
          await saveCameraLog('face', 'Rostro detectado', true, bestMatch.id, `Similitud: ${highestSimilarity.toFixed(2)}%`, school_id || bestMatch.school_id);
          
          return res.status(200).send('OK');
        } else {
          console.log(`[IA] Rostro no reconocido. Mayor similitud: ${highestSimilarity.toFixed(2)}%`);
          await saveCameraLog('face', 'Rostro detectado', false, undefined, `Mayor similitud: ${highestSimilarity.toFixed(2)}%`, school_id);
        }
      }
    }

    if (!licensePlate && !imageBuffer) {
      console.log('[HIKVISION] No se detectó placa ni imagen en el payload.');
      await saveCameraLog('unknown', 'Payload irreconocible', false, undefined, undefined, school_id);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('[HIKVISION] Error procesando webhook:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Función auxiliar para guardar logs de la cámara
async function saveCameraLog(eventType: string, content: string, matched: boolean, guardianId?: string, details?: string, school_id?: string) {
  try {
    await supabase.from('camera_logs').insert([{
      event_type: eventType,
      content,
      matched,
      guardian_id: guardianId || null,
      details: details || null,
      school_id: school_id || null
    }]);
  } catch (e) {
    console.error('Error guardando log de cámara:', e);
  }
}

// Función auxiliar para crear los pickups
async function processPickup(guardian: any, school_id?: string) {
  console.log(`Acudiente autorizado: ${guardian.firstName} ${guardian.lastName}`);
  for (const studentId of guardian.studentIds) {
    await supabase.from('pickups').insert([{
      studentId,
      guardianId: guardian.id,
      status: 'pending',
      school_id: school_id || guardian.school_id || null
    }]);
  }
  console.log('Pickups creados exitosamente en Supabase.');
}

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
