import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ConfirmDialog, useConfirm } from '../ConfirmDialog'

function TestComponent({ onResult }: { onResult: (v: boolean) => void }) {
  const { confirm, dialog } = useConfirm()
  return (
    <div>
      <button onClick={() => { confirm('¿Eliminar?', 'Esta acción no se puede deshacer', true).then(onResult) }}>
        trigger
      </button>
      {dialog}
    </div>
  )
}

describe('ConfirmDialog', () => {
  it('no renderiza nada cuando open es false', () => {
    const { container } = render(
      <ConfirmDialog
        open={false}
        title="Eliminar"
        message="¿Seguro?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('muestra el título y el mensaje cuando open es true', () => {
    render(
      <ConfirmDialog
        open
        title="Eliminar producto"
        message="Esta acción no se puede deshacer"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByText('Eliminar producto')).toBeInTheDocument()
    expect(screen.getByText('Esta acción no se puede deshacer')).toBeInTheDocument()
  })

  it('llama a onConfirm al hacer click en confirmar', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        open
        title="Eliminar"
        message="¿Seguro?"
        confirmLabel="Sí, eliminar"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText('Sí, eliminar'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('llama a onCancel al hacer click en cancelar', () => {
    const onCancel = vi.fn()
    render(
      <ConfirmDialog
        open
        title="Eliminar"
        message="¿Seguro?"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    )

    fireEvent.click(screen.getByText('Cancelar'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

describe('useConfirm', () => {
  it('resuelve a true cuando el usuario confirma', async () => {
    const onResult = vi.fn()
    render(<TestComponent onResult={onResult} />)

    fireEvent.click(screen.getByText('trigger'))
    await waitFor(() => expect(screen.getByText('¿Eliminar?')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Sí, eliminar'))
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true))
  })

  it('resuelve a false cuando el usuario cancela', async () => {
    const onResult = vi.fn()
    render(<TestComponent onResult={onResult} />)

    fireEvent.click(screen.getByText('trigger'))
    await waitFor(() => expect(screen.getByText('¿Eliminar?')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Cancelar'))
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false))
  })
})
