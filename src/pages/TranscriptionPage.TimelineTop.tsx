import '../styles/transcription-timeline.css';
import type { ComponentProps } from 'react';
import { SearchReplaceOverlay } from '../components/SearchReplaceOverlay';
import { TimelineHeaderSection } from '../components/transcription/TranscriptionTimelineSections';
import { TimelineAxisStatusStrip } from '../components/transcription/TimelineAxisStatusStrip';
import type { TimelineAxisStatusStripProps } from '../components/transcription/TimelineAxisStatusStrip';

type TimelineHeaderProps = ComponentProps<typeof TimelineHeaderSection>;
type SearchOverlayProps = ComponentProps<typeof SearchReplaceOverlay>;

export interface TranscriptionPageTimelineTopProps {
  headerProps: TimelineHeaderProps;
  showSearch: boolean;
  searchProps: SearchOverlayProps;
  /** ADR-0004 阶段 7A：时间轴媒体 / 逻辑轴状态条；缺省不渲染。 */
  axisStatus?: TimelineAxisStatusStripProps | null;
}

export function TranscriptionPageTimelineTop({
  headerProps,
  showSearch,
  searchProps,
  axisStatus,
}: TranscriptionPageTimelineTopProps) {
  return (
    <>
      {axisStatus ? <TimelineAxisStatusStrip {...axisStatus} /> : null}
      <TimelineHeaderSection {...headerProps} />
      {showSearch && <SearchReplaceOverlay {...searchProps} />}
    </>
  );
}
