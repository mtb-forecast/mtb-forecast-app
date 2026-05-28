import BackButton from '@/components/BackButton'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BackButton />
      {children}
    </>
  )
}
