import { IconSparkle } from '../common/Icons';

/**
 * Placeholder shown from the moment a prompt is sent until the first token
 * arrives. It fades in after a short delay so fast responses never flash it.
 */
export function ThinkingIndicator({ label = 'Thinking' }: { label?: string }) {
  return (
    <div className="msg msg--assistant">
      <div className="msg__avatar">
        <IconSparkle size={13} />
      </div>
      <div className="thinking">
        <span className="thinking__label">{label}</span>
        <span className="thinking__steps" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </div>
    </div>
  );
}



