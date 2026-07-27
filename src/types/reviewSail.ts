export type DigestSetting = {
  id: string;
  userId: string;
  accountId: string;
  frequency: 'weekly' | 'monthly';
  enabled: boolean;
};