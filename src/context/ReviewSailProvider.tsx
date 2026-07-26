import { createContext, ReactNode } from 'react';
import { useReviewSailCore } from '../hooks/useReviewSailCore';
import { useReviewSailActions } from '../hooks/useReviewSailActions';
import { ReviewSailContextType } from '../types/reviewSail';

export const ReviewSailContext = createContext<ReviewSailContextType | undefined>(undefined);

export const ReviewSailProvider = ({ children }: { children: ReactNode }) => {
  const { state, setState, refreshData, setActiveLocationId } = useReviewSailCore();
  const actions = useReviewSailActions({ state, setState, refreshData });

  const contextValue: ReviewSailContextType = {
    ...state,
    setActiveLocationId,
    refreshData,
    ...actions,
  };

  return (
    <ReviewSailContext.Provider value={contextValue}>
      {children}
    </ReviewSailContext.Provider>
  );
};