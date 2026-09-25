import type { DashboardData } from "./types";

const FILES = [
  "manifest.json",
  "monthly_summary.json",
  "monthly_powertrain.json",
  "monthly_make.json",
  "monthly_model.json",
  "monthly_make_powertrain.json",
  "monthly_model_powertrain.json",
  "scope_make.json",
  "scope_model.json",
  "scope_make_powertrain.json",
  "scope_model_powertrain.json",
  "scope_vehicle_age.json",
  "monthly_previous_country.json",
  "monthly_import_age.json",
] as const;

export async function loadData(baseUrl: string): Promise<DashboardData> {
  const [
    manifest,
    summary,
    powertrain,
    makes,
    models,
    makePowertrains,
    modelPowertrains,
    scopeMakes,
    scopeModels,
    scopeMakePowertrains,
    scopeModelPowertrains,
    fleetAges,
    monthlyPreviousCountry,
    monthlyImportAge,
  ] = await Promise.all(
    FILES.map((file) => fetch(`${baseUrl}data/${file}`).then((response) => {
      if (!response.ok) throw new Error(file);
      return response.json();
    })),
  );

  return {
    manifest,
    summary,
    powertrain,
    makes,
    models,
    makePowertrains,
    modelPowertrains,
    scopeMakes,
    scopeModels,
    scopeMakePowertrains,
    scopeModelPowertrains,
    countries: monthlyPreviousCountry,
    ages: monthlyImportAge,
    fleetAges,
  };
}
