import { describe, it, expect } from 'vitest';
import { generateTicketCode, isValidTicketCode } from './ticket-code.js';

describe('Ticket Code Library', () => {
  describe('generateTicketCode', () => {
    it('should generate code with TP- prefix', () => {
      const code = generateTicketCode('maliq-senandung-jakarta-2025');
      expect(code).toMatch(/^TP-/);
    });

    it('should have correct format TP-XXXXXX-XXXXXX', () => {
      const code = generateTicketCode('maliq-senandung-jakarta-2025');
      expect(code).toMatch(/^TP-[A-Z0-9]{6}-[A-F0-9]{6}$/);
    });

    it('should extract first 6 alphanumeric characters from slug', () => {
      const code = generateTicketCode('maliq-senandung-jakarta-2025');
      const eventCode = code.split('-')[1];
      expect(eventCode).toBe('MALIQS');
    });

    it('should pad with X if slug is too short', () => {
      const code = generateTicketCode('ab');
      const eventCode = code.split('-')[1];
      expect(eventCode).toBe('ABXXXX');
    });

    it('should generate unique codes for same slug', () => {
      const codes = new Set<string>();
      for (let i = 0; i < 100; i++) {
        codes.add(generateTicketCode('maliq-senandung-jakarta-2025'));
      }
      expect(codes.size).toBe(100);
    });

    it('should handle edge case: single character slug', () => {
      const code = generateTicketCode('a');
      expect(code).toMatch(/^TP-[A-Z0-9]{6}-[A-F0-9]{6}$/);
      const eventCode = code.split('-')[1];
      expect(eventCode).toBe('AXXXXX');
    });
  });

  describe('isValidTicketCode', () => {
    it('should return true for valid ticket code', () => {
      const code = generateTicketCode('maliq-senandung-jakarta-2025');
      expect(isValidTicketCode(code)).toBe(true);
    });

    it('should return false for invalid format', () => {
      expect(isValidTicketCode('invalid')).toBe(false);
      expect(isValidTicketCode('TP-123456')).toBe(false);
      expect(isValidTicketCode('TP-123456-78901G')).toBe(false);
      expect(isValidTicketCode('XX-123456-789012')).toBe(false);
      expect(isValidTicketCode('TP-123456-78901')).toBe(false);
    });

    it('should return false for code with lowercase', () => {
      expect(isValidTicketCode('tp-123456-789012')).toBe(false);
      expect(isValidTicketCode('TP-123456-78901g')).toBe(false);
    });
  });
});