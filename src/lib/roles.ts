export type UserRole = 'admin' | 'staff' | null;

export const isAdmin = (role: UserRole): boolean => role === 'admin';
export const isStaff = (role: UserRole): boolean => role === 'staff';