interface GuideAvatarProps {
  caption: string | null;
  isSpeaking: boolean;
  onSilence: () => void;
  onDisableLine: () => void;
}

export function GuideAvatar({
  caption,
  isSpeaking,
  onSilence,
  onDisableLine
}: GuideAvatarProps): JSX.Element | null {
  if (!caption) {
    return null;
  }

  return (
    <div className="guide-avatar" aria-live="polite">
      <div className={isSpeaking ? "guide-avatar-face speaking" : "guide-avatar-face"}>
        <span className="guide-eye left" />
        <span className="guide-eye right" />
        <span className="guide-mouth" />
      </div>
      <div className="guide-caption">
        <span className="eyebrow">Guide</span>
        <p>{caption}</p>
        <div className="guide-caption-actions">
          <button className="guide-caption-button" onClick={onDisableLine} type="button">
            Don&apos;t say this line again
          </button>
          <button className="guide-caption-button" onClick={onSilence} type="button">
            Be silent
          </button>
        </div>
      </div>
    </div>
  );
}
