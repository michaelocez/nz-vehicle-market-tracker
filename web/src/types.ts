export type Range = "5y" | "10y" | "all";
export type VehicleView = "latest" | "snapshot";
export type LeaderboardPowertrain = "all" | "combustion" | "hybrid" | "bev" | "phev" | "other";

export type CountRecord = {
  registration_month: string;
  registration_count: number;
};

export type SummaryRecord = CountRecord & {
  import_status_group: string;
};

export type PowertrainRecord = SummaryRecord & {
  powertrain_group: string;
};

export type MakeRecord = SummaryRecord & {
  make: string;
  brand: string;
  brand_country: string;
  rank: number;
};

export type ModelRecord = SummaryRecord & {
  make: string;
  model: string;
  rank: number;
};

export type ScopeMakeRecord = {
  import_status_group: string;
  make: string;
  brand: string;
  brand_country: string;
  vehicle_count: number;
};

export type ScopeModelRecord = {
  import_status_group: string;
  make: string;
  model: string;
  vehicle_count: number;
};

export type MakePowertrainRecord = CountRecord & {
  powertrain_group: string;
  make: string;
  brand: string;
  brand_country: string;
  rank: number;
};

export type ModelPowertrainRecord = CountRecord & {
  powertrain_group: string;
  make: string;
  model: string;
  rank: number;
};

export type ScopeMakePowertrainRecord = {
  powertrain_group: string;
  make: string;
  brand: string;
  brand_country: string;
  vehicle_count: number;
  rank: number;
};

export type ScopeModelPowertrainRecord = {
  powertrain_group: string;
  make: string;
  model: string;
  vehicle_count: number;
  rank: number;
};

export type CountryRecord = CountRecord & {
  previous_country: string;
};

export type AgeRecord = CountRecord & {
  approximate_import_age: number;
};

export type FleetAgeRecord = {
  approximate_current_age: number;
  vehicle_count: number;
};

export type MonthChange = {
  delta: number;
  rate: number | null;
};

export type DataFile<T> = {
  contract_version: string;
  snapshot_month: string;
  records: T[];
};

export type Manifest = {
  contract: {
    version: string;
    scope?: {
      vehicle_type: string;
      classes: string[];
    };
  };
  source: {
    snapshot_month: string;
  };
  generated_at_utc: string;
  quality: {
    included_rows: number;
    mapped_brand_rows: number;
    current_fleet_age_rows?: number;
  };
  brand_coverage: {
    mapped_share: number;
  };
};

export type DashboardData = {
  manifest: Manifest;
  summary: DataFile<SummaryRecord>;
  powertrain: DataFile<PowertrainRecord>;
  makes: DataFile<MakeRecord>;
  models: DataFile<ModelRecord>;
  makePowertrains: DataFile<MakePowertrainRecord>;
  modelPowertrains: DataFile<ModelPowertrainRecord>;
  scopeMakes: DataFile<ScopeMakeRecord>;
  scopeModels: DataFile<ScopeModelRecord>;
  scopeMakePowertrains: DataFile<ScopeMakePowertrainRecord>;
  scopeModelPowertrains: DataFile<ScopeModelPowertrainRecord>;
  countries: DataFile<CountryRecord>;
  ages: DataFile<AgeRecord>;
  fleetAges: DataFile<FleetAgeRecord>;
};

export type DashboardView = {
  latest: string;
  previousMonth: string | null;
  nzNew: number;
  used: number;
  latestTotal: number;
  latestTotalChange: MonthChange | null;
  annual: Array<{ year: number; nz_new: number; used_import: number }>;
  annualMax: number;
  powertrains: Array<{ name: string; value: number }>;
  powertrainChanges: Map<string, MonthChange | null>;
  powertrainMax: number;
  arrivalMix: Array<{
    name: string;
    total: number;
    nzNew: number;
    used: number;
    other: number;
  }>;
  topMakes: Array<
    | MakeRecord
    | MakePowertrainRecord
    | (ScopeMakeRecord & { rank: number; registration_count: number })
    | (ScopeMakePowertrainRecord & { registration_count: number })
  >;
  topModels: Array<
    | ModelRecord
    | ModelPowertrainRecord
    | (ScopeModelRecord & { rank: number; registration_count: number })
    | (ScopeModelPowertrainRecord & { registration_count: number })
  >;
  ageBuckets: Array<{ label: string; value: number }>;
  ageMax: number;
  makeChanges: Map<string, MonthChange | null>;
  modelChanges: Map<string, MonthChange | null>;
  medianAge: number;
  electric: number;
  vehicleTotal: number;
  vehicleLabel: string;
  rankingContext: string;
};

export type VehicleExplorerData = {
  make: string;
  model: string;
  makeRecord: ScopeMakeRecord | undefined;
  mappedMakeOptions: ScopeMakeRecord[];
  unmappedMakeOptions: ScopeMakeRecord[];
  modelOptions: ScopeModelRecord[];
  total: number;
  nzNew: number;
  used: number;
  other: number;
};
