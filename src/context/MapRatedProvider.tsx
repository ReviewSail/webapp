import React, { createContext, ReactNode } from 'react';
import { useMapRatedCore } from '../hooks/useMapRatedCore';
import { useMapRatedActions } from '../hooks/useMapRatedActions';
import { MapRatedContextType } from '../types/mapRated';

export const MapRatedContext = createContext<MapRatedContextType | undefined>(undefined);

export const MapRatedProvider = ({ children }: { children: ReactNode }) => {
  const { state, refreshData, setActiveLocationId } = useMapRatedCore();
  const actions = useMapRatedActions({ state, setState: () => {}, refreshData }); // setState is not used directly by actions, but the deps type expects it; we'll adjust.
  
  // Actually, actions need to access `state` and `setState` via the deps. We need to provide them.
  // In useMapRatedCore we return setState; we can pass it.
  // So let's extract setState from useMapRatedCore.
  // We'll modify useMapRatedCore to return setState as well.