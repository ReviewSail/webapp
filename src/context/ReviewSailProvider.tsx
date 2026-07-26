import { createContext, ReactNode } from 'react';
import { useReviewSailCore } from '../hooks/useReviewSailCore';
import { useReviewSailActions } from '../hooks/useReviewSailActions';
import { ReviewSailContextType } from '../types/reviewSail';

export const ReviewSailContext = createContext<ReviewSailContextType | undefined>(undefined);

export const ReviewSailProvider = ({ children }: { children: ReactNode }) => {
  const { state, setState, refreshData, setActiveLocationId } = useReviewSailCore();
  const actions = useReviewSailActions({ state, setState, refreshData });

  const contextValue: ReviewSailContextType = {
    locations: state.locations,
    customers: state.customers,
    orders: state.orders,
    reviewRequests: state.reviewRequests,
    optOuts: state.optOuts,
    messageEvents: state.messageEvents,
    feedbacks: state.feedbacks,
    activeLocationId: state.activeLocationId,
    subscriptionStatus: state.subscriptionStatus,
    stripeCustomerId: state.stripeCustomerId,
    loading: state.loading,
    unreadPrivateFeedbackCount: state.unreadPrivateFeedbackCount,
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