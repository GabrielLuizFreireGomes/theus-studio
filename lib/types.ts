export type Service = {
  id: string;
  name: string;
  description: string;
  duration: number;
  price: number;
  is_cut: boolean;
  active: boolean;
};

export type Hours = {
  weekday: number;
  opens: number;
  closes: number;
  break_start: number | null;
  break_end: number | null;
};

export type Customer = {
  id: string;
  email: string;
  name: string;
  progress: number;
  plan_start: string | null;
  plan_end: string | null;
  plan_paid_amount?: number | null;
  contact_email?: string | null;
  plan_requested_at?: string | null;
};

export type Reward = { id: string; percent: 50 | 100 };
export type Quote = {
  price: number;
  total: number;
  covered: boolean;
  rewardId: string | null;
  rewards: Reward[];
  promotion?: { title: string; percent: number };
};

export type Appointment = {
  id: string;
  kind: 'booking' | 'block';
  status: 'scheduled' | 'cancelled' | 'completed';
  starts_at: string;
  ends_at: string;
  customer_id: string | null;
  service_id: string | null;
  customer_name?: string | null;
  title: string;
  price: number | null;
  total: number | null;
  covered: boolean;
  is_cut: boolean;
};

export type Payment = { id: string; amount: number; paid_at: string; period_start: string; period_end: string };
export type Plan = { plan_enabled: boolean; plan_name: string; plan_description: string; plan_price: number };
export type Campaign = {
  id: string; title: string; description: string; kind: 'discount' | 'loyalty' | 'subscription';
  percent: number | null; service_id: string | null; starts_at: string; ends_at: string; notify: boolean; enabled: boolean;
};
export type Account = { customer: Customer | null; bookings: Appointment[]; goal: 5 | 10 | null; rewards: Reward[]; plan: Plan };
