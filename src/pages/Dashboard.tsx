import { useState } from 'react';
import { useMapRated } from '../context/MapRatedContext';
import { RefreshCw, AlertCircle, FileUp, Send } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { TrialBanner } from '../components/dashboard/TrialBanner';
import { OnboardingWizard } from '../components/dashboard/OnboardingWizard';
import { StatsGrid } from '../components/dashboard/StatsGrid';
import { RecentRequestsTable } from '../components/dashboard/RecentRequestsTable';
import { PrivateFeedbackSection } from '../components/dashboard/PrivateFeedbackSection';
// ... rest of imports unchanged