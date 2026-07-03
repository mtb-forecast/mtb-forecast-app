'use client'

import dynamic from 'next/dynamic'

const TrailMap = dynamic(() => import('@/components/TrailMap'), {
  ssr: false,
  loading: () => <div style={{ height: 250, borderRadius: 8, background: '#d4dcc9' }} />,
})

export default TrailMap
