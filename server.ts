import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { parseStringPromise } from 'xml2js';
import { createServer as createViteServer } from 'vite';
import path from 'path';

// Note: To write to Firestore from the server without a service account, 
// we will expose an API that the client can optionally poll, OR 
// we can initialize the Firebase Admin SDK if the user provides a service account.
// For this example, we will just parse the Hikvision payload and log it, 
// and provide a way for the client to fetch the latest detection.

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Hikvision often sends multipart/form-data with XML and images
const upload = multer();

// Store the latest detection in memory (for demonstration)
// In a real app, you'd save this to Firestore using firebase-admin
let latestDetection: { licensePlate?: string, timestamp: number } | null = null;

// Hikvision ANPR Webhook Endpoint
app.post('/api/webhooks/hikvision', upload.any(), async (req, res) => {
  try {
    console.log('Received webhook from Hikvision camera');
    
    let xmlData = '';

    // 1. Check if the payload is in a file (multipart)
    if (req.files && Array.isArray(req.files)) {
      const xmlFile = req.files.find(f => f.mimetype === 'application/xml' || f.mimetype === 'text/xml');
      if (xmlFile) {
        xmlData = xmlFile.buffer.toString('utf-8');
      }
    } 
    // 2. Check if the payload is in the body directly
    else if (req.body && typeof req.body === 'string' && req.body.startsWith('<')) {
      xmlData = req.body;
    }
    // 3. Check if it's parsed as an object but contains XML string
    else if (Object.keys(req.body).length > 0) {
      const firstKey = Object.keys(req.body)[0];
      if (firstKey.startsWith('<')) {
        xmlData = firstKey + (req.body[firstKey] || '');
      }
    }

    if (xmlData) {
      // Parse the XML from Hikvision
      const result = await parseStringPromise(xmlData, { explicitArray: false });
      
      // Hikvision ANPR typically sends an EventNotificationAlert with ANPR info
      const anprInfo = result?.EventNotificationAlert?.ANPR;
      if (anprInfo && anprInfo.licensePlate) {
        const plate = anprInfo.licensePlate;
        console.log(`[HIKVISION] License Plate Detected: ${plate}`);
        
        latestDetection = {
          licensePlate: plate,
          timestamp: Date.now()
        };
      } else {
        console.log('[HIKVISION] XML parsed, but no license plate found:', result);
      }
    } else {
      console.log('[HIKVISION] No XML data found in the request.');
    }

    // Always return 200 OK so the camera knows we received it
    res.status(200).send('OK');
  } catch (error) {
    console.error('[HIKVISION] Error processing webhook:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Endpoint for the frontend to poll the latest detection
app.get('/api/latest-detection', (req, res) => {
  res.json(latestDetection || {});
});

// Clear the latest detection after it's been processed
app.post('/api/clear-detection', (req, res) => {
  latestDetection = null;
  res.json({ success: true });
});

async function startServer() {
  // Vite middleware for development
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
