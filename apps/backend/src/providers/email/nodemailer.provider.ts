import nodemailer from "nodemailer";
import type { EmailProvider, SendEmailInput } from "./email-provider.js";

interface NodemailerEmailProviderInput {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromEmail: string;
  replyTo?: string;
}

export class NodemailerEmailProvider implements EmailProvider {
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly input: NodemailerEmailProviderInput) {
    this.transporter = nodemailer.createTransport({
      host: input.host,
      port: input.port,
      secure: input.secure,
      auth: {
        user: input.user,
        pass: input.pass
      }
    });
  }

  async sendEmail(payload: SendEmailInput): Promise<void> {
    await this.transporter.sendMail({
      from: this.input.fromEmail,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      replyTo: this.input.replyTo
    });
  }
}