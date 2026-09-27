import { useEffect, useState } from 'react';
import { composeCharacter } from './character.js';
import type { AdventureDocument } from '../shared/adventure/document.js';
export function HeroPreview({ url, hero }: { url?: string; hero: AdventureDocument['hero'] }) {
  const [picture, setPicture] = useState('');
  useEffect(() => {
    setPicture('');
    if (!url) return;
    let alive = true;
    const image = new Image();
    image.onload = () => {
      if (alive)
        setPicture(composeCharacter(image, hero.tint, hero.accessory).toDataURL('image/png'));
    };
    image.src = url;
    return () => {
      alive = false;
    };
  }, [url, hero.tint, hero.accessory]);
  return (
    <div className="hero-preview">
      {picture ? <img src={picture} alt="主角外观预览" /> : <span>正在准备主角…</span>}
    </div>
  );
}
