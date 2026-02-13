
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from "@google/genai";
import { google } from 'googleapis';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// Clientes de Google Cloud
const secretClient = new SecretManagerServiceClient();

// Configuración de Entorno
const CALENDAR_ID = process.env.CALENDAR_ID;
const GOOGLE_CREDENTIALS_ENV = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.PROJECT_ID;

// Cache de Secretos
let cachedGeminiKey = null;

/**
 * Recupera la API Key de Gemini desde Google Cloud Secret Manager
 */
async function getGeminiApiKey() {
  if (cachedGeminiKey) return cachedGeminiKey;

  if (!PROJECT_ID) {
    console.warn("[Secret Manager] Advertencia: GOOGLE_CLOUD_PROJECT no definido. Intentando fallback...");
  }

  try {
    const name = `projects/${PROJECT_ID}/secrets/GEMINI_API_KEY/versions/latest`;
    console.log(`[Secret Manager] Accediendo a: ${name}`);
    
    const [version] = await secretClient.accessSecretVersion({ name });
    const payload = version.payload.data.toString();
    
    cachedGeminiKey = payload;
    return payload;
  } catch (error) {
    console.error("[Secret Manager Error] No se pudo recuperar GEMINI_API_KEY:", error.message);
    // Si falla el secreto, intentamos usar la env var como último recurso
    return process.env.API_KEY; 
  }
}

/**
 * Configuración de Google Calendar Auth
 */
let googleAuthOptions = {
  scopes: ['https://www.googleapis.com/auth/calendar'],
};

try {
  if (GOOGLE_CREDENTIALS_ENV && (GOOGLE_CREDENTIALS_ENV.startsWith('{') || GOOGLE_CREDENTIALS_ENV.startsWith('['))) {
    googleAuthOptions.credentials = JSON.parse(GOOGLE_CREDENTIALS_ENV);
  } else {
    googleAuthOptions.keyFile = GOOGLE_CREDENTIALS_ENV;
  }
} catch (e) {
  console.error("[Auth Error] Fallo al procesar credenciales de Calendar:", e.message);
}

const auth = new google.auth.GoogleAuth(googleAuthOptions);
const calendar = google.calendar({ version: 'v3', auth });

// Utilidades de tiempo
function getISOTimeRange(fecha, hora) {
  const start = new Date(`${fecha}T${hora}:00-06:00`);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function checkCollision(fecha, hora) {
  const { start, end } = getISOTimeRange(fecha, hora);
  try {
    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: start,
      timeMax: end,
      singleEvents: true,
    });
    return (response.data.items || []).length > 0;
  } catch (error) {
    throw new Error("Error de calendario: " + error.message);
  }
}

async function addEvent(nombre, fecha, hora, telefono) {
  const { start, end } = getISOTimeRange(fecha, hora);
  const event = {
    summary: `Cita Dental: ${nombre}`,
    description: `Paciente: ${nombre}\nTel: ${telefono}`,
    start: { dateTime: start, timeZone: 'America/Mexico_City' },
    end: { dateTime: end, timeZone: 'America/Mexico_City' },
  };
  const res = await calendar.events.insert({ calendarId: CALENDAR_ID, resource: event });
  return res.data;
}

const tools = [{
  functionDeclarations: [
    {
      name: 'verificarDisponibilidad',
      parameters: {
        type: Type.OBJECT,
        properties: {
          fecha: { type: Type.STRING },
          hora: { type: Type.STRING }
        },
        required: ['fecha', 'hora']
      }
    },
    {
      name: 'agendarCita',
      parameters: {
        type: Type.OBJECT,
        properties: {
          nombre: { type: Type.STRING },
          fecha: { type: Type.STRING },
          hora: { type: Type.STRING },
          telefono: { type: Type.STRING }
        },
        required: ['nombre', 'fecha', 'hora', 'telefono']
      }
    }
  ]
}];

// Endpoint de Chat
app.post('/api/chat', async (req, res) => {
  const { message, history = [] } = req.body;

  try {
    // Obtener la llave desde Secret Manager antes de cada interacción (con cache)
    const apiKey = await getGeminiApiKey();
    if (!apiKey) throw new Error("API Key no disponible en Secret Manager");

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: 'gemini-flash-lite-latest',
      contents: [...history, { role: 'user', parts: [{ text: message }] }],
      config: {
        systemInstruction: `Eres "Luz", asistente de la Dra. Osmara. Verifica disponibilidad antes de agendar. Horario L-V 9-18h.`,
        tools
      }
    });

    const candidate = response.candidates?.[0];
    let functionCalls = candidate?.content?.parts?.filter(p => p.functionCall);
    let finalResponseText = response.text;

    if (functionCalls && functionCalls.length > 0) {
      const toolResults = [];
      for (const fc of functionCalls) {
        if (fc.functionCall.name === 'verificarDisponibilidad') {
          const isOccupied = await checkCollision(fc.functionCall.args.fecha, fc.functionCall.args.hora);
          toolResults.push({ name: fc.functionCall.name, response: { status: isOccupied ? 'OCUPADO' : 'DISPONIBLE' } });
        }
        if (fc.functionCall.name === 'agendarCita') {
          const { nombre, fecha, hora, telefono } = fc.functionCall.args;
          const event = await addEvent(nombre, fecha, hora, telefono);
          toolResults.push({ name: fc.functionCall.name, response: { success: true, eventId: event.id } });
        }
      }

      const secondResponse = await ai.models.generateContent({
        model: 'gemini-flash-lite-latest',
        contents: [
          ...history,
          { role: 'user', parts: [{ text: message }] },
          { role: 'model', parts: candidate.content.parts },
          { role: 'user', parts: toolResults.map(tr => ({ functionResponse: tr })) }
        ]
      });
      finalResponseText = secondResponse.text;
    }

    res.json({ text: finalResponseText });
  } catch (error) {
    console.error("[Chat Error]:", error);
    res.status(500).json({ error: "Error en el servicio", details: error.message });
  }
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Servidor iniciado en puerto ${PORT}. Proyecto Cloud: ${PROJECT_ID}`));
