export interface TwilioWebhookPayload {
  MessageSid: string;
  SmsSid: string;
  AccountSid: string;
  MessagingServiceSid?: string;
  From: string;
  To: string;
  Body: string;
  NumMedia: string;
  NumSegments: string;
  SmsStatus?: string;
  ApiVersion: string;
  [key: string]: string | undefined;
}

export type MessageStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'delivered'
  | 'undelivered'
  | 'receiving'
  | 'received';

export interface TwilioMessageResponse {
  sid: string;
  dateCreated: Date;
  dateUpdated: Date;
  dateSent: Date | null;
  accountSid: string;
  to: string;
  from: string;
  body: string;
  status: MessageStatus;
  numSegments: string;
  numMedia: string;
  direction: 'inbound' | 'outbound-api' | 'outbound-call' | 'outbound-reply';
  price: string | null;
  priceUnit: string | null;
  errorCode: number | null;
  errorMessage: string | null;
}
