import * as React from "react"

const MOBILE_BREAKPOINT = 768

/** Tailwind `lg`. Abaixo disto (celular e tablet) as colunas laterais viram drawer. */
export const LG_BREAKPOINT = 1024

/**
 * True quando a janela é mais estreita que `breakpoint`. Começa como `false`
 * no primeiro render (não há janela até o efeito rodar), então quem precisa
 * decidir algo NO MOUNT deve olhar `window.innerWidth` diretamente.
 */
function useIsBelow(breakpoint: number) {
  const [below, setBelow] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const onChange = () => {
      setBelow(window.innerWidth < breakpoint)
    }
    mql.addEventListener("change", onChange)
    setBelow(window.innerWidth < breakpoint)
    return () => mql.removeEventListener("change", onChange)
  }, [breakpoint])

  return !!below
}

/** Celular: abaixo de `md` (768px). */
export function useIsMobile() {
  return useIsBelow(MOBILE_BREAKPOINT)
}

/** Celular e tablet: abaixo de `lg` (1024px). */
export function useIsBelowLg() {
  return useIsBelow(LG_BREAKPOINT)
}
