import { useRef } from 'react'
import { Printer, Download } from 'lucide-react'
import { Modal } from './Modal'

interface DocumentPreviewModalProps {
  open: boolean
  onClose: () => void
  title: string
  html: string
  filename: string
}

export function DocumentPreviewModal({ open, onClose, title, html, filename }: DocumentPreviewModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const handlePrint = () => {
    iframeRef.current?.contentWindow?.print()
  }

  const handleDownload = () => {
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="xl">
      <div className="space-y-3">
        <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50" style={{ height: '65vh' }}>
          <iframe ref={iframeRef} srcDoc={html} title={title} className="w-full h-full bg-white" />
        </div>
        <div className="flex gap-2">
          <button onClick={handlePrint} className="flex-1 btn-secondary justify-center py-2.5 gap-2">
            <Printer size={16} /> Imprimir
          </button>
          <button onClick={handleDownload} className="flex-1 btn-primary justify-center py-2.5 gap-2">
            <Download size={16} /> Descargar
          </button>
        </div>
      </div>
    </Modal>
  )
}
