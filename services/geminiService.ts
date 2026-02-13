
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { AppointmentAction } from '../types';

// Inicialización siguiendo las directrices de seguridad y SDK
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const agendarCitaTool: FunctionDeclaration = {
  name: AppointmentAction.SCHEDULE,
  parameters: {
    type: Type.OBJECT,
    description: 'Registra una cita en el calendario una vez confirmada la disponibilidad y los datos.',
    properties: {
      nombre: { type: Type.STRING, description: 'Nombre completo del paciente' },
      fecha: { type: Type.STRING, description: 'Fecha sugerida (YYYY-MM-DD)' },
      hora: { type: Type.STRING, description: 'Hora sugerida (HH:MM)' },
      telefono: { type: Type.STRING, description: 'Número de contacto' },
    },
    required: ['nombre', 'fecha', 'hora', 'telefono'],
  },
};

const eliminarCitaTool: FunctionDeclaration = {
  name: AppointmentAction.CANCEL,
  parameters: {
    type: Type.OBJECT,
    description: 'Cancela una cita existente mediante su ID único.',
    properties: {
      id_evento: { type: Type.STRING, description: 'El ID único de la cita' },
    },
    required: ['id_evento'],
  },
};

const verificarTool: FunctionDeclaration = {
  name: AppointmentAction.CHECK,
  parameters: {
    type: Type.OBJECT,
    description: 'Consulta si un bloque de tiempo está libre.',
    properties: {
      fecha: { type: Type.STRING, description: 'Fecha a consultar' },
      hora: { type: Type.STRING, description: 'Hora a consultar' },
    },
    required: ['fecha', 'hora'],
  },
};

export const createDentalChat = () => {
  return ai.chats.create({
    model: 'gemini-flash-lite-latest',
    config: {
      systemInstruction: `Eres "Luz", la asistente virtual experta de la Dra. Osmara Campos Navarro. 
      Tu objetivo es gestionar la agenda dental con calidez humana y precisión técnica.
      
      FLUJO OBLIGATORIO:
      1. Saluda y pregunta el motivo de la consulta.
      2. Para agendar: Pide Nombre, Fecha, Hora y Teléfono.
      3. ANTES de confirmar, ejecuta 'verificarDisponibilidad'.
      4. Si está disponible, confirma los datos con el paciente y luego usa 'agendarCita'.
      5. Si NO está disponible (retorna OCUPADO), discúlpate y ofrece el horario más cercano disponible.
      
      PERSONALIDAD:
      Empática, clara y profesional. No uses tecnicismos médicos a menos que sea necesario.
      Contexto: La clínica abre de Lunes a Viernes (9:00 a 18:00).
      Hoy es ${new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`,
      tools: [{ functionDeclarations: [agendarCitaTool, eliminarCitaTool, verificarTool] }],
    },
  });
};
