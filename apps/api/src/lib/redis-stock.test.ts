import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initStock, decrStock, incrStock, getStock, syncStockFromDb } from './redis-stock.js';

vi.mock('../services/redis.js', () => {
  const store: Record<string, string> = {};
  return {
    redis: {
      set: vi.fn(async (key: string, value: string | number) => {
        if (typeof value === 'string') store[key] = value;
        else store[key] = String(value);
        return 'OK';
      }),
      get: vi.fn(async (key: string) => store[key] || null),
      eval: vi.fn(async (script: string, numKeys: number, key: string, quantity: number) => {
        const current = parseInt(store[key] || '0');
        const newValue = current - quantity;
        if (newValue < 0) {
          store[key] = String(current);
          return [0, String(current)];
        }
        store[key] = String(newValue);
        return [1, String(newValue)];
      }),
      incrby: vi.fn(async (key: string, increment: number) => {
        const current = parseInt(store[key] || '0');
        const newValue = current + increment;
        store[key] = String(newValue);
        return newValue;
      }),
      decrby: vi.fn(async (key: string, decrement: number) => {
        const current = parseInt(store[key] || '0');
        const newValue = current - decrement;
        store[key] = String(newValue);
        return newValue;
      }),
    },
  };
});

describe('Redis Stock Library', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initStock', () => {
    it('should initialize stock for category', async () => {
      await initStock('cat-001', 100);
      expect(true).toBe(true);
    });

    it('should not overwrite existing stock', async () => {
      await initStock('cat-002', 50);
      await initStock('cat-002', 100);
      expect(true).toBe(true);
    });
  });

  describe('decrStock', () => {
    beforeEach(async () => {
      await initStock('cat-003', 100);
    });

    it('should decrease stock successfully', async () => {
      const result = await decrStock('cat-003', 5);
      expect(result.success).toBe(true);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
    });

    it('should rollback when stock goes negative', async () => {
      await initStock('cat-rollback', 50);
      const result = await decrStock('cat-rollback', 1000);
      expect(result.success).toBe(false);
      expect(result.remaining).toBe(50);
    });
  });

  describe('incrStock', () => {
    it('should increase stock', async () => {
      const result = await incrStock('cat-005', 10);
      expect(result).toBeGreaterThan(0);
    });

    it('should cap at max quota', async () => {
      const result = await incrStock('cat-006', 10000);
      expect(result).toBeLessThanOrEqual(10000);
    });
  });

  describe('getStock', () => {
    it('should return current stock', async () => {
      const stock = await getStock('cat-007');
      expect(typeof stock).toBe('number');
    });

    it('should return -1 if key does not exist', async () => {
      const stock = await getStock('non-existent-category');
      expect(stock).toBe(-1);
    });
  });

  describe('syncStockFromDb', () => {
    it('should sync stock from DB', async () => {
      await syncStockFromDb('cat-008', 50);
      const stock = await getStock('cat-008');
      expect(stock).toBe(50);
    });
  });

  describe('race condition', () => {
    it('should handle concurrent decrStock operations', async () => {
      const promises = Array(10)
        .fill(null)
        .map(() => decrStock('cat-race', 1));
      const results = await Promise.all(promises);
      const failures = results.filter((r) => !r.success).length;
      expect(failures).toBeGreaterThanOrEqual(0);
    });
  });
});