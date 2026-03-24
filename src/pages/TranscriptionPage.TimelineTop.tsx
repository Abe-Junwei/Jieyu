import type { ComponentProps } from 'react';
import { SearchReplaceOverlay } from '../components/SearchReplaceOverlay';
import { TimelineHeaderSection } from '../components/transcription/TranscriptionTimelineSections';

type TimelineHeaderProps = ComponentProps<typeof TimelineHeaderSection>;
type SearchOverlayProps = ComponentProps<typeof SearchReplaceOverlay>;

interface TranscriptionPageTimelineTopProps {
  headerProps: TimelineHeaderProps;
  showSearch: boolean;
  searchProps: SearchOverlayProps;
}

export function TranscriptionPageTimelineTop({
  headerProps,
  showSearch,
  searchProps,
}: TranscriptionPageTimelineTopProps) {
  return (
    <>
      <TimelineHeaderSection {...headerProps} />
      {showSearch && <SearchReplaceOverlay {...searchProps} />}
    </>
  );
}
