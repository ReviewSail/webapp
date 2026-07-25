// ... keep existing imports and component up to the line where selectedOrder/selectedCustomer are defined
  const selectedRequest = reviewRequests.find(r => r.id === selectedRequestId) || null;
  const selectedOrder = selectedRequest ? (orders.find(o => o.id === selectedRequest.orderId) || null) : null;
  const selectedCustomer = selectedOrder ? (customers.find(c => c.id === selectedOrder.customerId) || null) : null;
// ... rest of file unchanged