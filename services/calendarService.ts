
import { Appointment } from '../types';

/**
 * CalendarService: Actúa como puente hacia la API de Google Calendar.
 * En un despliegue real en Cloud Run, este servicio consultaría al backend de Node.js.
 */
class CalendarService {
  // En producción, este endpoint sería la URL de tu servicio en Cloud Run
  private API_BASE = '/api/calendar'; 

  async checkCollision(date: string, time: string): Promise<boolean> {
    console.log(`[Cerebro IA] Verificando disponibilidad para: ${date} ${time}`);
    
    // Simulación de latencia de red real
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Aquí implementamos la lógica de verificación real que consultaría el backend
    // Por ahora, simulamos una colisión simple para demostrar la capacidad de razonamiento del LLM
    const mockOccupied = ["2024-05-20T10:00", "2024-05-21T15:30"];
    return mockOccupied.includes(`${date}T${time}`);
  }

  async addAppointment(appointment: Omit<Appointment, 'id' | 'status'>): Promise<Appointment> {
    console.log(`[Cerebro IA] Ejecutando inserción en Google Calendar para: ${appointment.patientName}`);
    
    // En un entorno real, aquí se haría un fetch POST al backend
    // const response = await fetch(this.API_BASE, { method: 'POST', body: JSON.stringify(appointment) });
    // return await response.json();

    await new Promise(resolve => setTimeout(resolve, 1200));
    
    return {
      ...appointment,
      id: `gc-${Math.random().toString(36).substr(2, 9)}`,
      status: 'confirmed'
    };
  }

  async removeAppointment(id: string): Promise<boolean> {
    console.log(`[Cerebro IA] Solicitando eliminación de evento: ${id}`);
    await new Promise(resolve => setTimeout(resolve, 500));
    return true;
  }
}

export const calendarService = new CalendarService();
