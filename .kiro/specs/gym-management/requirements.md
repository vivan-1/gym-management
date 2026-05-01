# Requirements Document

## Introduction

A cloud-based gym management system that enables gym administrators to register and manage members, track membership durations and expiry, process fee payments, and send notifications (email and in-app) to both admins and members regarding membership status and payment activity. The system is designed as a web application accessible from any modern browser.

## Glossary

- **System**: The gym management web application as a whole
- **Admin**: A gym administrator who manages members, memberships, and payments
- **Member**: A registered individual with an active or expired gym membership
- **Membership**: A time-bound subscription associated with a Member, defined by a start date and an end date
- **Membership_Status**: The current state of a Membership — one of: Active, Expiring_Soon, or Expired
- **Notification_Service**: The subsystem responsible for sending email and in-app notifications to Admins and Members
- **Payment**: A recorded financial transaction from a Member for a Membership fee
- **Payment_Status**: The state of a Payment — one of: Paid, Pending, or Overdue
- **Dashboard**: The Admin-facing overview screen showing membership and payment summaries
- **Expiry_Window**: A configurable number of days before membership expiry during which notifications are triggered (default: 7 days)

## Requirements

### Requirement 1: Member Registration

**User Story:** As an Admin, I want to register new gym members with their basic details, so that I can maintain an accurate record of all gym members.

#### Acceptance Criteria

1. THE System SHALL provide a member registration form that captures: full name, email address, phone number, date of birth, gender, and address.
2. WHEN an Admin submits a valid registration form, THE System SHALL create a new Member record and assign a unique member ID.
3. WHEN an Admin submits a registration form with missing required fields, THE System SHALL display a validation error indicating which fields are missing.
4. WHEN an Admin submits a registration form with an email address that already exists in the system, THE System SHALL display an error indicating the email is already registered.
5. WHEN a new Member is successfully registered, THE System SHALL send a welcome email to the Member's registered email address.

### Requirement 2: Membership Management

**User Story:** As an Admin, I want to assign and manage membership durations for members, so that I can track when each member's membership starts and ends.

#### Acceptance Criteria

1. WHEN an Admin creates a Membership for a Member, THE System SHALL require a start date and a membership duration (1 month, 3 months, 6 months, or 12 months).
2. WHEN a Membership is created with a start date and duration, THE System SHALL calculate and store the end date automatically.
3. THE System SHALL set the Membership_Status to Active for all newly created Memberships where the current date falls between the start date and end date.
4. WHEN an Admin views a Member's profile, THE System SHALL display the current Membership_Status, start date, end date, and remaining days.
5. WHEN an Admin renews a Membership, THE System SHALL extend the end date from the current end date (if still active) or from the current date (if expired).

### Requirement 3: Membership Expiry Tracking

**User Story:** As an Admin, I want the system to automatically track membership expiry, so that I can take timely action on expiring and expired memberships.

#### Acceptance Criteria

1. THE System SHALL evaluate all active Memberships daily and update the Membership_Status to Expiring_Soon when the remaining days fall within the configured Expiry_Window.
2. THE System SHALL update the Membership_Status to Expired when the current date exceeds the Membership end date.
3. WHEN a Membership_Status changes to Expired, THE System SHALL restrict the expired Member's access status in the system.
4. WHEN an Admin views the Dashboard, THE System SHALL display counts of Active, Expiring_Soon, and Expired memberships.

### Requirement 4: Membership Expiry Notifications

**User Story:** As an Admin and as a Member, I want to receive notifications when a membership is about to expire or has expired, so that timely renewal action can be taken.

#### Acceptance Criteria

1. WHEN a Membership_Status changes to Expiring_Soon, THE Notification_Service SHALL send an email notification to the Member informing them of the upcoming expiry date.
2. WHEN a Membership_Status changes to Expiring_Soon, THE Notification_Service SHALL send an in-app notification to the Admin listing the Member whose membership is expiring soon.
3. WHEN a Membership_Status changes to Expired, THE Notification_Service SHALL send an email notification to the Member informing them that the membership has expired.
4. WHEN a Membership_Status changes to Expired, THE Notification_Service SHALL send an in-app notification to the Admin listing the Member whose membership has expired.
5. THE Notification_Service SHALL allow the Admin to configure the Expiry_Window (number of days before expiry to trigger notifications).
6. IF the Notification_Service fails to send an email, THEN THE System SHALL log the failure and retry the email delivery up to 3 times with exponential backoff.

### Requirement 5: Fee and Payment Tracking

**User Story:** As an Admin, I want to record and track membership fee payments, so that I can maintain accurate financial records and identify outstanding payments.

#### Acceptance Criteria

1. WHEN an Admin records a Payment for a Member, THE System SHALL capture the payment amount, payment date, payment method (cash, card, or online transfer), and associate the Payment with the corresponding Membership.
2. THE System SHALL set the Payment_Status to Paid when a Payment is successfully recorded for a Membership.
3. WHEN a Membership is created without a corresponding Payment, THE System SHALL set the Payment_Status to Pending.
4. THE System SHALL update the Payment_Status to Overdue when a Membership has a Pending Payment_Status and the Membership start date has passed by more than 7 days.
5. WHEN a Payment is successfully recorded, THE System SHALL send a payment confirmation email to the Member with the payment details.
6. WHEN an Admin views the Dashboard, THE System SHALL display a summary of total payments collected, pending payments, and overdue payments.

### Requirement 6: Payment Notifications

**User Story:** As an Admin and as a Member, I want to receive notifications about payment status, so that outstanding fees are addressed promptly.

#### Acceptance Criteria

1. WHEN a Payment_Status changes to Overdue, THE Notification_Service SHALL send an email notification to the Member reminding them of the outstanding payment.
2. WHEN a Payment_Status changes to Overdue, THE Notification_Service SHALL send an in-app notification to the Admin listing the Member with the overdue payment.
3. WHILE a Payment_Status remains Overdue, THE Notification_Service SHALL send a reminder email to the Member every 7 days.

### Requirement 7: Admin Dashboard

**User Story:** As an Admin, I want a centralized dashboard, so that I can get a quick overview of gym membership and payment status.

#### Acceptance Criteria

1. THE System SHALL display a Dashboard showing: total registered Members, Active memberships count, Expiring_Soon memberships count, Expired memberships count, total payments collected, and overdue payments count.
2. WHEN an Admin clicks on a membership status category on the Dashboard, THE System SHALL display a filtered list of Members in that category.
3. THE System SHALL display in-app notifications on the Dashboard with the most recent notifications shown first.
4. WHEN an Admin views the Dashboard, THE System SHALL display data that is current as of the last daily evaluation.

### Requirement 8: Member Search and Listing

**User Story:** As an Admin, I want to search and filter members, so that I can quickly find specific member records.

#### Acceptance Criteria

1. THE System SHALL provide a member listing page showing all registered Members with their name, email, Membership_Status, and Payment_Status.
2. WHEN an Admin enters a search query, THE System SHALL filter the member list by name, email, or member ID.
3. WHEN an Admin applies a Membership_Status filter, THE System SHALL display only Members matching the selected status.
4. WHEN an Admin applies a Payment_Status filter, THE System SHALL display only Members matching the selected payment status.

### Requirement 9: Authentication and Authorization

**User Story:** As an Admin, I want secure access to the system, so that only authorized personnel can manage gym data.

#### Acceptance Criteria

1. THE System SHALL require email and password authentication for Admin access.
2. WHEN an Admin provides valid credentials, THE System SHALL grant access to the Dashboard and all management features.
3. WHEN an Admin provides invalid credentials, THE System SHALL display an authentication error and deny access.
4. IF an Admin fails authentication 5 consecutive times, THEN THE System SHALL lock the Admin account for 15 minutes.
5. THE System SHALL enforce password requirements: minimum 8 characters, at least one uppercase letter, one lowercase letter, one digit, and one special character.
