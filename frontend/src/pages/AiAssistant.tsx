import { useState, useRef, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { PageHeader } from '@/components/ui/PageHeader'
import { Bot, Send, Settings, ChevronDown, ChevronUp, Sparkles, User, Loader2, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

interface Message { role: 'user' | 'assistant'; content: string }
interface AiSettings { provider: string; model: string; hasApiKey: boolean }

const PROVIDERS = [
  { value: 'groq', label: 'Groq (Llama 3)', placeholder: 'gsk_...' },
  { value: 'openai', label: 'OpenAI (GPT)', placeholder: 'sk-...' },
  { value: 'openrouter', label: 'OpenRouter', placeholder: 'sk-or-...' },
  { value: 'xai', label: 'xAI (Grok)', placeholder: 'xai-...' },
]

const DEFAULT_PROMPTS = [
  '¿Cuánto vendí hoy?',
  '¿Cuáles son mis productos más vendidos este mes?',
  '¿Cuánto ITBIS recaudé este mes?',
  '¿Cuántas deudas pendientes tengo?',
  'Dame un resumen del negocio',
]

export function AiAssistant() {
  const { business } = useAuthStore()
  const bid = business!.id
  const queryClient = useQueryClient()

  const { data: settings } = useQuery<AiSettings>({
    queryKey: ['ai-settings', bid],
    queryFn: () => api.get(`/businesses/${bid}/ai/settings`).then(r => r.data),
  })

  const [apiKeyInput, setApiKeyInput] = useState('')
  const [provider, setProvider] = useState('groq')
  const [model, setModel] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Sincroniza el formulario con la configuración del backend cuando llega/cambia.
  useEffect(() => {
    if (!settings) return
    setProvider(settings.provider)
    setModel(settings.model)
    setSettingsOpen(!settings.hasApiKey)
  }, [settings])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const saveSettingsMutation = useMutation({
    mutationFn: (data: { apiKey?: string; provider: string; model: string }) =>
      api.put(`/businesses/${bid}/ai/settings`, data),
    onSuccess: () => {
      setApiKeyInput('')
      queryClient.invalidateQueries({ queryKey: ['ai-settings', bid] })
      setSettingsOpen(false)
      toast.success('Configuración guardada')
    },
    onError: () => toast.error('No se pudo guardar la configuración'),
  })

  const saveSettings = () => {
    saveSettingsMutation.mutate({
      ...(apiKeyInput.trim() ? { apiKey: apiKeyInput.trim() } : {}),
      provider,
      model: model.trim(),
    })
  }

  const removeApiKey = () => {
    saveSettingsMutation.mutate({ apiKey: '', provider, model: model.trim() })
  }

  const chatMutation = useMutation({
    mutationFn: (message: string) =>
      api.post(`/businesses/${bid}/ai/chat`, { message }).then(r => r.data as { reply: string }),
    onSuccess: ({ reply }) => {
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string; detail?: string } } })?.response?.data?.error
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${msg || 'No se pudo conectar con el asistente.'}` }])
    },
  })

  const hasApiKey = !!settings?.hasApiKey

  const sendMessage = (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg) return
    if (!hasApiKey) {
      setSettingsOpen(true)
      toast.error('Configura tu API key primero')
      return
    }
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setInput('')
    chatMutation.mutate(msg)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const selectedProvider = PROVIDERS.find(p => p.value === provider)

  return (
    <div className="animate-fade-in flex flex-col h-full">
      <PageHeader
        title="Asistente IA"
        subtitle="Consulta datos de tu negocio con lenguaje natural"
        icon={<Sparkles size={18} className="text-violet-500" />}
      />

      <div className="flex-1 flex flex-col px-6 pb-6 gap-4 min-h-0">
        {/* Settings panel */}
        <div className="card overflow-hidden">
          <button
            onClick={() => setSettingsOpen(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Settings size={15} className="text-gray-400" />
              Configuración del proveedor de IA
              {hasApiKey && <span className="badge text-green-700 bg-green-50 ml-2">Configurado</span>}
            </div>
            {settingsOpen ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
          </button>

          {settingsOpen && (
            <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 flex gap-2">
                <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                <span>Tu API key se guarda cifrada en el servidor local de Vendix y nunca se muestra de nuevo en pantalla.</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Proveedor</label>
                  <select
                    value={provider}
                    onChange={e => setProvider(e.target.value)}
                    className="input w-full"
                  >
                    {PROVIDERS.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    API Key — {selectedProvider?.label}
                  </label>
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={e => setApiKeyInput(e.target.value)}
                    placeholder={hasApiKey ? '••••••••••••••••••• (sin cambios)' : selectedProvider?.placeholder}
                    className="input w-full font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Modelo <span className="text-gray-400">(opcional)</span>
                  </label>
                  <input
                    value={model}
                    onChange={e => setModel(e.target.value)}
                    placeholder="Dejar vacío para usar el predeterminado"
                    className="input w-full text-xs"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={saveSettings} disabled={saveSettingsMutation.isPending} className="btn-primary disabled:opacity-50">
                  Guardar configuración
                </button>
                {hasApiKey && (
                  <button onClick={removeApiKey} disabled={saveSettingsMutation.isPending} className="btn-ghost text-red-500 hover:bg-red-50 disabled:opacity-50">
                    Quitar API key
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col card overflow-hidden min-h-0">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center py-8">
                <div className="w-16 h-16 bg-violet-100 rounded-2xl flex items-center justify-center mb-4">
                  <Bot size={32} className="text-violet-500" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">Asistente de negocios IA</h3>
                <p className="text-gray-500 text-sm mb-6 max-w-xs">
                  Pregúntame cualquier cosa sobre tus ventas, productos, finanzas o tendencias.
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {DEFAULT_PROMPTS.map(p => (
                    <button
                      key={p}
                      onClick={() => sendMessage(p)}
                      disabled={!hasApiKey || chatMutation.isPending}
                      className="px-3 py-1.5 rounded-xl border border-violet-200 bg-violet-50 text-violet-700 text-sm hover:bg-violet-100 transition-colors disabled:opacity-50"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center ${msg.role === 'user' ? 'bg-indigo-500' : 'bg-violet-500'}`}>
                  {msg.role === 'user'
                    ? <User size={14} className="text-white" />
                    : <Bot size={14} className="text-white" />
                  }
                </div>
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-tr-sm'
                    : 'bg-gray-100 text-gray-900 rounded-tl-sm'
                }`}>
                  {msg.content.split('\n').map((line, j) => (
                    <p key={j} className={j > 0 ? 'mt-1' : ''}>{line}</p>
                  ))}
                </div>
              </div>
            ))}

            {chatMutation.isPending && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-xl bg-violet-500 flex-shrink-0 flex items-center justify-center">
                  <Bot size={14} className="text-white" />
                </div>
                <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2 text-gray-500">
                  <Loader2 size={14} className="animate-spin" />
                  <span className="text-sm">Analizando tus datos...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-100 p-3 flex gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={hasApiKey ? 'Pregúntame algo sobre tu negocio… (Enter para enviar)' : 'Configura tu API key arriba para empezar'}
              disabled={!hasApiKey || chatMutation.isPending}
              rows={1}
              className="flex-1 input resize-none leading-relaxed disabled:opacity-50"
              style={{ minHeight: '42px', maxHeight: '120px' }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || !hasApiKey || chatMutation.isPending}
              className="btn-primary px-3 flex-shrink-0 disabled:opacity-50"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
