import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, getErrorMessage } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { CheckCircle2 } from 'lucide-react'

const BUSINESS_TYPES = [
  { value: 'Retail', label: 'Tienda / Retail', icon: '🏪' },
  { value: 'Food', label: 'Comida / Restaurante', icon: '🍽️' },
  { value: 'Services', label: 'Servicios', icon: '🔧' },
  { value: 'Wholesale', label: 'Mayorista', icon: '📦' },
  { value: 'Other', label: 'Otro', icon: '💼' },
]

const CURRENCIES = [
  { value: 'DOP', label: 'Peso Dominicano', symbol: 'RD$' },
  { value: 'USD', label: 'Dólar Americano', symbol: '$' },
  { value: 'EUR', label: 'Euro', symbol: '€' },
  { value: 'MXN', label: 'Peso Mexicano', symbol: '$' },
  { value: 'COP', label: 'Peso Colombiano', symbol: '$' },
]

export function Onboarding() {
  const navigate = useNavigate()
  const { user, business, setAuth, token, businesses } = useAuthStore()
  const [step, setStep] = useState(1)
  const [type, setType] = useState('')
  const [currency, setCurrency] = useState('DOP')
  const [productName, setProductName] = useState('')
  const [productPrice, setProductPrice] = useState('')
  const [productQty, setProductQty] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!token || !business) {
    navigate('/login', { replace: true })
    return null
  }

  const handleFinish = async () => {
    setLoading(true)
    setError('')
    try {
      // Save business type and currency
      await api.put(`/businesses/${business.id}`, { type, currency })

      // Create first product if provided
      if (productName && productPrice) {
        await api.post(`/businesses/${business.id}/products`, {
          name: productName,
          price: parseFloat(productPrice),
          quantity: parseInt(productQty) || 0,
          cost: 0,
        })
      }

      // Mark onboarding complete
      await api.post('/auth/complete-onboarding')

      // Update local user
      if (user) {
        setAuth(token, { ...user, onboardingCompleted: true }, businesses)
      }

      navigate('/', { replace: true })
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4">
            <span className="text-white font-bold text-2xl">V</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">¡Bienvenido a Vendix!</h1>
          <p className="text-gray-500 text-sm mt-1">Configura tu negocio en 3 pasos rápidos</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                s < step ? 'bg-green-500 text-white' :
                s === step ? 'bg-blue-600 text-white' :
                'bg-gray-200 text-gray-400'
              }`}>
                {s < step ? <CheckCircle2 size={16} /> : s}
              </div>
              {s < 3 && <div className={`w-12 h-0.5 ${s < step ? 'bg-green-400' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        <div className="card p-6">
          {/* Step 1: Business Type */}
          {step === 1 && (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">¿Qué tipo de negocio tienes?</h2>
              <p className="text-gray-500 text-sm mb-5">Esto nos ayuda a personalizar tu experiencia.</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {BUSINESS_TYPES.map(bt => (
                  <button
                    key={bt.value}
                    onClick={() => setType(bt.value)}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                      type === bt.value
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className="text-2xl">{bt.icon}</span>
                    <span className="font-medium text-gray-800 text-sm">{bt.label}</span>
                  </button>
                ))}
              </div>
              <button
                className="btn-primary w-full justify-center mt-6 py-2.5"
                disabled={!type}
                onClick={() => setStep(2)}
              >
                Continuar
              </button>
            </>
          )}

          {/* Step 2: Currency */}
          {step === 2 && (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">¿Cuál es tu moneda?</h2>
              <p className="text-gray-500 text-sm mb-5">La usaremos para mostrar los precios.</p>
              <div className="space-y-2">
                {CURRENCIES.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setCurrency(c.value)}
                    className={`flex items-center justify-between w-full p-3 rounded-xl border-2 text-left transition-all ${
                      currency === c.value
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className="font-medium text-gray-800 text-sm">{c.label}</span>
                    <span className="text-gray-500 font-mono text-sm">{c.symbol} ({c.value})</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-3 mt-6">
                <button className="btn-secondary flex-1 justify-center py-2.5" onClick={() => setStep(1)}>Atrás</button>
                <button className="btn-primary flex-1 justify-center py-2.5" onClick={() => setStep(3)}>Continuar</button>
              </div>
            </>
          )}

          {/* Step 3: First Product */}
          {step === 3 && (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Agrega tu primer producto</h2>
              <p className="text-gray-500 text-sm mb-5">Opcional — puedes saltarte esto y hacerlo después.</p>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="label">Nombre del producto</label>
                  <input
                    type="text"
                    value={productName}
                    onChange={e => setProductName(e.target.value)}
                    className="input"
                    placeholder="Ej: Coca-Cola 2L"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Precio de venta</label>
                    <input
                      type="number"
                      value={productPrice}
                      onChange={e => setProductPrice(e.target.value)}
                      className="input"
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label className="label">Cantidad en stock</label>
                    <input
                      type="number"
                      value={productQty}
                      onChange={e => setProductQty(e.target.value)}
                      className="input"
                      placeholder="0"
                      min="0"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button className="btn-secondary flex-1 justify-center py-2.5" onClick={() => setStep(2)}>Atrás</button>
                <button
                  className="btn-primary flex-1 justify-center py-2.5"
                  disabled={loading}
                  onClick={handleFinish}
                >
                  {loading ? 'Guardando...' : '¡Empezar!'}
                </button>
              </div>
              <button
                className="w-full text-center text-sm text-gray-400 hover:text-gray-600 mt-3"
                onClick={handleFinish}
                disabled={loading}
              >
                Saltar por ahora
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
