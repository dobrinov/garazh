// Typed wrappers around the Rust commands. Field names match src-tauri/src/model.rs.
import { invoke } from "@tauri-apps/api/core";

export type Money = string; // "52.00"

export interface AppConfig {
  dataDir: string | null;
  backupDir: string | null;
  backupDaily: boolean;
  backupKeep: number;
  lastBackup: string | null;
}

export interface Loaded<T> {
  data: T;
  notes: string;
  dir: string;
  hash: string;
}

export interface Shop {
  schema: number;
  name: string;
  phone: string;
  address: string;
  eik: string;
  laborRate: Money;
  vatPercent: number;
  vatRegistered: boolean;
  counters: { client: number; workOrder: number };
  features: Record<string, boolean>;
  [extra: string]: unknown;
}

export interface Client {
  id: string;
  number: number;
  name: string;
  kind: string; // "частно" | "фирма"
  phone: string;
  email: string;
  eik: string;
  address: string;
  viber: boolean;
  gdprConsent: string | null;
  discountPercent: number;
  created: string;
  [extra: string]: unknown;
}

export interface Car {
  id: string;
  clientId: string;
  plate: string;
  vin: string;
  make: string;
  model: string;
  year: number | null;
  engine: string;
  engineCode: string;
  gearbox: string;
  gearboxCode: string;
  fuel: string;
  color: string;
  paintCode: string;
  tyres: string;
  inspectionUntil: string | null;
  insuranceUntil: string | null;
  vignetteUntil: string | null;
  manualFields: string[];
  pastOwners: string[];
  [extra: string]: unknown;
}

export interface LaborLine {
  description: string;
  mechanic: string;
  hours: number;
  rate: Money;
}

export interface PartLine {
  part: string;
  partNumber: string;
  quantity: number;
  unit: string;
  price: Money;
}

export type OrderStatus = "приета" | "диагностика" | "чака_части" | "в_ремонт" | "готова" | "предадена";

export interface WorkOrder {
  id: string;
  number: string;
  clientId: string;
  carId: string;
  date: string;
  title: string;
  status: OrderStatus | string;
  mileage: number | null;
  fuelLevel: string;
  complaint: string;
  mechanic: string;
  labor: LaborLine[];
  parts: PartLine[];
  discountPercent: number;
  vatPercent: number;
  payment: string;
  paid: boolean;
  closedOn: string | null;
  historyWritten: boolean;
  [extra: string]: unknown;
}

export interface Totals {
  labor: Money;
  parts: Money;
  discount: Money;
  net: Money;
  vat: Money;
  total: Money;
}

export interface Reading {
  date: string;
  km: number;
  source: string;
}

export interface PartRow {
  date: string;
  km: number | null;
  part: string;
  brand: string;
  quantity: string;
  price: string;
  order: string;
}

export interface Period {
  from: string;
  to: string;
  km: number;
  days: number;
  perDay: number;
}

export interface Usage {
  lastKm: number | null;
  lastDate: string | null;
  recentPerDay: number | null;
  averagePerDay: number | null;
  recentPerMonth: number | null;
  recentPerYear: number | null;
  averagePerMonth: number | null;
  changePercent: number | null;
  periods: Period[];
  warnings: string[];
}

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  modified: string | null;
}

export interface Deadline {
  kind: string;
  label: string;
  date: string;
  days: number;
}

export interface CarRef {
  id: string;
  plate: string;
  make: string;
  model: string;
}

export interface ClientSummary {
  client: Client;
  cars: CarRef[];
  lastVisit: string | null;
  turnover: Money;
  unpaid: Money;
  openOrders: number;
}

export interface CarSummary {
  car: Car;
  ownerName: string;
  usage: Usage;
  lastVisit: string | null;
  openOrder: string | null;
  deadlines: Deadline[];
}

export interface OrderSummary {
  order: WorkOrder;
  totals: Totals;
  plate: string;
  carName: string;
  clientName: string;
}

export interface ClientDetail {
  client: Loaded<Client>;
  cars: CarSummary[];
  orders: OrderSummary[];
  turnover: Money;
  unpaid: Money;
}

export interface CarDetail {
  car: Loaded<Car>;
  owner: Client;
  readings: Reading[];
  usage: Usage;
  parts: PartRow[];
  orders: OrderSummary[];
  documents: FileInfo[];
  deadlines: Deadline[];
}

export interface OrderDetail {
  order: Loaded<WorkOrder>;
  totals: Totals;
  car: Car;
  client: Client;
  files: FileInfo[];
  carKm: number | null;
  carUsage: Usage;
}

export interface Problem {
  path: string;
  message: string;
}

export interface Dashboard {
  inShop: OrderSummary[];
  deadlines: {
    carId: string;
    plate: string;
    carName: string;
    clientId: string;
    clientName: string;
    deadline: Deadline;
  }[];
  clients: number;
  cars: number;
  monthTurnover: Money;
  unpaid: Money;
  problems: Problem[];
}

export interface SaveInput<T> {
  data: T;
  notes: string;
  baseHash: string | null;
}

export interface ApiError {
  code: string;
  message: string;
}

export function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as ApiError).message);
  return String(e);
}

export function isConflict(e: unknown): boolean {
  return !!e && typeof e === "object" && (e as ApiError).code === "conflict";
}

export const api = {
  appConfig: () => invoke<AppConfig>("app_config"),
  setDataDir: (path: string) => invoke<AppConfig>("set_data_dir", { path }),
  setBackup: (dir: string | null, daily: boolean, keep: number) => invoke<AppConfig>("set_backup", { dir, daily, keep }),
  backupNow: () => invoke<string>("backup_now"),
  openPath: (path: string) => invoke<void>("open_path", { path }),
  revealPath: (path: string) => invoke<void>("reveal_path", { path }),
  recordDir: (kind: "client" | "car" | "order" | "root", id = "") => invoke<string>("record_dir", { kind, id }),

  getShop: () => invoke<Loaded<Shop>>("get_shop"),
  saveShop: (input: SaveInput<Shop>) => invoke<Loaded<Shop>>("save_shop", { input }),

  dashboard: () => invoke<Dashboard>("dashboard"),
  listClients: () => invoke<ClientSummary[]>("list_clients"),
  listCars: () => invoke<CarSummary[]>("list_cars"),
  listOrders: () => invoke<OrderSummary[]>("list_orders"),

  getClient: (id: string) => invoke<ClientDetail>("get_client", { id }),
  saveClient: (input: SaveInput<Client>) => invoke<Loaded<Client>>("save_client", { input }),

  getCar: (id: string) => invoke<CarDetail>("get_car", { id }),
  saveCar: (input: SaveInput<Car>) => invoke<Loaded<Car>>("save_car", { input }),
  addReading: (carId: string, reading: Reading) => invoke<void>("add_reading", { carId, reading }),
  addParts: (carId: string, rows: PartRow[]) => invoke<void>("add_parts", { carId, rows }),

  getOrder: (id: string) => invoke<OrderDetail>("get_order", { id }),
  saveOrder: (input: SaveInput<WorkOrder>) => invoke<Loaded<WorkOrder>>("save_order", { input }),
  closeOrder: (id: string) => invoke<Loaded<WorkOrder>>("close_order", { id }),

  attachFiles: (target: "car" | "order", id: string, paths: string[]) =>
    invoke<FileInfo[]>("attach_files", { target, id, paths }),
};

export function emptyClient(): Client {
  return {
    id: "",
    number: 0,
    name: "",
    kind: "частно",
    phone: "",
    email: "",
    eik: "",
    address: "",
    viber: true,
    gdprConsent: null,
    discountPercent: 0,
    created: "",
  };
}

export function emptyCar(clientId: string): Car {
  return {
    id: "",
    clientId,
    plate: "",
    vin: "",
    make: "",
    model: "",
    year: null,
    engine: "",
    engineCode: "",
    gearbox: "",
    gearboxCode: "",
    fuel: "",
    color: "",
    paintCode: "",
    tyres: "",
    inspectionUntil: null,
    insuranceUntil: null,
    vignetteUntil: null,
    manualFields: [],
    pastOwners: [],
  };
}

export function emptyOrder(carId: string): WorkOrder {
  return {
    id: "",
    number: "",
    clientId: "",
    carId,
    date: "",
    title: "",
    status: "приета",
    mileage: null,
    fuelLevel: "",
    complaint: "",
    mechanic: "",
    labor: [],
    parts: [],
    discountPercent: 0,
    vatPercent: 0,
    payment: "",
    paid: false,
    closedOn: null,
    historyWritten: false,
  };
}
