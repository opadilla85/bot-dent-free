import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from "@google/genai";
import { google } from 'googleapis';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

const secretClient = new SecretManagerServiceClient();

const CALENDAR_ID = process.env.CALENDAR_ID;
const GOOGLE_CREDENTIALS_ENV = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.PROJECT_ID;

let cachedGeminiKey = null;

async function getGeminiApiKey() {
  if (cachedGeminiKey) return cachedGeminiKey;
  try {
    const name = `projects/${PROJECT_ID}/secrets/GEMINI_API_KEY/versions/latest`;
    const [version] = await secretClient.accessSecretVersion({ name });
    cachedGeminiKey = version.payload.data.toString();
    return cachedGeminiKey;
  } catch (error) {
    console.error("[Secret Manager Error]:", error.message);
    return process.env.API_KEY; 
  }
}

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
  console.error("[Auth Error]:", e.message);
}

const auth = new google.auth.GoogleAuth(googleAuthOptions);
const calendar = google.calendar({ version: 'v3', auth });

// --- Lógica de Negocio ---

function getISOTimeRange(fecha, hora) {
  const start = new Date(`${fecha}T${hora}:00-06:00`);
  const end = new Date(start.getTime() + 60 * 60 * 1000); 
  return { start: start.toISOString(), end: end.toISOString() };
}

async function checkCollision(fecha, hora) {
  const { start, end } = getISOTimeRange(fecha, hora);
  const response = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: start,
    timeMax: end,
    singleEvents: true,
  });
  return (response.data.items || []).length > 0;
}

async function addEvent(nombre, fecha, hora, telefono) {
  const { start, end } = getISOTimeRange(fecha, hora);
  const event = {
    summary: `Cita Dental: ${nombre}`,
    description: `Paciente: ${nombre}\nTeléfono: ${telefono}\nAgendado vía Luz (IA)`,
    start: { dateTime: start, timeZone: 'America/Mexico_City' },
    end: { dateTime: end, timeZone: 'America/Mexico_City' },
  };
  const res = await calendar.events.insert({ calendarId: CALENDAR_ID, resource: event });
  return res.data;
}

// --- Endpoints ---

app.get('/api/calendar/availability', async (req, res) => {
  const { fecha, hora } = req.query;
  try {
    const busy = await checkCollision(fecha, hora);
    res.json({ busy });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/calendar/appointments', async (req, res) => {
  const { patientName, date, time, phone } = req.body;
  try {
    const isBusy = await checkCollision(date, time);
    if (isBusy) return res.status(409).json({ error: "Horario ya ocupado" });
    const event = await addEvent(patientName, date, time, phone);
    res.json({ id: event.id, status: 'confirmed', ...req.body });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Chat con Gemini ---

const tools = [{
  functionDeclarations: [
    {
      name: 'verificarDisponibilidad',
      parameters: {
        type: Type.OBJECT,
        properties: {
          fecha: { type: Type.STRING, description: 'Formato YYYY-MM-DD' },
          hora: { type: Type.STRING, description: 'Formato HH:MM' }
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

app.post('/api/chat', async (req, res) => {
  const { message, history = [] } = req.body;
  
  try {
    const apiKey = await getGeminiApiKey();
    const ai = new GoogleGenAI({ apiKey });
    
    // Mapeamos el historial del frontend al formato oficial del SDK de Gemini
    const contents = history.map(msg => ({
      role: msg.role === 'model' ? 'model' : 'user',
      parts: [{ text: msg.text }]
    }));

    // Agregamos el mensaje actual del usuario
    contents.push({ role: 'user', parts: [{ text: message }] });

    const requestConfig = {
      model: 'gemini-3-flash-preview',
      contents,
      config: {
        systemInstruction: `Eres "Luz", asistente dental de la Dra. Osmara. 
        - Mantén el contexto: Si el usuario ya te dio su nombre o fecha, no la pidas de nuevo.
        - Usa 'verificarDisponibilidad' antes de agendar.
        - Hoy es ${new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.`,
        tools
      }
    };

    let response = await ai.models.generateContent(requestConfig);
    let candidate = response.candidates?.[0];
    let parts = candidate.content.parts;
    let functionCalls = parts.filter(p => p.functionCall);

    // Manejo de llamadas a funciones (Herramientas)
    if (functionCalls.length > 0) {
      const toolResults = [];
      for (const fc of functionCalls) {
        if (fc.functionCall.name === 'verificarDisponibilidad') {
          const busy = await checkCollision(fc.functionCall.args.fecha, fc.functionCall.args.hora);
          toolResults.push({ name: fc.functionCall.name, response: { status: busy ? 'OCUPADO' : 'DISPONIBLE' } });
        }
        if (fc.functionCall.name === 'agendarCita') {
          const { nombre, fecha, hora, telefono } = fc.functionCall.args;
          const event = await addEvent(nombre, fecha, hora, telefono);
          toolResults.push({ name: fc.functionCall.name, response: { success: true, eventId: event.id } });
        }
      }

      // Enviamos resultados de las herramientas de vuelta a Gemini para respuesta final
      const secondResponse = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          ...contents,
          { role: 'model', parts: parts },
          { role: 'user', parts: toolResults.map(tr => ({ functionResponse: tr })) }
        ]
      });
      return res.json({ text: secondResponse.text });
    }

    // Si no hubo herramientas, respondemos directamente con el texto generado
    res.json({ text: response.text });
    
  } catch (error) {
    console.error("[Chat API Error]:", error);
    res.status(500).json({ error: "Error de orquestación en el asistente" });
  }
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Backend activo en puerto ${PORT}`));
