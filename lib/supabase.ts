import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export const supabase = createClientComponentClient({
  options: {
    auth: {
      flowType: 'implicit',
    },
  },
})
