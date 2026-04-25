import * as crypto from 'crypto';

const TICKET_CODE_PREFIX = 'TP';
const EVENT_CODE_LENGTH = 6;
const RANDOM_LENGTH = 6;

export function generateTicketCode(eventSlug: string): string {
  const cleaned = eventSlug.replace(/[^a-zA-Z0-9]/g, '');
  const eventCode = cleaned
    .toUpperCase()
    .substring(0, EVENT_CODE_LENGTH)
    .padEnd(EVENT_CODE_LENGTH, 'X');

  const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();

  return `${TICKET_CODE_PREFIX}-${eventCode}-${randomPart}`;
}

export function isValidTicketCode(code: string): boolean {
  const regex = /^TP-[A-Z0-9]{6}-[A-F0-9]{6}$/;
  return regex.test(code);
}