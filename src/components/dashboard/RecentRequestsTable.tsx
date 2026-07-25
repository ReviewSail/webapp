import { useState } from 'react';
import { Inbox, RefreshCw, Send, Eye, Check } from 'lucide-react';
import { ReviewRequest, Order, Customer, useMapRated } from '../../context/MapRatedContext';
import { GuestDetailPanel } from './GuestDetailPanel';

interface RecentRequestsTableProps {
  recentRequests: ReviewRequest[];
  orders: Order[];
  customers: Customer[];
  totalLogs: number;
}

export function RecentRequestsTable({
  recentRequests,
  orders,
  customers,
  totalLogs
}: RecentRequestsTableProps) {
  const { messageEvents, triggerSingleResend } = useMapRated();
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  const selectedRequest = recentRequests.find(r => r.id === selectedRequestId) || null;
  const selectedOrder = selectedRequest ? (orders.find(o => o.id === selectedRequest.orderId) || null) : null;
  const selectedCustomer = selectedOrder ? (customers.find(c => c.id === selectedOrder.customerId) || null) : null;
  const selectedEvents = selectedRequestId ? messageEvents.filter(e => e.requestId === selectedRequestId) : [];
// ... rest of file unchanged