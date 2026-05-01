export enum MembershipStatus {
  Active = 'active',
  ExpiringSoon = 'expiring_soon',
  Expired = 'expired',
}

export enum PaymentStatus {
  Paid = 'paid',
  Pending = 'pending',
  Overdue = 'overdue',
}

export enum PaymentMethod {
  Cash = 'cash',
  Card = 'card',
  OnlineTransfer = 'online_transfer',
}

export enum Gender {
  Male = 'male',
  Female = 'female',
  Other = 'other',
}

export enum NotificationType {
  MembershipExpiringSoon = 'membership_expiring_soon',
  MembershipExpired = 'membership_expired',
  PaymentOverdue = 'payment_overdue',
  PaymentReceived = 'payment_received',
}

export enum EmailTemplate {
  Welcome = 'welcome',
  MembershipExpiring = 'membership_expiring',
  MembershipExpired = 'membership_expired',
  PaymentConfirmation = 'payment_confirmation',
  PaymentOverdueReminder = 'payment_overdue_reminder',
}
