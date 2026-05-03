import { SharePageClient } from "./share-page-client";

interface ShareTokenPageProps {
  params: Promise<{
    token: string;
  }>;
}

export default async function ShareTokenPage({ params }: ShareTokenPageProps) {
  const { token } = await params;
  return <SharePageClient token={token} />;
}
