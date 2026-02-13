import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, Stethoscope, Clock, MapPin, Phone, MessageSquare, 
  Sparkles, Info, Menu, X, CalendarCheck, ShieldCheck 
} from 'lucide-react';

const App: React.FC = () => {
  const [messages, setMessages] = useState<{role: string, text: string}[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Inicializamos con el mensaje de bienvenida de Luz
    setMessages([{ role: 'model', text: '¡Hola! Soy Luz, asistente de la Dra. Osmara. ¿Cómo podemos ayudarte hoy con tu sonrisa?' }]);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    const userText = input.trim();
    const currentMessages = [...messages, { role: 'user', text: userText }];
    
    setInput('');
    setMessages(currentMessages);
    setIsLoading(true);

    try {
      // Enviamos tanto el mensaje actual como el historial acumulado
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: userText,
          history: messages // El backend recibirá los mensajes previos para el contexto
        })
      });

      if (!response.ok) throw new Error('Error en la respuesta del servidor');
      
      const data = await response.json();
      setMessages(prev => [...prev, { role: 'model', text: data.text }]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, { role: 'model', text: 'Lo siento, tuve un problema de conexión. ¿Podrías repetir eso?' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-white border-r transform transition-transform lg:relative lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full p-6">
          <div className="flex items-center gap-3 mb-10">
            <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600"><Stethoscope size={24} /></div>
            <div>
              <h1 className="font-bold text-slate-800">Dra. Osmara</h1>
              <p className="text-[10px] text-emerald-600 font-bold uppercase">Clínica Dental</p>
            </div>
          </div>
          <div className="space-y-6 flex-1">
             <div className="flex gap-3 text-xs text-slate-600"><MapPin size={16} className="text-emerald-500" /> Av. Reforma 405, CDMX</div>
             <div className="flex gap-3 text-xs text-slate-600"><Clock size={16} className="text-emerald-500" /> Lun-Vie: 9am - 6pm</div>
             <div className="flex gap-3 text-xs text-slate-600"><Phone size={16} className="text-emerald-500" /> +52 55 9876 5432</div>
          </div>
          <div className="p-4 bg-slate-900 rounded-xl text-[10px] text-slate-400">
            <div className="flex items-center gap-2 mb-2 text-emerald-400"><ShieldCheck size={14} /> SEGURIDAD ACTIVA</div>
            Sincronización real con Google Calendar.
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col bg-white relative">
        <header className="px-6 py-4 border-b flex items-center justify-between">
          <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2"><Menu /></button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-white"><MessageSquare size={20} /></div>
            <span className="font-bold text-sm">Chat con Luz</span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-10 space-y-6 bg-slate-50/50">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`p-4 rounded-2xl max-w-[85%] text-sm shadow-sm ${m.role === 'user' ? 'bg-emerald-600 text-white' : 'bg-white border text-slate-700'}`}>
                  {m.text}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border p-4 rounded-2xl shadow-sm italic text-xs text-slate-400 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce"></div>
                  Luz está escribiendo...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>

        <div className="p-4 border-t bg-white">
          <div className="max-w-3xl mx-auto flex gap-2">
            <input 
              className="flex-1 bg-slate-100 border-none rounded-xl px-5 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="Escribe tu mensaje (ej: Quiero una cita para mañana)"
              disabled={isLoading}
            />
            <button 
              onClick={handleSend} 
              disabled={isLoading || !input.trim()}
              className={`p-3 rounded-xl transition-colors ${isLoading || !input.trim() ? 'bg-slate-200 text-slate-400' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
