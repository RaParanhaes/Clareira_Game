// Preserve fractional time: timer callbacks are not an exact 20 Hz clock.
export function simulationBudget(remainder, elapsed) {
  const accumulated=remainder+Math.max(0,Math.min(.25,elapsed));
  const steps=Math.floor((accumulated+1e-10)*60);
  return {steps,remainder:Math.max(0,accumulated-steps/60)};
}
