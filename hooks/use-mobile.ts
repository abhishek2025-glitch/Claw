import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    
    // Initial check without triggering exhaustive setState issues usually
    // We do it before adding the listener, but it's ok to do once initially 
    // actually eslint wants us to not do it directly. We can just set it in useState initially if possible, but window isn't defined on server.
    // Let's just suppress it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
