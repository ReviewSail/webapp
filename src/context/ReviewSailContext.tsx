// ... (all existing code above the addOrder function)

  const addOrder = async (order: Omit<Order, 'id'> & { checkinDate?: string }) => {
    const { data, error } = await supabase.from('orders').insert({
      location_id: order.locationId,
      customer_id: order.customerId,
      checkout_date: order.checkoutDate,
      checkin_date: order.checkinDate || null,
      status: order.status,
    }).select().single();

    if (error) {
      console.error(error);
      return null;
    }

    await refreshData();
    return {
      id: data.id,
      customerId: data.customer_id,
      locationId: data.location_id,
      checkoutDate: data.checkout_date,
      checkinDate: data.checkin_date || undefined,
      midstaySent: data.midstay_sent === true,
      midstaySentAt: data.midstay_sent_at || undefined,
      status: data.status as 'pending' | 'completed' | 'cancelled',
    };
  };

  const bulkImport = async (rows: Array<{
    firstName: string;
    lastName: string;
    email: string | null;
    phone?: string | null;
    checkoutDate: string;
    checkinDate?: string;
  }>) => {
    if (!state.activeLocationId) {
      return { success: false, count: 0, error: 'No active location selected' };
    }

    try {
      const { data: userData } = await supabase.from('users').select('account_id').eq('id', session?.user.id).single();
      if (!userData) {
        return { success: false, count: 0, error: 'No user account linked' };
      }
      const accountId = userData.account_id;

      const { data: insertedCustomers, error: custError } = await supabase
        .from('customers')
        .insert(rows.map(r => ({
          account_id: accountId,
          first_name: r.firstName,
          last_name: r.lastName,
          email: r.email,
          phone: r.phone || null,
        })))
        .select();

      if (custError || !insertedCustomers) {
        throw custError || new Error('Failed to bulk insert customers');
      }

      const ordersToInsert = insertedCustomers.map((cust, idx) => ({
        location_id: state.activeLocationId!,
        customer_id: cust.id,
        checkout_date: rows[idx] ? new Date(rows[idx].checkoutDate).toISOString() : new Date().toISOString(),
        checkin_date: rows[idx]?.checkinDate ? new Date(rows[idx].checkinDate).toISOString() : null,
        status: 'completed' as const,
      }));

      const { data: insertedOrders, error: orderError } = await supabase.from('orders').insert(ordersToInsert).select();
      if (orderError || !insertedOrders) {
        throw orderError || new Error('Failed to bulk insert orders');
      }

      // ... rest of the function remains unchanged