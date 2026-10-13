import { getSession } from '@/lib/auth';
import { LoginScreen, Workspace } from '@/app/workspace';

export default async function Home() {
  const user = await getSession();
  if (!user) return <LoginScreen />;
  return <Workspace user={user} />;
}
