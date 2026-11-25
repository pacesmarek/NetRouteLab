import { createContext } from 'react';

/** Právě běžící test (`ping`, `trace`, `in:<id zařízení>`) nebo `null`. Tlačítka podle něj ukazují spinner. */
export const RunningContext = createContext<string | null>(null);
