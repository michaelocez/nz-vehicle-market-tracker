import type { MonthChange } from "../types";
import {
  changeTone,
  number,
  prettyMonth,
  prettyMonthName,
  signedNumber,
  signedPercent,
} from "../utils/formatters";

export function MonthChangeIndicator({
  change,
  previousMonth,
  detailed = false,
}: {
  change: MonthChange | null;
  previousMonth: string | null;
  detailed?: boolean;
}) {
  if (!change || !previousMonth) return null;
  const comparisonMonth = prettyMonthName(previousMonth);
  const accessibleComparison =
    change.delta === 0
      ? `the same number of vehicles as ${prettyMonth(previousMonth)}`
      : `${number.format(Math.abs(change.delta))} ${change.delta > 0 ? "more" : "fewer"} vehicles than ${prettyMonth(previousMonth)}`;
  const detailedComparison =
    change.delta === 0
      ? `Same count as ${comparisonMonth}`
      : `${signedNumber(change.delta)} vehicles vs ${comparisonMonth}`;

  return (
    <span
      className={`month-change ${changeTone(change)}${detailed ? " detailed" : ""}`}
      aria-label={`${signedPercent(change)}, ${accessibleComparison}`}
    >
      <b>{signedPercent(change)}</b>
      <small>{detailed ? detailedComparison : `vs ${comparisonMonth}`}</small>
    </span>
  );
}
