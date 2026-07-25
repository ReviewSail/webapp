export default function Settings() {
  const { activeLocationId, locations, updateLocationSettings, addLocation, deleteLocation } = useMapRated();
  const { user: currentUser } = useAuth();
  // ... keep rest of state and functions unchanged until the invite submission part

  // Inside handleInviteTeamMember:
    try {
      // ... existing code ...
      const { error } = await supabase.functions.invoke('invite-team-member', {
        body: {
          email: emailToInvite,
          role: inviteRole,
          accountId,
          propertyName: activeLoc?.name || 'My Account'
        }
      });

      if (error) throw error;
      // ... rest of function ...