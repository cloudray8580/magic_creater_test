import { useMemo } from 'react';
import { validateCreative, type CreativeDocument } from '../shared/creative.js';
import type { Location } from '../shared/adventure/document.js';
import { Play } from './Play.js';
import { AdventurePlay } from './AdventurePlay.js';
export function DocumentPlay({ document, from }: { document: CreativeDocument; from?: Location }) {
  const playable = useMemo(
    () => (document.schemaVersion === 2 && from ? { ...document, start: from } : document),
    [document, from],
  );
  try {
    validateCreative(playable, true);
    return playable.schemaVersion === 2 ? (
      <AdventurePlay document={playable} from={from} />
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
