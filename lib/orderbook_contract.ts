/**
 * Limit Order Ingress Contract & Orderbook Matcher for PioneerCrypto
 * Enforces strict boundary validation, price-time priority, and IOC/FOK execution semantics.
 */

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'LIMIT' | 'IOC' | 'FOK';

export interface OrderSpec {
  orderId: string;
  trader: string;
  side: OrderSide;
  assetPair: string;
  price: bigint;
  quantity: bigint;
  orderType: OrderType;
  expiry: number;
  nonce: number;
  timestamp: number;
  filledQuantity: bigint;
}

export interface TradeExecutionEvent {
  tradeId: string;
  makerOrderId: string;
  takerOrderId: string;
  price: bigint;
  quantity: bigint;
  timestamp: number;
}

export interface OrderSubmissionResult {
  orderId: string;
  status: 'FILLED' | 'PARTIALLY_FILLED' | 'PLACED' | 'CANCELLED';
  filledQuantity: bigint;
  remainingQuantity: bigint;
  trades: TradeExecutionEvent[];
}

export interface PriceLevel {
  price: bigint;
  quantity: bigint;
  orderCount: number;
}

export interface OrderBookDepth {
  bids: PriceLevel[];
  asks: PriceLevel[];
}

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const PAIR_REGEX = /^[A-Z0-9]{2,10}-[A-Z0-9]{2,10}$/;

/**
 * Validates and sanitizes an incoming limit order specification.
 */
export function validateOrderSpec(
  input: unknown,
  currentTimestamp: number = Date.now()
): OrderSpec {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Order specification must be a non-null object');
  }

  const raw = input as Record<string, unknown>;

  // orderId validation
  if (typeof raw.orderId !== 'string' || !raw.orderId.trim()) {
    throw new Error('orderId must be a non-empty string');
  }
  const orderId = raw.orderId.trim();

  // trader address validation
  if (typeof raw.trader !== 'string' || !ADDRESS_REGEX.test(raw.trader)) {
    throw new Error(`trader must be a valid 20-byte Ethereum hex address, got '${raw.trader}'`);
  }
  const trader = raw.trader.toLowerCase();

  // side validation
  if (raw.side !== 'BUY' && raw.side !== 'SELL') {
    throw new Error(`side must be either 'BUY' or 'SELL', got '${raw.side}'`);
  }
  const side: OrderSide = raw.side;

  // assetPair validation
  if (typeof raw.assetPair !== 'string' || !PAIR_REGEX.test(raw.assetPair.trim().toUpperCase())) {
    throw new Error(`assetPair must be in BASE-QUOTE format (e.g. ETH-USDC), got '${raw.assetPair}'`);
  }
  const assetPair = raw.assetPair.trim().toUpperCase();

  // price validation (positive bigint)
  let price: bigint;
  try {
    price = typeof raw.price === 'bigint' ? raw.price : BigInt(String(raw.price));
  } catch {
    throw new Error('price must be a valid positive bigint integer');
  }
  if (price <= 0n) {
    throw new Error('price must be strictly positive');
  }

  // quantity validation (positive bigint)
  let quantity: bigint;
  try {
    quantity = typeof raw.quantity === 'bigint' ? raw.quantity : BigInt(String(raw.quantity));
  } catch {
    throw new Error('quantity must be a valid positive bigint integer');
  }
  if (quantity <= 0n) {
    throw new Error('quantity must be strictly positive');
  }

  // orderType validation
  const orderType: OrderType = raw.orderType as OrderType;
  if (orderType !== 'LIMIT' && orderType !== 'IOC' && orderType !== 'FOK') {
    throw new Error(`orderType must be 'LIMIT', 'IOC', or 'FOK', got '${raw.orderType}'`);
  }

  // expiry validation
  const expiry = Number(raw.expiry);
  if (!Number.isFinite(expiry) || expiry <= currentTimestamp) {
    throw new Error(`expiry must be a future timestamp, got ${expiry} vs current ${currentTimestamp}`);
  }

  // nonce validation
  const nonce = Number(raw.nonce);
  if (!Number.isInteger(nonce) || nonce < 0) {
    throw new Error(`nonce must be a non-negative integer, got ${raw.nonce}`);
  }

  const timestamp = Number(raw.timestamp) || currentTimestamp;

  return {
    orderId,
    trader,
    side,
    assetPair,
    price,
    quantity,
    orderType,
    expiry,
    nonce,
    timestamp,
    filledQuantity: 0n,
  };
}

/**
 * High-performance, memory-safe in-memory orderbook engine with Price-Time priority.
 */
export class OrderBookEngine {
  public readonly assetPair: string;
  private bids: OrderSpec[] = []; // sorted descending by price, then ascending by timestamp
  private asks: OrderSpec[] = []; // sorted ascending by price, then ascending by timestamp
  private orderIndex = new Map<string, OrderSpec>();
  private tradeSeq = 0;

  constructor(assetPair: string) {
    if (!PAIR_REGEX.test(assetPair.trim().toUpperCase())) {
      throw new Error(`Invalid assetPair: ${assetPair}`);
    }
    this.assetPair = assetPair.trim().toUpperCase();
  }

  /**
   * Submits and matches an order against the current orderbook.
   */
  public submitOrder(
    rawOrder: unknown,
    currentTimestamp: number = Date.now()
  ): OrderSubmissionResult {
    const order = validateOrderSpec(rawOrder, currentTimestamp);

    if (order.assetPair !== this.assetPair) {
      throw new Error(`Mismatched assetPair: expected ${this.assetPair}, got ${order.assetPair}`);
    }
    if (this.orderIndex.has(order.orderId)) {
      throw new Error(`Duplicate orderId: order '${order.orderId}' already exists`);
    }

    // Handle Fill-Or-Kill (FOK) pre-check
    if (order.orderType === 'FOK') {
      const matchableQty = this.calculateMatchableQuantity(order);
      if (matchableQty < order.quantity) {
        return {
          orderId: order.orderId,
          status: 'CANCELLED',
          filledQuantity: 0n,
          remainingQuantity: order.quantity,
          trades: [],
        };
      }
    }

    const trades: TradeExecutionEvent[] = [];
    const opposingQueue = order.side === 'BUY' ? this.asks : this.bids;

    let remainingQty = order.quantity - order.filledQuantity;
    let i = 0;

    while (i < opposingQueue.length && remainingQty > 0n) {
      const maker = opposingQueue[i];

      // Expiry check on resting maker order
      if (maker.expiry <= currentTimestamp) {
        this.orderIndex.delete(maker.orderId);
        opposingQueue.splice(i, 1);
        continue;
      }

      // Price crossing check
      const canMatch = order.side === 'BUY'
        ? order.price >= maker.price
        : order.price <= maker.price;

      if (!canMatch) {
        break; // Opposing queue is sorted; no further match possible
      }

      const makerRemaining = maker.quantity - maker.filledQuantity;
      const matched = remainingQty < makerRemaining ? remainingQty : makerRemaining;

      remainingQty -= matched;
      order.filledQuantity += matched;
      maker.filledQuantity += matched;

      this.tradeSeq++;
      trades.push({
        tradeId: `trade-${this.assetPair}-${this.tradeSeq}`,
        makerOrderId: maker.orderId,
        takerOrderId: order.orderId,
        price: maker.price, // Maker establishes execution price
        quantity: matched,
        timestamp: currentTimestamp,
      });

      if (maker.filledQuantity === maker.quantity) {
        this.orderIndex.delete(maker.orderId);
        opposingQueue.splice(i, 1);
      } else {
        i++;
      }
    }

    let status: OrderSubmissionResult['status'];

    if (order.filledQuantity === order.quantity) {
      status = 'FILLED';
    } else if (order.orderType === 'IOC' || order.orderType === 'FOK') {
      status = order.filledQuantity > 0n ? 'PARTIALLY_FILLED' : 'CANCELLED';
    } else {
      // Resting LIMIT order: insert into book
      this.insertRestingOrder(order);
      this.orderIndex.set(order.orderId, order);
      status = order.filledQuantity > 0n ? 'PARTIALLY_FILLED' : 'PLACED';
    }

    return {
      orderId: order.orderId,
      status,
      filledQuantity: order.filledQuantity,
      remainingQuantity: order.quantity - order.filledQuantity,
      trades,
    };
  }

  /**
   * Cancels an existing resting order.
   */
  public cancelOrder(orderId: string, trader: string): boolean {
    const order = this.orderIndex.get(orderId);
    if (!order) return false;
    if (order.trader !== trader.toLowerCase()) {
      throw new Error('Unauthorized: cancel caller does not own this order');
    }

    this.orderIndex.delete(orderId);
    const queue = order.side === 'BUY' ? this.bids : this.asks;
    const idx = queue.findIndex((o) => o.orderId === orderId);
    if (idx !== -1) {
      queue.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * Returns aggregated market depth up to specified number of price levels.
   */
  public getDepth(levels: number = 10): OrderBookDepth {
    return {
      bids: this.aggregateLevels(this.bids, levels),
      asks: this.aggregateLevels(this.asks, levels),
    };
  }

  /**
   * Returns current spread and mid-market price.
   */
  public getSpread(): { bestBid: bigint | null; bestAsk: bigint | null; spread: bigint | null } {
    const bestBid = this.bids.length > 0 ? this.bids[0].price : null;
    const bestAsk = this.asks.length > 0 ? this.asks[0].price : null;

    let spread: bigint | null = null;
    if (bestBid !== null && bestAsk !== null) {
      spread = bestAsk - bestBid;
    }

    return { bestBid, bestAsk, spread };
  }

  private calculateMatchableQuantity(order: OrderSpec): bigint {
    const opposing = order.side === 'BUY' ? this.asks : this.bids;
    let matchable = 0n;

    for (const maker of opposing) {
      const canMatch = order.side === 'BUY'
        ? order.price >= maker.price
        : order.price <= maker.price;

      if (!canMatch) break;
      const makerAvail = maker.quantity - maker.filledQuantity;
      matchable += makerAvail;
      if (matchable >= order.quantity) break;
    }

    return matchable;
  }

  private insertRestingOrder(order: OrderSpec): void {
    const queue = order.side === 'BUY' ? this.bids : this.asks;

    // Binary search insertion index
    let low = 0;
    let high = queue.length;

    while (low < high) {
      const mid = (low + high) >> 1;
      const other = queue[mid];

      let isBefore: boolean;
      if (order.side === 'BUY') {
        // Higher price first, earlier timestamp first
        isBefore = order.price > other.price || (order.price === other.price && order.timestamp < other.timestamp);
      } else {
        // Lower price first, earlier timestamp first
        isBefore = order.price < other.price || (order.price === other.price && order.timestamp < other.timestamp);
      }

      if (isBefore) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }

    queue.splice(low, 0, order);
  }

  private aggregateLevels(queue: OrderSpec[], maxLevels: number): PriceLevel[] {
    const levels: PriceLevel[] = [];
    const levelMap = new Map<bigint, { quantity: bigint; orderCount: number }>();

    for (const order of queue) {
      const remaining = order.quantity - order.filledQuantity;
      const existing = levelMap.get(order.price);
      if (existing) {
        existing.quantity += remaining;
        existing.orderCount++;
      } else {
        if (levelMap.size >= maxLevels) continue;
        levelMap.set(order.price, { quantity: remaining, orderCount: 1 });
      }
    }

    for (const [price, data] of levelMap.entries()) {
      levels.push({
        price,
        quantity: data.quantity,
        orderCount: data.orderCount,
      });
    }

    return levels;
  }
}
