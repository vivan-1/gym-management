import nodemailer, { Transporter } from 'nodemailer';
import { EmailTemplate } from '../types/enums';

export interface EmailServiceOptions {
  transport?: Transporter;
  retryDelays?: number[];
  logger?: {
    error: (message: string, ...args: unknown[]) => void;
    info: (message: string, ...args: unknown[]) => void;
  };
  onAllRetriesFailed?: (to: string, template: EmailTemplate, error: Error) => Promise<void>;
}

interface EmailTemplateContent {
  subject: string;
  html: string;
}

/**
 * Generates email template content based on template type and data.
 */
function getTemplateContent(template: EmailTemplate, data: Record<string, unknown>): EmailTemplateContent {
  switch (template) {
    case EmailTemplate.Welcome:
      return {
        subject: 'Welcome to Our Gym!',
        html: `<h1>Welcome, ${data.memberName || 'Member'}!</h1><p>Your membership has been created successfully. Your member ID is <strong>${data.memberId || ''}</strong>.</p>`,
      };
    case EmailTemplate.MembershipExpiring:
      return {
        subject: 'Your Membership is Expiring Soon',
        html: `<h1>Membership Expiring Soon</h1><p>Dear ${data.memberName || 'Member'}, your membership will expire on <strong>${data.endDate || ''}</strong>. Please renew to continue enjoying our services.</p>`,
      };
    case EmailTemplate.MembershipExpired:
      return {
        subject: 'Your Membership Has Expired',
        html: `<h1>Membership Expired</h1><p>Dear ${data.memberName || 'Member'}, your membership expired on <strong>${data.endDate || ''}</strong>. Please renew to regain access.</p>`,
      };
    case EmailTemplate.PaymentConfirmation:
      return {
        subject: 'Payment Confirmation',
        html: `<h1>Payment Received</h1><p>Dear ${data.memberName || 'Member'}, we have received your payment of <strong>${data.amount || ''}</strong>. Thank you!</p>`,
      };
    case EmailTemplate.PaymentOverdueReminder:
      return {
        subject: 'Payment Overdue Reminder',
        html: `<h1>Payment Overdue</h1><p>Dear ${data.memberName || 'Member'}, your payment of <strong>${data.amount || ''}</strong> is overdue. Please make your payment as soon as possible.</p>`,
      };
    default:
      return {
        subject: 'Notification',
        html: `<p>${data.message || 'You have a new notification.'}</p>`,
      };
  }
}

/**
 * Delays execution for the specified number of milliseconds.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class EmailService {
  private transport: Transporter;
  private retryDelays: number[];
  private logger: { error: (message: string, ...args: unknown[]) => void; info: (message: string, ...args: unknown[]) => void };
  private onAllRetriesFailed?: (to: string, template: EmailTemplate, error: Error) => Promise<void>;
  private fromAddress: string;

  constructor(options: EmailServiceOptions = {}) {
    this.transport = options.transport || this.createDefaultTransport();
    // Default retry delays: 1s, 2s, 4s (exponential backoff)
    this.retryDelays = options.retryDelays || [1000, 2000, 4000];
    this.logger = options.logger || {
      error: console.error,
      info: console.info,
    };
    this.onAllRetriesFailed = options.onAllRetriesFailed;
    this.fromAddress = process.env.EMAIL_FROM || 'noreply@gym-management.com';
  }

  /**
   * Creates the default nodemailer transport based on environment variables.
   * Supports SES (via SMTP) or generic SMTP configuration.
   */
  private createDefaultTransport(): Transporter {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
      },
    });
  }

  /**
   * Sends an email using the specified template with retry logic.
   * Retries up to 3 times with exponential backoff (1s, 2s, 4s).
   * Logs failures after all retries exhausted and creates in-app notification for admin.
   */
  async sendEmail(to: string, template: EmailTemplate, data: Record<string, unknown>): Promise<void> {
    const { subject, html } = getTemplateContent(template, data);

    let lastError: Error | null = null;

    // Initial attempt
    try {
      await this.transport.sendMail({
        from: this.fromAddress,
        to,
        subject,
        html,
      });
      this.logger.info(`Email sent successfully to ${to} (template: ${template})`);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Email send attempt 1 failed for ${to}: ${lastError.message}`);
    }

    // Retry attempts with exponential backoff
    for (let i = 0; i < this.retryDelays.length; i++) {
      await delay(this.retryDelays[i]);

      try {
        await this.transport.sendMail({
          from: this.fromAddress,
          to,
          subject,
          html,
        });
        this.logger.info(`Email sent successfully to ${to} on retry ${i + 1} (template: ${template})`);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.error(`Email send attempt ${i + 2} failed for ${to}: ${lastError.message}`);
      }
    }

    // All retries exhausted
    this.logger.error(
      `All email retries exhausted for ${to} (template: ${template}). Last error: ${lastError?.message}`
    );

    // Notify admin via callback
    if (this.onAllRetriesFailed && lastError) {
      await this.onAllRetriesFailed(to, template, lastError);
    }
  }
}

/**
 * Creates a default email service instance.
 * The transport is injectable for testing purposes.
 */
export const emailService = new EmailService();
