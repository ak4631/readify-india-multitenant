type LaunchPlan = {
  isFlexible: boolean;
  durationUnit: string;
  durationValue: number;
  dailyHours: number | null;
  dailyStart: string | null;
};

export function launchPlansReady(plans: LaunchPlan[]) {
  return (
    plans.some((plan) => plan.isFlexible && !!plan.dailyHours) &&
    [
      ["MONTHS", 1],
      ["MONTHS", 3],
      ["YEARS", 1],
    ].every(([unit, value]) =>
      plans.some(
        (plan) =>
          !plan.isFlexible &&
          plan.durationUnit === unit &&
          plan.durationValue === value &&
          !!plan.dailyHours &&
          !!plan.dailyStart,
      ),
    )
  );
}
