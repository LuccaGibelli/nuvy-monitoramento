import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://kdboegkwiqktxykbayeq.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_ZO9xxIfl-0ajPk6w_LYEJg_X1FEsjxk'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
