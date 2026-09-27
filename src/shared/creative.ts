import { LIMITS, validateDocument, ValidationError, type GameDocument } from './game.js';
import {
  validateAdventure,
  AdventureValidationError,
  type AdventureDocument,
} from './adventure/document.js';
export type CreativeDocument = GameDocument | AdventureDocument;
export const DOCUMENT_BYTES = 1024 * 1024;
export function validateCreative(value: AdventureDocument, playable?: boolean): AdventureDocument;
export function validateCreative(value: unknown, playable?: boolean): CreativeDocument;
export function validateCreative(value: unknown, playable = false): CreativeDocument {
  const adventure = Boolean(
    value && typeof value === 'object' && 'schemaVersion' in value && value.schemaVersion === 2,
  );
  let encoded: string | undefined;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new ValidationError('作品格式无效，不能包含循环引用');
  }
  if (new TextEncoder().encode(encoded).length > (adventure ? DOCUMENT_BYTES : LIMITS.bodyBytes))
    throw new ValidationError('作品容量超出限制，请减少文字或物体');
  if (!adventure) return validateDocument(value, playable);
  try {
    return validateAdventure(value, playable);
  } catch (error) {
    if (error instanceof AdventureValidationError) throw new ValidationError(error.message);
    throw error;
  }
}
