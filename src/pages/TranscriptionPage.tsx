import { Suspense, lazy } from 'react';

interface TranscriptionPageProps {
  appSearchRequest?: import('../utils/appShellEvents').AppShellOpenSearchDetail | null;
  onConsumeAppSearchRequest?: () => void;
}

const TranscriptionPageOrchestrator = lazy(async () => import('./TranscriptionPage.Orchestrator').then((module) => ({
	default: module.TranscriptionPage,
})));

export function TranscriptionPage(props: TranscriptionPageProps) {
	return (
		<Suspense fallback={null}>
			<TranscriptionPageOrchestrator {...props} />
		</Suspense>
	);
}
