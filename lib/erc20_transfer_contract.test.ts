import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateErc20Transfer } from './erc20_transfer_contract.ts';

describe('ERC-20 transfer contract', () => {
  const alice = '0x1111111111111111111111111111111111111111';
  const bob = '0x2222222222222222222222222222222222222222';

  it('accepts valid transfer params', () => {
    assert.doesNotThrow(() =>
      validateErc20Transfer({ from: alice, to: bob, amount: 1000n, decimals: 18 })
    );
  });

  it('rejects zero address, self-transfer, and non-positive amount', () => {
    assert.throws(() =>
      validateErc20Transfer({ from: alice, to: '0x0000000000000000000000000000000000000000', amount: 10n })
    );
    assert.throws(() =>
      validateErc20Transfer({ from: alice, to: alice, amount: 10n })
    );
    assert.throws(() =>
      validateErc20Transfer({ from: alice, to: bob, amount: 0n })
    );
  });
});
