import { SnowmanPlay } from './SnowmanPlay.js';
import type { SnowmanDocument } from '../shared/snowman/document.js';
import type { TimedAction } from '../shared/snowman/engine.js';
import { useMemo } from 'react';
import { validateCreative, type CreativeDocument } from '../shared/creative.js';
import type { Location } from '../shared/adventure/document.js';
import { Play } from './Play.js';
import { AdventurePlay } from './AdventurePlay.js';
export function DocumentPlay({
  document,
  from,
  userId,
  onLocation,
  onSnowWin,
}: {
  onSnowWin?: (actions: TimedAction[]) => void;
  document: CreativeDocument;
  from?: Location;
  userId?: string;
  onLocation?: (location: Location | null) => void;
}) {
  const playable = useMemo(
    () => (document.schemaVersion === 2 && from ? { ...document, start: from } : document),
    [document, from],
  );
  try {
    const validated = validateCreative(playable, true);
    return playable.schemaVersion === 3 ? (
      <SnowmanPlay
        key={JSON.stringify(validated)}
        document={validated as SnowmanDocument}
        onWin={onSnowWin}
      />
    ) : playable.schemaVersion === 2 ? (
      <AdventurePlay document={playable} from={from} userId={userId} onLocation={onLocation} />
    ) : (
      <Play document={playable} />
    );
  } catch (error) {
    return (
      <p role="alert" className="error">
        {error instanceof Error ? error.message : '作品暂时无法试玩'}
      </p>
    );
  }
}
