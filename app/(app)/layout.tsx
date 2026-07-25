import BackButton from '@/components/BackButton'
import CheckinButton from '@/components/CheckinButton'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BackButton />
      <CheckinButton />
      {children}
    </>
  )
}
