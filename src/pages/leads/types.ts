export type Category = { id: string; name: string }
export type Stage = { id: string; name: string; sort_order: number; is_followup: boolean; is_won: boolean; is_lost: boolean }
export type Product = { id: string; name: string; description?: string | null; is_active: boolean }
export type ProductPrice = { id: string; product_id: string; category_id: string | null; price: number; billing_type: 'one-time' | 'monthly' | 'yearly'; currency: string }
export type Lead = {
  id: string; company_name: string; contact_person: string | null; phone: string | null;
  email: string | null; address: string | null; category_id: string | null;
  existing_website: string | null; social_media: Record<string, string>;
  stage_id: string; next_follow_up_date: string | null; source: string | null; lead_direction: 'outbound' | 'inbound';
  notes: string | null; owner_id: string; created_at: string; updated_at: string;
}
export type Activity = { id: string; lead_id: string; type: string; outcome: string | null; notes: string | null; created_by: string; created_at: string }

