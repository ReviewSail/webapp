import { createContext, ReactNode } from 'react';
import { useMapRatedCore } from '../hooks/useMapRatedCore';
import { useMapRatedActions } from '../hooks/useMapRatedActions';
import { MapRatedContextType } from '../types/mapRated';

export const MapRatedContext = createContext<MapRatedContextType | undefined>(undefined);

export const MapRatedProvider = ({ children }: { children: ReactNode }) => {
  const { state, setState, refreshData, setActiveLocationId } = useMapRatedCore();
  const actions = useMapRatedActions({ state, setState, refreshData });

  const contextValue: MapRatedContextType = {
    ...state,
    setActiveLocationId,
    refreshData,
    ...actions,
  };

  return (
    <MapRatedContext.Provider value={contextValue}>
      {children}
    </MapRatedContext.Provider>
  );
};
