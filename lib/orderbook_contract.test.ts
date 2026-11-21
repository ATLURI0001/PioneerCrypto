import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateOrderSpec,
  OrderBookEngine,
  type OrderSpec,
} from './orderbook_contract.ts';

describe('Limit Order Ingress Contract & Orderbook Matcher', () => {
  const ALICE = '0x1111111111111111111111111111111111111111';
  const BOB = '0x2222222222222222222222222222222222222222';
  const CHARLIE = '0x3333333333333333333333333333333333333333';
  const now = 1700000000000;

  describe('validateOrderSpec ingress sanitization', () => {
    it('should validate and sanitize valid order specifications', () => {
      const valid = {
        orderId: 'ord-101',
        trader: ALICE,
        side: 'BUY',
        assetPair: 'ETH-USDC',
        price: '3000000000',
        quantity: 1000000000000000000n,
        orderType: 'LIMIT',
        expiry: now + 60000,
        nonce: 0,
      };

      const res = validateOrderSpec(valid, now);
      assert.equal(res.orderId, 'ord-101');
      assert.equal(res.trader, ALICE);
      assert.equal(res.side, 'BUY');
      assert.equal(res.assetPair, 'ETH-USDC');
      assert.equal(res.price, 3000000000n);
      assert.equal(res.quantity, 1000000000000000000n);
      assert.equal(res.filledQuantity, 0n);
    });

    it('should reject invalid Ethereum addresses', () => {
      assert.throws(
        () => validateOrderSpec({ orderId: 'ord-test', trader: 'not-an-address' }, now),
        /trader must be a valid 20-byte Ethereum hex address/
      );
    });

    it('should reject non-positive price or quantity', () => {
      assert.throws(
        () =>
          validateOrderSpec(
            {
              orderId: '1',
              trader: ALICE,
              side: 'BUY',
              assetPair: 'ETH-USDC',
              price: 0n,
              quantity: 10n,
              orderType: 'LIMIT',
              expiry: now + 1000,
              nonce: 0,
            },
            now
          ),
        /price must be strictly positive/
      );

      assert.throws(
        () =>
          validateOrderSpec(
            {
              orderId: '1',
              trader: ALICE,
              side: 'BUY',
              assetPair: 'ETH-USDC',
              price: 100n,
              quantity: -5n,
              orderType: 'LIMIT',
              expiry: now + 1000,
              nonce: 0,
            },
            now
          ),
        /quantity must be strictly positive/
      );
    });

    it('should reject expired orders', () => {
      assert.throws(
        () =>
          validateOrderSpec(
            {
              orderId: '1',
              trader: ALICE,
              side: 'BUY',
              assetPair: 'ETH-USDC',
              price: 100n,
              quantity: 10n,
              orderType: 'LIMIT',
              expiry: now - 1000,
              nonce: 0,
            },
            now
          ),
        /expiry must be a future timestamp/
      );
    });
  });

  describe('OrderBookEngine matching semantics', () => {
    let book: OrderBookEngine;

    beforeEach(() => {
      book = new OrderBookEngine('ETH-USDC');
    });

    it('should place resting orders and report spread correctly', () => {
      // Place BID at 2900
      const bidRes = book.submitOrder(
        {
          orderId: 'bid-1',
          trader: ALICE,
          side: 'BUY',
          assetPair: 'ETH-USDC',
          price: 2900n,
          quantity: 100n,
          orderType: 'LIMIT',
          expiry: now + 60000,
          nonce: 1,
        },
        now
      );
      assert.equal(bidRes.status, 'PLACED');

      // Place ASK at 3100
      const askRes = book.submitOrder(
        {
          orderId: 'ask-1',
          trader: BOB,
          side: 'SELL',
          assetPair: 'ETH-USDC',
          price: 3100n,
          quantity: 50n,
          orderType: 'LIMIT',
          expiry: now + 60000,
          nonce: 1,
        },
        now
      );
      assert.equal(askRes.status, 'PLACED');

      const spread = book.getSpread();
      assert.equal(spread.bestBid, 2900n);
      assert.equal(spread.bestAsk, 3100n);
      assert.equal(spread.spread, 200n);
    });

    it('should execute immediate partial match at maker price', () => {
      // Resting ASK at 3000 for 100 units
      book.submitOrder(
        {
          orderId: 'ask-1',
          trader: BOB,
          side: 'SELL',
          assetPair: 'ETH-USDC',
          price: 3000n,
          quantity: 100n,
          orderType: 'LIMIT',
          expiry: now + 60000,
          nonce: 1,
        },
        now
      );

      // Incoming BUY taker at 3050 for 40 units
      const buyRes = book.submitOrder(
        {
          orderId: 'buy-1',
          trader: CHARLIE,
          side: 'BUY',
          assetPair: 'ETH-USDC',
          price: 3050n,
          quantity: 40n,
          orderType: 'LIMIT',
          expiry: now + 60000,
          nonce: 1,
        },
        now
      );

      assert.equal(buyRes.status, 'FILLED');
      assert.equal(buyRes.filledQuantity, 40n);
      assert.equal(buyRes.trades.length, 1);
      assert.equal(buyRes.trades[0].price, 3000n); // Maker price
      assert.equal(buyRes.trades[0].quantity, 40n);

      // Depth check: 60 units remaining at 3000
      const depth = book.getDepth();
      assert.equal(depth.asks.length, 1);
      assert.equal(depth.asks[0].quantity, 60n);
    });

    it('should enforce Fill-Or-Kill (FOK) cancellation when insufficient liquidity', () => {
      // Resting ASK for 50 units
      book.submitOrder(
        {
          orderId: 'ask-1',
          trader: BOB,
          side: 'SELL',
          assetPair: 'ETH-USDC',
          price: 3000n,
          quantity: 50n,
          orderType: 'LIMIT',
          expiry: now + 60000,
          nonce: 1,
        },
        now
      );

      // FOK BUY for 100 units -> should be completely cancelled
      const fokRes = book.submitOrder(
        {
          orderId: 'buy-fok',
          trader: ALICE,
          side: 'BUY',
          assetPair: 'ETH-USDC',
          price: 3000n,
          quantity: 100n,
          orderType: 'FOK',
          expiry: now + 60000,
          nonce: 1,
        },
        now
      );

      assert.equal(fokRes.status, 'CANCELLED');
      assert.equal(fokRes.filledQuantity, 0n);
      assert.equal(fokRes.trades.length, 0);

      // Resting ask must be untouched
      const depth = book.getDepth();
      assert.equal(depth.asks[0].quantity, 50n);
    });

    it('should allow authorized order cancellation and block unauthorized cancellation', () => {
      book.submitOrder(
        {
          orderId: 'order-cancel-me',
          trader: ALICE,
          side: 'BUY',
          assetPair: 'ETH-USDC',
          price: 2500n,
          quantity: 10n,
          orderType: 'LIMIT',
          expiry: now + 60000,
          nonce: 1,
        },
        now
      );

      // Bob cannot cancel Alice's order
      assert.throws(
        () => book.cancelOrder('order-cancel-me', BOB),
        /Unauthorized: cancel caller does not own this order/
      );

      // Alice can cancel
      const cancelled = book.cancelOrder('order-cancel-me', ALICE);
      assert.equal(cancelled, true);

      // Spread should now be empty
      assert.equal(book.getSpread().bestBid, null);
    });
  });
});
