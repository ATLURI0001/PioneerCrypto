import { isValidAddress } from './crypto.ts';

export interface VestingSchedule {
  id: string;
  beneficiary: string;
  totalAmount: bigint;
  releasedAmount: bigint;
  startSec: bigint;
  cliffSec: bigint;
  durationSec: bigint;
  revocable: boolean;
  revoked: boolean;
}

export interface CreateScheduleParams {
  beneficiary: string;
  totalAmount: bigint | number | string;
  startSec: bigint | number;
  cliffDurationSec: bigint | number;
  durationSec: bigint | number;
  revocable?: boolean;
}

/**
 * Token Vesting Schedule and Linear Cliff Escrow Engine.
 * Supports linear token streaming, cliff locking, partial releases, and owner revocations.
 */
export class VestingEscrowEngine {
  private schedules: Map<string, VestingSchedule>;
  private counter: number;

  constructor() {
    this.schedules = new Map();
    this.counter = 0;
  }

  /**
   * Creates and registers a new linear vesting schedule with optional cliff.
   */
  public createSchedule(params: CreateScheduleParams): VestingSchedule {
    const beneficiary = String(params.beneficiary || '').trim();
    if (!isValidAddress(beneficiary)) {
      throw new Error(`Invalid beneficiary Ethereum address: '${params.beneficiary}'`);
    }

    const totalAmount = BigInt(params.totalAmount);
    if (totalAmount <= 0n) {
      throw new Error('Total vesting amount must be strictly greater than 0');
    }

    const startSec = BigInt(params.startSec);
    const cliffDurationSec = BigInt(params.cliffDurationSec);
    const durationSec = BigInt(params.durationSec);

    if (durationSec <= 0n) {
      throw new Error('Vesting duration must be strictly greater than 0');
    }
    if (cliffDurationSec < 0n || cliffDurationSec > durationSec) {
      throw new Error('Cliff duration cannot be negative or exceed total vesting duration');
    }

    this.counter++;
    const id = `vest_${beneficiary.slice(2, 10).toLowerCase()}_${this.counter}`;

    const schedule: VestingSchedule = {
      id,
      beneficiary: beneficiary.toLowerCase(),
      totalAmount,
      releasedAmount: 0n,
      startSec,
      cliffSec: cliffDurationSec,
      durationSec,
      revocable: Boolean(params.revocable),
      revoked: false,
    };

    this.schedules.set(id, schedule);
    return { ...schedule };
  }

  /**
   * Retrieves a schedule by unique ID.
   */
  public getSchedule(scheduleId: string): VestingSchedule {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Vesting schedule not found: '${scheduleId}'`);
    }
    return { ...schedule };
  }

  /**
   * Computes the cumulative vested amount at a specific timestamp.
   */
  public computeVestedAmount(scheduleId: string, currentTimeSec: bigint | number): bigint {
    const schedule = this.getSchedule(scheduleId);
    const time = BigInt(currentTimeSec);

    // Before cliff timestamp: zero tokens vested
    if (time < schedule.startSec + schedule.cliffSec) {
      return 0n;
    }

    // Past or at completion timestamp: 100% of tokens vested
    if (time >= schedule.startSec + schedule.durationSec) {
      return schedule.totalAmount;
    }

    // Linear vesting interval
    const elapsed = time - schedule.startSec;
    return (schedule.totalAmount * elapsed) / schedule.durationSec;
  }

  /**
   * Computes available unreleased tokens currently available for claim.
   */
  public computeReleasableAmount(scheduleId: string, currentTimeSec: bigint | number): bigint {
    const schedule = this.getSchedule(scheduleId);
    if (schedule.revoked) {
      return 0n;
    }
    const vested = this.computeVestedAmount(scheduleId, currentTimeSec);
    return vested > schedule.releasedAmount ? vested - schedule.releasedAmount : 0n;
  }

  /**
   * Releases currently available vested tokens to the beneficiary.
   */
  public release(scheduleId: string, currentTimeSec: bigint | number): { released: bigint; totalReleased: bigint } {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Vesting schedule not found: '${scheduleId}'`);
    }
    if (schedule.revoked) {
      throw new Error('Cannot release tokens from a revoked schedule');
    }

    const releasable = this.computeReleasableAmount(scheduleId, currentTimeSec);
    if (releasable <= 0n) {
      return { released: 0n, totalReleased: schedule.releasedAmount };
    }

    schedule.releasedAmount += releasable;
    return {
      released: releasable,
      totalReleased: schedule.releasedAmount,
    };
  }

  /**
   * Revokes a revocable schedule, claims accrued vested tokens to beneficiary, and returns remaining unvested.
   */
  public revoke(scheduleId: string, currentTimeSec: bigint | number): { vestedClaimed: bigint; unvestedRefund: bigint } {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Vesting schedule not found: '${scheduleId}'`);
    }
    if (!schedule.revocable) {
      throw new Error('Schedule is non-revocable');
    }
    if (schedule.revoked) {
      throw new Error('Schedule has already been revoked');
    }

    const vested = this.computeVestedAmount(scheduleId, currentTimeSec);
    const releasable = vested > schedule.releasedAmount ? vested - schedule.releasedAmount : 0n;
    schedule.releasedAmount += releasable;

    const unvestedRefund = schedule.totalAmount - vested;
    schedule.revoked = true;

    return {
      vestedClaimed: releasable,
      unvestedRefund: unvestedRefund > 0n ? unvestedRefund : 0n,
    };
  }
}
