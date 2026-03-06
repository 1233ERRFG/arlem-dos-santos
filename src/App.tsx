import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { 
  QrCode, 
  MessageSquare, 
  Users, 
  LayoutDashboard,
  Settings,
  LogOut,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const socket = io();

export default function App() {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connecting');
  const [stats, setStats] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'settings'>('dashboard');
  const [settings, setSettings] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [loadingTime, setLoadingTime] = useState(0);

  useEffect(() => {
    socket.on('qr', (qr) => {
      setQrCode(qr);
      setStatus('disconnected');
    });

    socket.on('status', (newStatus) => {
      setStatus(newStatus);
      if (newStatus === 'connected') setQrCode(null);
    });

    socket.on('new_message', () => fetchStats());

    fetchStats();
    fetchSettings();
    
    const interval = setInterval(() => {
      if (status !== 'connected' && !qrCode) {
        setLoadingTime(prev => prev + 1);
      } else {
        setLoadingTime(0);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [status, qrCode]);

  const fetchStats = async () => {
    try {
      const { data } = await axios.get('/api/stats');
      setStats(data);
    } catch (e) {
      console.error('Error fetching stats:', e);
    }
  };

  const fetchSettings = async () => {
    try {
      const { data } = await axios.get('/api/settings');
      setSettings(data);
    } catch (e) {
      console.error('Error fetching settings:', e);
    }
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      await axios.post('/api/settings', settings);
      alert('Configurações salvas com sucesso!');
    } catch (e) {
      alert('Erro ao salvar configurações.');
    } finally {
      setIsSaving(false);
    }
  };

  const resetConnection = async () => {
    if (!confirm('Reiniciar conexão?')) return;
    try {
      await axios.post('/api/reset');
      window.location.reload();
    } catch (e) {
      console.error('Error resetting connection:', e);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-6 flex items-center gap-2 text-emerald-600 font-bold text-xl">
          <MessageSquare size={24} />
          <span>ZapFlow AI</span>
        </div>
        
        <nav className="flex-1 px-4 space-y-2">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${activeTab === 'dashboard' ? 'bg-emerald-50 text-emerald-600' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <LayoutDashboard size={20} />
            Dashboard
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${activeTab === 'settings' ? 'bg-emerald-50 text-emerald-600' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <Settings size={20} />
            Configurações
          </button>
        </nav>

        <div className="p-4 border-t border-slate-100">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider ${status === 'connected' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
            <div className={`w-2 h-2 rounded-full animate-pulse ${status === 'connected' ? 'bg-emerald-500' : 'bg-red-500'}`} />
            {status === 'connected' ? 'Conectado' : 'Desconectado'}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' ? (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="bg-blue-100 p-3 rounded-2xl text-blue-600"><MessageSquare /></div>
                    <span className="text-slate-500 font-medium">Mensagens</span>
                  </div>
                  <div className="text-3xl font-bold">{stats?.totalMessages || 0}</div>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="bg-emerald-100 p-3 rounded-2xl text-emerald-600"><Users /></div>
                    <span className="text-slate-500 font-medium">Leads</span>
                  </div>
                  <div className="text-3xl font-bold">{stats?.totalLeads || 0}</div>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-center items-center text-center min-h-[200px]">
                  {status === 'connected' ? (
                    <div className="text-emerald-500 flex flex-col items-center gap-2">
                      <CheckCircle2 size={48} className="mb-2" />
                      <span className="font-bold text-lg">WhatsApp Ativo</span>
                      <span className="text-xs text-slate-400">Pronto para automatizar</span>
                    </div>
                  ) : qrCode ? (
                    <div className="flex flex-col items-center gap-4">
                      <div className="p-2 bg-white border-4 border-slate-50 rounded-2xl shadow-inner">
                        <img src={qrCode} alt="QR" className="w-40 h-40" />
                      </div>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest animate-pulse">Escaneie para conectar</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4 text-slate-400">
                      <div className="relative">
                        <div className="animate-spin rounded-full h-12 w-12 border-4 border-slate-100 border-t-emerald-500" />
                        <QrCode className="absolute inset-0 m-auto text-slate-200" size={20} />
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs font-bold uppercase block">Gerando QR Code...</span>
                        <span className="text-[10px] text-slate-300 block">Isso pode levar até 30 segundos</span>
                      </div>
                      <motion.button 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        onClick={resetConnection} 
                        className="mt-2 px-4 py-2 bg-slate-100 text-slate-500 text-[10px] font-bold uppercase rounded-full border border-slate-200 hover:bg-slate-200 transition-all"
                      >
                        Forçar Novo QR
                      </motion.button>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-50 flex justify-between items-center">
                  <span className="font-bold">Interações Recentes</span>
                  <button 
                    onClick={async () => {
                      if(confirm('Limpar todo o histórico de mensagens?')) {
                        await axios.post('/api/clear-history');
                        fetchStats();
                      }
                    }}
                    className="text-[10px] font-bold text-red-400 uppercase hover:text-red-600 transition-colors"
                  >
                    Limpar Histórico
                  </button>
                </div>
                <div className="divide-y divide-slate-50">
                  {stats?.recentMessages.map((msg: any) => (
                    <div key={msg.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${msg.fromMe ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-600'}`}>
                          {msg.pushName[0]}
                        </div>
                        <div>
                          <div className="font-bold text-sm">{msg.pushName}</div>
                          <div className="text-xs text-slate-500 truncate max-w-md">{msg.text}</div>
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase">
                        {new Date(msg.timestamp * 1000).toLocaleTimeString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-2xl space-y-6"
            >
              {!settings ? (
                <div className="bg-white p-12 rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center justify-center gap-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-200 border-t-emerald-500" />
                  <span className="text-xs font-bold text-slate-400 uppercase">Carregando configurações...</span>
                </div>
              ) : (
                <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
                  <h2 className="text-xl font-bold">Configurações da IA</h2>
                  
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">Instruções do Sistema (Comportamento da IA)</label>
                    <textarea 
                      className="w-full h-64 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-emerald-500 transition-all resize-none"
                      placeholder="Digite aqui como a IA deve se comportar..."
                      value={settings?.system_instruction || ''}
                      onChange={(e) => setSettings((prev: any) => ({...prev, system_instruction: e.target.value}))}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <label className="text-xs font-bold text-slate-400 uppercase block">Automação</label>
                      <div className="space-y-3">
                        <label className="flex items-center gap-3 cursor-pointer group">
                          <div className="relative">
                            <input 
                              type="checkbox" 
                              className="sr-only peer"
                              checked={settings?.ignore_groups === 'true'}
                              onChange={(e) => setSettings((prev: any) => ({...prev, ignore_groups: e.target.checked ? 'true' : 'false'}))}
                            />
                            <div className="w-10 h-6 bg-slate-200 rounded-full peer peer-checked:bg-emerald-500 transition-all"></div>
                            <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full peer-checked:translate-x-4 transition-all"></div>
                          </div>
                          <span className="text-sm font-medium text-slate-600 group-hover:text-slate-900">Ignorar Grupos</span>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer group">
                          <div className="relative">
                            <input 
                              type="checkbox" 
                              className="sr-only peer"
                              checked={settings?.ignore_status === 'true'}
                              onChange={(e) => setSettings((prev: any) => ({...prev, ignore_status: e.target.checked ? 'true' : 'false'}))}
                            />
                            <div className="w-10 h-6 bg-slate-200 rounded-full peer peer-checked:bg-emerald-500 transition-all"></div>
                            <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full peer-checked:translate-x-4 transition-all"></div>
                          </div>
                          <span className="text-sm font-medium text-slate-600 group-hover:text-slate-900">Ignorar Status</span>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer group">
                          <div className="relative">
                            <input 
                              type="checkbox" 
                              className="sr-only peer"
                              checked={settings?.auto_read === 'true'}
                              onChange={(e) => setSettings((prev: any) => ({...prev, auto_read: e.target.checked ? 'true' : 'false'}))}
                            />
                            <div className="w-10 h-6 bg-slate-200 rounded-full peer peer-checked:bg-emerald-500 transition-all"></div>
                            <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full peer-checked:translate-x-4 transition-all"></div>
                          </div>
                          <span className="text-sm font-medium text-slate-600 group-hover:text-slate-900">Marcar como lida</span>
                        </label>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <label className="text-xs font-bold text-slate-400 uppercase block">Inteligência</label>
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Modelo</label>
                          <select 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                            value={settings?.model || 'gemini-3-flash-preview'}
                            onChange={(e) => setSettings((prev: any) => ({...prev, model: e.target.value}))}
                          >
                            <option value="gemini-3-flash-preview">Gemini 3 Flash (Rápido)</option>
                            <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Complexo)</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Criatividade ({settings?.temperature})</label>
                          <input 
                            type="range" step="0.1" min="0" max="1"
                            className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                            value={settings?.temperature || '0.7'}
                            onChange={(e) => setSettings((prev: any) => ({...prev, temperature: e.target.value}))}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={saveSettings}
                    disabled={isSaving}
                    className="w-full bg-emerald-600 text-white font-bold py-4 rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>Salvar Alterações</>
                    )}
                  </button>

                  <button 
                    onClick={resetConnection}
                    className="w-full text-slate-400 font-bold text-xs uppercase tracking-widest hover:text-red-500 transition-colors"
                  >
                    Reiniciar Conexão WhatsApp
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
