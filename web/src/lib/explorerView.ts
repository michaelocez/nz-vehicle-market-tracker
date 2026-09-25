import type { DashboardData } from "./types";
import { makeOptionLabel } from "./utils";

export interface ExplorerView {
  make: string;
  model: string;
  makeRecord: { brand: string; brand_country: string } | undefined;
  mappedMakeOptions: Array<{ make: string; brand: string; brand_country: string }>;
  unmappedMakeOptions: Array<{ make: string; brand: string; brand_country: string }>;
  modelOptions: Array<{ model: string; make: string }>;
  total: number;
  nzNew: number;
  used: number;
  other: number;
}

export function computeExplorer(
  data: DashboardData,
  selectedMake: string,
  selectedModel: string,
): ExplorerView {
  const makeRecords = data.scopeMakes.records.filter((row) => row.import_status_group === "all");
  const defaultMake = [...makeRecords].sort((a, b) => b.vehicle_count - a.vehicle_count)[0];
  const makeOptions = makeRecords.sort((a, b) =>
    makeOptionLabel(a.make, a.brand).localeCompare(makeOptionLabel(b.make, b.brand)),
  );
  const mappedMakeOptions = makeOptions.filter((row) => row.brand_country !== "Unmapped");
  const unmappedMakeOptions = makeOptions.filter((row) => row.brand_country === "Unmapped");
  const make = selectedMake || defaultMake?.make || "";
  const makeRecord = makeOptions.find((row) => row.make === make);
  const modelOptions = data.scopeModels.records
    .filter((row) => row.import_status_group === "all" && row.make === make)
    .sort((a, b) => a.model.localeCompare(b.model));
  const model =
    selectedModel && modelOptions.some((row) => row.model === selectedModel) ? selectedModel : "";
  const records = model
    ? data.scopeModels.records.filter((row) => row.make === make && row.model === model)
    : data.scopeMakes.records.filter((row) => row.make === make);
  const countFor = (status: string) =>
    records.find((row) => row.import_status_group === status)?.vehicle_count ?? 0;
  return {
    make,
    model,
    makeRecord,
    mappedMakeOptions,
    unmappedMakeOptions,
    modelOptions,
    total: countFor("all"),
    nzNew: countFor("nz_new"),
    used: countFor("used_import"),
    other: countFor("other_or_unknown"),
  };
}
