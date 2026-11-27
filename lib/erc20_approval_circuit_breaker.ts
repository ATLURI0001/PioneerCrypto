// erc20_approval_circuit_breaker.ts – circuit breaker for ERC20 approval spikes
let failures = 0;
const THRESHOLD = 5;
let open = false;

export function recordApprovalFailure(): void {
  failures++;
  if (failures >= THRESHOLD) open = true;
}

export function isOpen(): boolean { return open; }

export function reset(): void { failures = 0; open = false; }
