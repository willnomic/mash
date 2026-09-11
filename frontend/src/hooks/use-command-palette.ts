import { useEffect, useState } from 'react'

// Ctrl+K (Cmd+K no Mac) abre/fecha. Não tenta sobrescrever Ctrl+N/
// Ctrl+T/Ctrl+W (o navegador não deixa, D-022/item 10) — só "k" é
// interceptado, e só com o modificador certo.
export function useCommandPaletteState() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return { open, setOpen }
}
