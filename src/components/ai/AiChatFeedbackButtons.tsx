import { JieyuIcon } from '../ui/JieyuIcon';
import { JIEYU_ICON_INLINE_TIGHT } from '../../utils/jieyuIcon';

export interface AiChatFeedbackButtonsProps {
  messageId: string;
  rated: 'thumbs_up' | 'thumbs_down' | null;
  onRate: (messageId: string, rating: 'thumbs_up' | 'thumbs_down') => void;
}

/**
 * PR-16: 👍/👎 反馈按钮（轻量，仅记录本地状态）
 */
export function AiChatFeedbackButtons({ messageId, rated, onRate }: AiChatFeedbackButtonsProps) {
  return (
    <span className="ai-chat-feedback-buttons" aria-label="feedback">
      <button
        type="button"
        className={`ai-chat-message-action-btn ai-chat-feedback-btn ${rated === 'thumbs_up' ? 'is-active' : ''}`}
        aria-label="thumbs up"
        title="thumbs up"
        onClick={() => onRate(messageId, 'thumbs_up')}
      >
        <JieyuIcon
          name={rated === 'thumbs_up' ? 'ThumbsUp' : 'ThumbsUp'}
          className={JIEYU_ICON_INLINE_TIGHT}
        />
      </button>
      <button
        type="button"
        className={`ai-chat-message-action-btn ai-chat-feedback-btn ${rated === 'thumbs_down' ? 'is-active' : ''}`}
        aria-label="thumbs down"
        title="thumbs down"
        onClick={() => onRate(messageId, 'thumbs_down')}
      >
        <JieyuIcon
          name={rated === 'thumbs_down' ? 'ThumbsDown' : 'ThumbsDown'}
          className={JIEYU_ICON_INLINE_TIGHT}
        />
      </button>
    </span>
  );
}
