import "server-only";

declare global {
  var __kathaquestForceFailure: boolean | undefined;
}

export function armElevenLabsFailure(): void {
  globalThis.__kathaquestForceFailure = true;
}

export function consumeElevenLabsFailure(): boolean {
  const armed = globalThis.__kathaquestForceFailure === true;
  globalThis.__kathaquestForceFailure = false;
  return armed;
}

export function isElevenLabsFailureArmed(): boolean {
  return globalThis.__kathaquestForceFailure === true;
}
