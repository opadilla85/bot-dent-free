
export interface Appointment {
  id: string;
  patientName: string;
  date: string;
  time: string;
  phone: string;
  status: 'confirmed' | 'pending';
}

export interface ChatMessage {
  role: 'user' | 'model' | 'system';
  text: string;
}

export enum AppointmentAction {
  SCHEDULE = 'agendarCita',
  CANCEL = 'eliminarCita',
  CHECK = 'verificarDisponibilidad'
}
