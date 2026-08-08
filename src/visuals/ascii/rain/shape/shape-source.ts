import type { ShapeSource } from './shape-types';
import { createTextSource } from './sources/text-source';
import { createFaceSource } from './sources/face-source';
import { createHandSource } from './sources/hand-source';

export { createTextSource, createFaceSource, createHandSource };

export function getShapeSource(
  type: 'text' | 'face' | 'hand',
  label = 'NODE 07',
  cols = 60,
  rows = 40
): ShapeSource {
  switch (type) {
    case 'text':
      return createTextSource(label, cols, rows);
    case 'face':
      return createFaceSource(cols, rows);
    case 'hand':
      return createHandSource(cols, rows);
  }
}
