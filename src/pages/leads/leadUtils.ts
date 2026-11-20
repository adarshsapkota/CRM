import { supabase } from '../../lib/supabase'
import type { Activity, Category, InterestLevel, Lead, Product, ProductPrice, Stage } from './types'

export const PAGE_SIZE = 10

export const interestLevels: { value: InterestLevel; label: string }[] = [
  { value: 'very_interested', label: 'Very interested' },
  { value: 'semi_interested', label: 'Semi interested' },
  { value: 'lightly_interested', label: 'Lightly interested' },
  { value: 'neutral', label: 'Neutral' },
]

export function interestLabel(level: InterestLevel | null | undefined) {
  return interestLevels.find((item) => item.value === level)?.label ?? 'Neutral'
}

export function interestSurface(level: InterestLevel | null | undefined) {
  switch (level) {
    case 'very_interested': return 'border-green-300 bg-green-100'
    case 'semi_interested': return 'border-yellow-300 bg-yellow-100'
    case 'lightly_interested': return 'border-yellow-200 bg-yellow-50'
    default: return 'border-slate-200 bg-white'
  }
}

export function interestBadge(level: InterestLevel | null | undefined) {
  switch (level) {
    case 'very_interested': return 'bg-green-200 text-green-900'
    case 'semi_interested': return 'bg-yellow-200 text-yellow-900'
    case 'lightly_interested': return 'bg-yellow-100 text-yellow-800'
    default: return 'bg-slate-100 text-slate-700'
  }
}

export async function loadLookups() {
  const [categories, stages, products] = await Promise.all([
    supabase.from('categories').select('id,name').order('name'),
    supabase.from('pipeline_stages').select('id,name,sort_order,is_followup,is_won,is_lost').order('sort_order'),
    supabase.from('products').select('id,name,is_active').eq('is_active', true).order('name'),
  ])
  const error = categories.error ?? stages.error ?? products.error
  if (error) throw error
  return {
    categories: (categories.data ?? []) as Category[],
    stages: (stages.data ?? []) as Stage[],
    products: (products.data ?? []) as Product[],
  }
}

export async function getLeadProducts(leadId: string) {
  const { data, error } = await supabase.from('lead_products').select('product_id').eq('lead_id', leadId)
  if (error) throw error
  return (data ?? []).map((row) => row.product_id as string)
}

export async function getProductPrices(productIds: string[], categoryId: string | null) {
  if (!productIds.length) return [] as ProductPrice[]
  const { data, error } = await supabase.from('product_prices').select('id,product_id,category_id,price,billing_type,currency').in('product_id', productIds)
  if (error) throw error
  const candidates = (data ?? []) as ProductPrice[]
  const output: ProductPrice[] = []
  for (const productId of productIds) {
    const matches = candidates.filter((price) => price.product_id === productId && (price.category_id === categoryId || price.category_id === null))
    const keys = [...new Set(matches.map((price) => `${price.billing_type}|${price.currency}`))]
    for (const key of keys) {
      const group = matches.filter((price) => `${price.billing_type}|${price.currency}` === key)
      const preferred = categoryId ? group.find((price) => price.category_id === categoryId) : undefined
      output.push(preferred ?? group.find((price) => price.category_id === null)!)
    }
  }
  return output
}

export function formatPrice(price: number | string, currency: string) {
  return `${currency} ${Number(price).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

export async function syncLeadProducts(leadId: string, productIds: string[]) {
  const current = await getLeadProducts(leadId)
  const remove = current.filter((id) => !productIds.includes(id))
  const add = productIds.filter((id) => !current.includes(id))
  if (remove.length) {
    const { error } = await supabase.from('lead_products').delete().eq('lead_id', leadId).in('product_id', remove)
    if (error) throw error
  }
  if (add.length) {
    const { error } = await supabase.from('lead_products').insert(add.map((product_id) => ({ lead_id: leadId, product_id })))
    if (error) throw error
  }
}

export async function getOwnedLead(leadId: string) {
  const { data, error } = await supabase.from('leads').select('*').eq('id', leadId).maybeSingle()
  if (error) throw error
  return data as Lead | null
}

export async function getLeadActivities(leadId: string) {
  const { data, error } = await supabase.from('activities').select('*').eq('lead_id', leadId).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Activity[]
}

export function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

