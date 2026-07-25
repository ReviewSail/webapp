import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../integrations/supabase/client';
import { CheckCircle2, RefreshCw, AlertCircle } from 'lucide-react';
// ... rest of file unchanged