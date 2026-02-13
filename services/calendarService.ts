import { Appointment } from '../types';

/**
 * CalendarService: Conecta el frontend con la API de Google Calendar a través de nuestro backend.
 */
class CalendarService {
  private API_BASE = '/api/calendar'; 

  async checkCollision(date: string, time: string): Promise<boolean> {
    try {
      const params = new URLSearchParams({ fecha: date, hora: time });
      const response = await fetch(`${this.API_BASE}/availability?${params}`);
      
      if (!response.ok) throw new Error('Error al consultar disponibilidad');
      
      const data = await response.json();
      return data.busy; // El backend responde { busy: true/false }
    } catch (error) {
      console.error("[CalendarService] Error:", error);
      return true; // Por seguridad, si falla, asumimos ocupado
    }
  }

  async addAppointment(appointment: Omit<Appointment, 'id' | 'status'>): Promise<Appointment> {
    try {
      const response = await fetch(`${this.API_BASE}/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appointment)
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.details || 'Error al agendar cita');
      }

      return await response.json();
    } catch (error) {
      console.error("[CalendarService] Error al insertar:", error);
      throw error;
    }
  }

  async removeAppointment(id: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.API_BASE}/appointments/${id}`, {
        method: 'DELETE'
      });
      return response.ok;
    } catch (error) {
      console.error("[CalendarService] Error al eliminar:", error);
      return false;
    }
  }
}

export const calendarService = new CalendarService();
