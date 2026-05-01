# Implementation Plan: Gym Management System

## Overview

This plan implements a full-stack gym management system with a React/TypeScript frontend, Node.js/Express backend, PostgreSQL database via Prisma ORM, JWT authentication, automated daily scheduling, and comprehensive notification support. Tasks are ordered to build foundational layers first (database, auth, core services) before wiring up the API, frontend, and scheduler.

## Tasks

- [x] 1. Set up project structure, database schema, and core configuration
  - [x] 1.1 Initialize project with Node.js/Express backend and React/TypeScript frontend
    - Create monorepo or workspace structure with `backend/` and `frontend/` directories
    - Initialize `package.json` for both backend and frontend
    - Install core dependencies: express, prisma, @prisma/client, zod, jsonwebtoken, bcrypt, node-cron, nodemailer (backend); react, react-router-dom, axios (frontend)
    - Install dev dependencies: vitest, fast-check, @types/* packages, typescript, ts-node
    - Configure TypeScript (`tsconfig.json`) for both backend and frontend
    - _Requirements: All_

  - [x] 1.2 Define Prisma schema and generate database models
    - Create `prisma/schema.prisma` with models: Admin, Member, Membership, Payment, Notification, SystemConfig
    - Define enums: MembershipStatus (active, expiring_soon, expired), PaymentStatus (paid, pending, overdue), PaymentMethod (cash, card, online_transfer), Gender (male, female, other)
    - Define relations: Member → Membership (one-to-many), Membership → Payment (one-to-many), Member → Payment (one-to-many), Admin → Notification (one-to-many)
    - Add unique constraints on Member.email, Member.memberId, Admin.email, SystemConfig.key
    - Generate Prisma client
    - _Requirements: 1.1, 1.2, 2.1, 5.1_

  - [x] 1.3 Create shared TypeScript types, enums, and Zod validation schemas
    - Define TypeScript interfaces: MemberRegistrationInput, MembershipCreateInput, PaymentRecordInput, SearchQuery, MemberFilters, Pagination, PaginatedResult
    - Define Zod schemas for all API request bodies: member registration, membership creation, payment recording, login, search query, pagination
    - Define shared enums: MembershipStatus, PaymentStatus, PaymentMethod, Gender, NotificationType, EmailTemplate
    - _Requirements: 1.1, 1.3, 2.1, 5.1, 9.5_

- [x] 2. Implement authentication service and middleware
  - [x] 2.1 Implement password hashing and validation utilities
    - Create password hashing function using bcrypt with configurable salt rounds
    - Create password comparison function
    - Implement password strength validator: minimum 8 characters, at least one uppercase, one lowercase, one digit, one special character
    - _Requirements: 9.1, 9.5_

  - [x] 2.2 Write property test for password validation (Property 18)
    - **Property 18: Password validation**
    - Test that the validator accepts strings with ≥8 chars, uppercase, lowercase, digit, and special character, and rejects all others
    - **Validates: Requirements 9.5**

  - [x] 2.3 Implement Auth Service with login, token validation, and account lockout
    - Implement `login(email, password)`: verify credentials, check lockout status, increment/reset failed attempts, generate JWT on success
    - Implement `validateToken(token)`: decode and verify JWT, return admin profile
    - Implement `lockAccount(adminId)`: set lockedUntil to current time + 15 minutes
    - Implement `unlockAccount(adminId)`: clear lockedUntil and reset failed attempts
    - Implement `getFailedAttempts(adminId)`: return current failed attempt count
    - Lock account after 5 consecutive failed attempts for 15 minutes
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 2.4 Write property test for invalid credentials denial (Property 16)
    - **Property 16: Invalid credentials are denied**
    - Test that any password not matching the stored hash results in authentication failure
    - **Validates: Requirements 9.3**

  - [x] 2.5 Write property test for account lockout (Property 17)
    - **Property 17: Account lockout after consecutive failures**
    - Test that after exactly 5 consecutive failed attempts the account is locked, and valid credentials are rejected while locked
    - **Validates: Requirements 9.4**

  - [x] 2.6 Create Express authentication middleware
    - Create JWT verification middleware that extracts token from Authorization header
    - Return 401 for missing, expired, or invalid tokens
    - Attach admin profile to request object on successful verification
    - _Requirements: 9.2, 9.3_

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement Member Service and registration API
  - [x] 4.1 Implement Member Service
    - Implement `register(data)`: validate input, check for duplicate email, create Member record with auto-generated unique member ID
    - Implement `getById(memberId)`: retrieve member with current membership and payment status
    - Implement `search(query)`: search by name, email, or member ID (case-insensitive), with optional status filters and pagination
    - Implement `list(filters, pagination)`: list members with optional membership status and payment status filters, with pagination
    - _Requirements: 1.2, 1.3, 1.4, 8.1, 8.2, 8.3, 8.4_

  - [x] 4.2 Write property test for member registration uniqueness (Property 1)
    - **Property 1: Member registration creates a unique record**
    - Test that every valid registration produces a member with a unique ID distinct from all previous IDs
    - **Validates: Requirements 1.2**

  - [x] 4.3 Write property test for registration validation (Property 2)
    - **Property 2: Registration validation rejects missing required fields**
    - Test that inputs with missing/empty required fields are rejected with errors identifying the exact missing fields
    - **Validates: Requirements 1.3**

  - [x] 4.4 Write property test for duplicate email rejection (Property 3)
    - **Property 3: Duplicate email rejection**
    - Test that registering a second member with the same email is always rejected
    - **Validates: Requirements 1.4**

  - [x] 4.5 Write property test for member search (Property 14)
    - **Property 14: Member search matches by name, email, or member ID**
    - Test that search results include all members matching the query in name, email, or member ID (case-insensitive) and exclude non-matches
    - **Validates: Requirements 8.2**

  - [x] 4.6 Write property test for member filtering (Property 15)
    - **Property 15: Member filtering by status**
    - Test that filtering by membership or payment status returns exactly the matching members with no omissions or false inclusions
    - **Validates: Requirements 7.2, 8.3, 8.4**

  - [x] 4.7 Create Member API routes
    - POST `/api/members` — register a new member (validate with Zod schema)
    - GET `/api/members/:id` — get member by ID
    - GET `/api/members` — list members with optional filters and pagination
    - GET `/api/members/search` — search members by query string
    - All routes protected by auth middleware
    - _Requirements: 1.1, 1.2, 8.1, 8.2, 8.3, 8.4_

- [x] 5. Implement Membership Service and API
  - [x] 5.1 Implement Membership Service
    - Implement `create(memberId, data)`: validate start date and duration (1, 3, 6, 12 months), calculate end date, set status to Active if current date is in range
    - Implement `renew(membershipId, duration)`: extend from current end date if active, or from current date if expired; reset status to Active
    - Implement `evaluateStatuses()`: batch-evaluate all memberships — set Expiring_Soon when remaining days ≤ expiry window, set Expired when past end date
    - Implement `getByMemberId(memberId)`: return current membership for a member
    - Implement `getStatusCounts()`: return counts of Active, Expiring_Soon, and Expired memberships
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4_

  - [x] 5.2 Write property test for membership end date calculation (Property 4)
    - **Property 4: Membership end date calculation**
    - Test that for any valid start date and duration (1, 3, 6, 12 months), the end date equals start date plus exactly that many months
    - **Validates: Requirements 2.2**

  - [x] 5.3 Write property test for new membership Active status (Property 5)
    - **Property 5: New membership status is Active when current date is in range**
    - Test that a newly created membership where the current date falls between start and end date has Active status
    - **Validates: Requirements 2.3**

  - [x] 5.4 Write property test for membership renewal (Property 6)
    - **Property 6: Membership renewal extends from correct base date**
    - Test that active memberships extend from current end date and expired memberships extend from current date
    - **Validates: Requirements 2.5**

  - [x] 5.5 Write property test for membership status evaluation (Property 7)
    - **Property 7: Membership status evaluation correctness**
    - Test that daily evaluation correctly sets Expiring_Soon, Expired, and Active statuses based on end dates and expiry window
    - **Validates: Requirements 3.1, 3.2**

  - [x] 5.6 Create Membership API routes
    - POST `/api/memberships` — create membership for a member
    - PUT `/api/memberships/:id/renew` — renew a membership
    - GET `/api/memberships/member/:memberId` — get membership by member ID
    - GET `/api/memberships/counts` — get status counts
    - All routes protected by auth middleware
    - _Requirements: 2.1, 2.4, 2.5, 3.4_

- [x] 6. Implement Payment Service and API
  - [x] 6.1 Implement Payment Service
    - Implement `record(memberId, data)`: validate payment input, create Payment record with Paid status, associate with membership
    - Implement `evaluateOverdue()`: batch-evaluate all Pending payments — set to Overdue when membership start date + 7 days < current date
    - Implement `getByMembershipId(membershipId)`: return all payments for a membership
    - Implement `getPaymentSummary()`: return total collected, pending count, and overdue count
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6_

  - [x] 6.2 Write property test for payment recording (Property 8)
    - **Property 8: Payment recording stores all fields with Paid status**
    - Test that recording a valid payment preserves all input fields and sets status to Paid
    - **Validates: Requirements 5.1, 5.2**

  - [x] 6.3 Write property test for default Pending status (Property 9)
    - **Property 9: Default Pending payment status for unpaid memberships**
    - Test that newly created memberships without payments have Pending payment status
    - **Validates: Requirements 5.3**

  - [x] 6.4 Write property test for overdue payment transition (Property 10)
    - **Property 10: Overdue payment status transition**
    - Test that Pending payments become Overdue when membership start date is more than 7 days before current date
    - **Validates: Requirements 5.4**

  - [x] 6.5 Create Payment API routes
    - POST `/api/payments` — record a payment for a membership
    - GET `/api/payments/membership/:membershipId` — get payments by membership
    - GET `/api/payments/summary` — get payment summary
    - All routes protected by auth middleware
    - _Requirements: 5.1, 5.6_

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement Notification Service
  - [x] 8.1 Implement email sending with retry logic
    - Create email transport using nodemailer (configurable for SES or SMTP)
    - Implement email templates: welcome, membership_expiring, membership_expired, payment_confirmation, payment_overdue_reminder
    - Implement retry logic: up to 3 retries with exponential backoff (1s, 2s, 4s)
    - Log failures after all retries exhausted and create in-app notification for admin
    - _Requirements: 1.5, 4.1, 4.3, 4.6, 5.5, 6.1_

  - [x] 8.2 Implement in-app notification service
    - Implement `createInAppNotification(adminId, notification)`: create notification record with type, title, message, and optional related member ID
    - Implement `getInAppNotifications(adminId, pagination)`: return paginated notifications sorted by creation date descending (most recent first)
    - Implement `configureExpiryWindow(days)`: update SystemConfig for expiry window
    - Implement `getExpiryWindow()`: read current expiry window from SystemConfig (default 7 days)
    - _Requirements: 4.2, 4.4, 4.5, 6.2, 7.3_

  - [x] 8.3 Write property test for notification ordering (Property 12)
    - **Property 12: Notification chronological ordering**
    - Test that notifications are always returned sorted in descending order by creation timestamp
    - **Validates: Requirements 7.3**

  - [x] 8.4 Create Notification API routes
    - GET `/api/notifications` — get in-app notifications for the authenticated admin (paginated)
    - PUT `/api/notifications/expiry-window` — configure expiry window
    - GET `/api/notifications/expiry-window` — get current expiry window
    - All routes protected by auth middleware
    - _Requirements: 4.5, 7.3_

- [x] 9. Implement Dashboard Service and API
  - [x] 9.1 Implement Dashboard Service
    - Implement `getSummary()`: aggregate total members, membership status counts, payment summary, and recent notifications
    - Implement `getMembersByStatus(status, pagination)`: return paginated members filtered by membership status
    - _Requirements: 3.4, 5.6, 7.1, 7.2, 7.4_

  - [x] 9.2 Write property test for dashboard summary accuracy (Property 11)
    - **Property 11: Dashboard summary accuracy**
    - Test that dashboard counts match actual record counts for members, membership statuses, and payment statuses
    - **Validates: Requirements 3.4, 5.6, 7.1**

  - [x] 9.3 Create Dashboard API routes
    - GET `/api/dashboard/summary` — get dashboard summary
    - GET `/api/dashboard/members/:status` — get members by membership status
    - All routes protected by auth middleware
    - _Requirements: 7.1, 7.2_

- [x] 10. Implement Daily Scheduler
  - [x] 10.1 Implement daily evaluation scheduler
    - Create scheduler using node-cron to run daily at a configurable time
    - Implement `runEvaluation()`: call `membershipService.evaluateStatuses()`, then `paymentService.evaluateOverdue()`
    - For each newly Expiring_Soon membership: send email to member, create in-app notification for admin
    - For each newly Expired membership: send email to member, create in-app notification for admin
    - For each newly Overdue payment: send email to member, create in-app notification for admin
    - For ongoing Overdue payments: send reminder email every 7 days
    - Log evaluation summary with successes and failures; individual failures do not halt the batch
    - Implement `start()` and `stop()` methods for lifecycle management
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 5.4, 6.1, 6.2, 6.3_

  - [x] 10.2 Write unit tests for daily scheduler
    - Test that evaluation triggers membership and payment status updates
    - Test that notifications are sent for status changes
    - Test that individual evaluation failures do not halt the batch
    - Test reminder email frequency for ongoing overdue payments
    - _Requirements: 3.1, 3.2, 5.4, 6.3_

- [x] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Implement frontend authentication and layout
  - [x] 12.1 Create app shell, routing, and auth context
    - Set up React Router with routes: /login, /dashboard, /members, /members/:id, /members/new
    - Create AuthContext with login/logout state management and JWT token storage
    - Create ProtectedRoute component that redirects to /login if not authenticated
    - Create main layout with sidebar navigation and notification bell
    - _Requirements: 9.1, 9.2_

  - [x] 12.2 Implement login page
    - Create login form with email and password fields
    - Validate password meets strength requirements on the client side
    - Display authentication errors (invalid credentials, account locked with remaining time)
    - On successful login, store JWT and redirect to dashboard
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 13. Implement frontend dashboard and notifications
  - [x] 13.1 Implement dashboard page
    - Display summary cards: total members, active memberships, expiring soon, expired, total payments collected, overdue payments
    - Make status count cards clickable to navigate to filtered member list
    - Display recent in-app notifications section
    - Fetch data from `/api/dashboard/summary`
    - _Requirements: 3.4, 5.6, 7.1, 7.2, 7.3, 7.4_

  - [x] 13.2 Implement notification panel
    - Create notification dropdown/panel accessible from the navigation bar
    - Display notifications sorted by most recent first
    - Support pagination for loading older notifications
    - Fetch data from `/api/notifications`
    - _Requirements: 7.3_

- [x] 14. Implement frontend member management
  - [x] 14.1 Implement member registration form
    - Create form with fields: full name, email, phone, date of birth, gender (dropdown), address
    - Validate all required fields with inline error messages using Zod
    - Display duplicate email error from API response
    - On success, navigate to the new member's profile page
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 14.2 Implement member listing page with search and filters
    - Display paginated table of members with columns: name, email, membership status, payment status
    - Add search input that filters by name, email, or member ID
    - Add dropdown filters for membership status and payment status
    - Support pagination controls
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 14.3 Write property test for member listing data completeness (Property 13)
    - **Property 13: Member listing data completeness**
    - Test that the member listing includes name, email, membership status, and payment status for every member with an associated membership and payment
    - **Validates: Requirements 8.1**

  - [x] 14.4 Implement member profile page
    - Display member details: full name, email, phone, date of birth, gender, address
    - Display current membership: status, start date, end date, remaining days
    - Display payment history for the membership
    - Add "Renew Membership" button with duration selection
    - Add "Record Payment" form with amount, date, and payment method
    - _Requirements: 2.4, 2.5, 5.1_

- [x] 15. Implement frontend expiry window configuration
  - [x] 15.1 Create admin settings page for expiry window
    - Add settings page or section accessible from navigation
    - Display current expiry window value
    - Allow admin to update the expiry window (number of days)
    - Validate input is a positive integer
    - _Requirements: 4.5_

- [x] 16. Wire backend Express app together and add error handling
  - [x] 16.1 Create Express app entry point and wire all routes
    - Create main Express app with CORS, JSON body parsing, and request logging
    - Mount all route modules: /api/auth, /api/members, /api/memberships, /api/payments, /api/notifications, /api/dashboard
    - Add global error handling middleware that returns structured error responses
    - Add 404 handler for unknown routes
    - Start the daily scheduler on app startup
    - _Requirements: All_

  - [x] 16.2 Write integration tests for API endpoints
    - Test member registration end-to-end (valid input, missing fields, duplicate email)
    - Test membership creation and renewal flows
    - Test payment recording flow
    - Test authentication flow (login, token validation, lockout)
    - Test dashboard summary endpoint returns correct aggregated data
    - _Requirements: 1.2, 1.3, 1.4, 2.1, 2.5, 5.1, 9.2, 9.3, 9.4, 7.1_

- [x] 17. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate the 18 universal correctness properties defined in the design document
- Unit and integration tests validate specific examples, edge cases, and end-to-end flows
- The daily scheduler (task 10) wires together membership evaluation, payment evaluation, and notification delivery
- Frontend tasks (12–15) can be parallelized once the backend API is complete
